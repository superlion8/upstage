// @ts-nocheck
/**
 * Chat Streaming API
 * SSE endpoint for real-time agent responses (Claude only)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db, conversations, messages } from '../db/index.js';
import { eq, desc } from 'drizzle-orm';
import { runClaudeAgentStream, type ClaudeAgentInput, type ConversationMessage } from '../agent/orchestrator-claude.js';
import { config } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import fs from 'fs/promises';
import path from 'path';
import { assets as assetsTable } from '../db/schema.js';

const logger = createLogger('api:chat-stream');

// Log configuration on startup
logger.info('Chat stream initialized', {
  orchestrator: 'Claude',
  claudeModel: config.ai.claude?.model,
  hasAnthropicKey: !!config.ai.claude?.apiKey,
});

// ============================================
// Schemas
// ============================================

const streamMessageSchema = z.object({
  conversationId: z.string().uuid().optional(),
  conversation_id: z.string().uuid().optional(),
  text: z.string().optional(),
  images: z.array(z.object({
    id: z.string().optional(),
    data: z.string(),
    mimeType: z.string().optional(),
    mime_type: z.string().optional(),
  })).optional(),
}).transform(data => ({
  conversationId: data.conversationId || data.conversation_id,
  text: data.text,
  images: data.images?.map((img, i) => ({
    id: img.id || `img_${Date.now()}_${i}`,
    data: img.data,
    mimeType: img.mimeType || img.mime_type || 'image/jpeg',
  })),
}));

// ============================================
// SSE Helper
// ============================================

function sendSSE(reply: FastifyReply, event: string, data: any) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  reply.raw.write(payload);
}

/**
 * Save image to disk and return accessible URL
 */
async function persistImage(id: string, base64Data: string, userId: string): Promise<string> {
  if (!base64Data || !base64Data.startsWith('data:')) {
    return base64Data;
  }

  try {
    const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) return base64Data;

    const mimeType = matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    const extension = mimeType.split('/')[1] || 'jpg';

    const filename = `${id}.${extension}`;
    const uploadDir = path.join(process.cwd(), 'public/uploads');
    const filePath = path.join(uploadDir, filename);

    // Ensure directory exists
    await fs.mkdir(uploadDir, { recursive: true });
    await fs.writeFile(filePath, buffer);

    const publicUrl = `/api/chat/assets/${filename}`;

    // Also track in assets table
    try {
      await db.insert(assetsTable).values({
        userId,
        type: 'generated',
        name: filename,
        url: publicUrl,
        mimeType: mimeType,
        fileSize: buffer.length,
      });
    } catch (dbErr) {
      logger.error('Failed to insert asset into DB', { error: dbErr.message });
    }

    return publicUrl;
  } catch (error) {
    logger.error('Failed to persist image', { error: error.message, id });
    return base64Data;
  }
}

// ============================================
// Routes
// ============================================

export async function chatStreamRoutes(fastify: FastifyInstance) {

  /**
   * Serve generated assets
   */
  fastify.get('/assets/:filename', async (request, reply) => {
    const { filename } = request.params;
    const filePath = path.join(process.cwd(), 'public/uploads', filename);

    try {
      const buffer = await fs.readFile(filePath);
      const ext = path.extname(filename).toLowerCase();
      const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
      return reply.type(mimeType).send(buffer);
    } catch (err) {
      return reply.status(404).send({ error: 'File not found' });
    }
  });

  /**
   * Stream a message to the agent
   * POST /api/chat/stream
   */
  fastify.post('/stream', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user.id;
    const body = streamMessageSchema.parse(request.body);

    logger.info('Starting stream', { userId, hasText: !!body.text, imageCount: body.images?.length || 0 });

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    try {
      // Get or create conversation
      let conversationId = body.conversationId;

      if (!conversationId) {
        const [newConversation] = await db.insert(conversations).values({
          userId,
          title: body.text?.slice(0, 50) || '新对话',
        }).returning();
        conversationId = newConversation.id;
        sendSSE(reply, 'conversation', { conversationId });
      }

      // Save user message
      await db.insert(messages).values({
        conversationId,
        role: 'user',
        status: 'sent',
        textContent: body.text,
        imageUrls: body.images?.map(img => img.data),
      });

      // Get conversation history
      const historyMessages = await db.query.messages.findMany({
        where: eq(messages.conversationId, conversationId),
        orderBy: [desc(messages.createdAt)],
        limit: 20,
      });

      const conversationHistory: ConversationMessage[] = historyMessages
        .reverse()
        .slice(0, -1)
        .map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: {
            text: msg.textContent || undefined,
            images: msg.imageUrls?.map((url, i) => ({
              id: `hist_${msg.id}_${i}`,
              data: url,
              mimeType: 'image/jpeg',
            })),
            generatedImages: msg.generatedImageUrls?.map((url, i) => ({
              id: `gen_${msg.id}_${i}`,
              url,
            })),
          },
        }));

      // Build agent input
      const agentInput: ClaudeAgentInput = {
        userId,
        conversationId,
        message: {
          text: body.text,
          images: body.images,
        },
        conversationHistory,
      };

      // Collected data for saving
      const toolCalls: any[] = [];
      let finalText = '';
      let generatedImages: any[] = [];

      // Create assistant message placeholder immediately so it can be polled/updated
      const [assistantMessage] = await db.insert(messages).values({
        conversationId,
        role: 'assistant',
        status: 'generating',
        textContent: '',
      }).returning();
      const assistantMessageId = assistantMessage.id;

      // Heartbeat to keep connection alive during long tool calls (increased frequency to 5s)
      const keepAlive = setInterval(() => {
        // Send a comment-style heartbeat which is standard in SSE
        reply.raw.write(': heartbeat\n\n');
      }, 5000);

      // Run Claude agent with streaming
      const stream = runClaudeAgentStream(agentInput);

      try {
        for await (const event of stream) {
          // Collect data
          switch (event.type) {
            case 'tool_result':
              const leanResult = { ...event.data.result };
              if (leanResult.images) {
                // Persist images and replace with URLs
                for (let i = 0; i < leanResult.images.length; i++) {
                  const img = leanResult.images[i];
                  const url = await persistImage(img.id, img.url || img.data, userId);
                  img.url = url;
                  delete img.data;
                  generatedImages.push({ id: img.id, url });
                }
              }

              toolCalls.push({
                tool: event.data.tool,
                arguments: event.data.arguments,
                result: leanResult,
                timestamp: new Date(),
              });
              break;
            case 'text_delta':
              finalText += event.data.delta;
              break;
            case 'image':
              const persistedUrl = await persistImage(event.data.id, event.data.url, userId);
              const leanImage = { ...event.data, url: persistedUrl };
              delete leanImage.data;
              generatedImages.push(leanImage);

              // Send modified event with URL
              sendSSE(reply, event.type, leanImage);
              continue; // Skip the default sendSSE below
          }

          // Forward event to client (if not already handled)
          sendSSE(reply, event.type, event.data);

          // Real-time DB persistence (Incremental)
          // We don't need to await these as they are side-effects to ensure persistence on disconnect
          db.update(messages)
            .set({
              textContent: finalText,
              generatedImageUrls: generatedImages.map(img => img.url),
              toolCalls: toolCalls.map(tc => ({
                tool: tc.tool,
                args: tc.arguments,
                result: tc.result
              })),
            })
            .where(eq(messages.id, assistantMessageId))
            .catch(err => logger.error('Incremental DB update failed', { error: err.message }));
        }
      } finally {
        clearInterval(keepAlive);
      }

      // Final update to set status to 'sent'
      await db.update(messages).set({
        status: 'sent',
        updatedAt: new Date(),
      }).where(eq(messages.id, assistantMessageId));

      // Send done event
      sendSSE(reply, 'done', {
        conversationId,
        messageId: assistantMessageId,
      });

      reply.raw.end();

    } catch (error) {
      logger.error('Stream error', { error, userId });

      sendSSE(reply, 'error', {
        message: error instanceof Error ? error.message : 'Unknown error',
      });

      reply.raw.end();
    }
  });
}
