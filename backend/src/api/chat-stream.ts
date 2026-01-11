// @ts-nocheck
/**
 * Chat Streaming API
 * SSE endpoint for real-time agent responses (Claude only)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db, conversations, messages, users } from '../db/index.js';
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
 * Persist image to Railway Volume (mounted at /data or RAILWAY_VOLUME_MOUNT_PATH)
 * Railway Volumes persist across deploys, solving the ephemeral filesystem issue
 * Falls back to data URL if volume is not available
 */
async function persistImage(id: string, base64Data: string, userId: string): Promise<string> {
  if (!base64Data) {
    return base64Data;
  }

  // If it's already an HTTP URL, return it
  if (base64Data.startsWith('http')) {
    return base64Data;
  }

  try {
    // Parse base64 data
    let buffer: Buffer;
    let mimeType = 'image/png';

    if (base64Data.startsWith('data:')) {
      const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        mimeType = matches[1];
        buffer = Buffer.from(matches[2], 'base64');
      } else {
        // Invalid data URL, return as-is
        return base64Data;
      }
    } else {
      // Raw base64
      buffer = Buffer.from(base64Data, 'base64');
    }

    const extension = mimeType.split('/')[1] || 'png';
    const filename = `${id}.${extension}`;

    // Use /app/uploads (Railway Volume mount path) in production
    const uploadsDir = process.env.NODE_ENV === 'production' ? '/app/uploads' : path.join(process.cwd(), 'public/uploads');
    const uploadDir = path.join(uploadsDir, 'images');
    const filePath = path.join(uploadDir, filename);

    // Ensure directory exists
    await fs.mkdir(uploadDir, { recursive: true });
    await fs.writeFile(filePath, buffer);

    // Return URL that our assets route can serve
    const publicUrl = `/api/chat/assets/${filename}`;

    logger.info('Image saved to volume', { id, path: filePath, url: publicUrl });
    return publicUrl;

  } catch (error: any) {
    logger.error('Failed to persist image to volume', { error: error.message, id });
    // Fall back to data URL
    return base64Data.startsWith('data:') ? base64Data : `data:image/png;base64,${base64Data}`;
  }
}

// ============================================
// Routes
// ============================================

export async function chatStreamRoutes(fastify: FastifyInstance) {

  /**
   * Serve generated assets from Railway Volume
   */
  fastify.get('/assets/:filename', async (request, reply) => {
    const { filename } = request.params;
    // Use /app/uploads (Railway Volume) in production
    const uploadsDir = process.env.NODE_ENV === 'production' ? '/app/uploads' : path.join(process.cwd(), 'public/uploads');
    const filePath = path.join(uploadsDir, 'images', filename);

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

    // Validate user exists in DB BEFORE starting SSE stream
    // This prevents crashes when user was deleted (e.g., DB reset)
    const userExists = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { id: true },
    });

    if (!userExists) {
      logger.warn('User not found in DB, requesting re-auth', { userId });
      return reply.status(401).send({
        success: false,
        error: 'User not found. Please re-authenticate.',
        code: 'USER_NOT_FOUND',
      });
    }

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
      let thinkingContent = '';  // Collect thinking content
      let generatedImages: any[] = [];
      let lastDbUpdateTime = Date.now();
      let hasPendingChanges = false;

      // Create assistant message placeholder immediately
      const [assistantMessage] = await db.insert(messages).values({
        conversationId,
        role: 'assistant',
        status: 'generating',
        textContent: '',
      }).returning();
      const assistantMessageId = assistantMessage.id;

      // Handle client disconnect
      let isDisconnected = false;
      request.raw.on('close', () => {
        logger.warn('Client disconnected from stream', { userId, conversationId, assistantMessageId });
        isDisconnected = true;
      });

      // Heartbeat to keep connection alive (Comment + Event)
      const keepAlive = setInterval(() => {
        if (isDisconnected) return;
        reply.raw.write(': heartbeat\n\n');
        sendSSE(reply, 'ping', { timestamp: Date.now() });
      }, 5000);

      // Function to sync current state to DB
      const syncToDb = async (forceSent = false) => {
        try {
          await db.update(messages)
            .set({
              textContent: finalText,
              thinking: thinkingContent || null,  // Save thinking content
              generatedImageUrls: generatedImages.map(img => img.url),
              toolCalls: toolCalls.map(tc => ({
                tool: tc.tool,
                args: tc.arguments,
                result: tc.result
              })),
              status: forceSent ? 'sent' : 'generating',
              updatedAt: new Date(),
            })
            .where(eq(messages.id, assistantMessageId));
          lastDbUpdateTime = Date.now();
          hasPendingChanges = false;
        } catch (err) {
          logger.error('DB sync failed', { error: err.message, assistantMessageId });
        }
      };

      // Run Claude agent with streaming
      const stream = runClaudeAgentStream(agentInput);

      try {
        for await (const event of stream) {
          // Do NOT break loop on disconnect, continue processing in background
          // if (isDisconnected) break;

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
              hasPendingChanges = true;
              break;

            case 'text_delta':
              finalText += event.data.delta;
              hasPendingChanges = true;
              break;

            case 'thinking':
              // Accumulate thinking content
              if (event.data.content) {
                thinkingContent += event.data.content;
                hasPendingChanges = true;
              }
              break;

            case 'image':
              const persistedUrl = await persistImage(event.data.id, event.data.url, userId);
              const leanImage = { ...event.data, url: persistedUrl };
              delete leanImage.data;
              generatedImages.push(leanImage);
              hasPendingChanges = true;

              // Send modified event with URL (only if connected)
              if (!isDisconnected) {
                sendSSE(reply, event.type, leanImage);
              }
              continue; // Skip the default sendSSE below
          }

          // Forward event to client (if not already handled and connected)
          if (!isDisconnected) {
            sendSSE(reply, event.type, event.data);
          }

          // Throttled DB persistence (every 2 seconds if changes pending)
          if (hasPendingChanges && Date.now() - lastDbUpdateTime > 2000) {
            syncToDb();
          }
        }
      } finally {
        clearInterval(keepAlive);
      }

      // Final update to set status to 'sent'
      await syncToDb(true);

      // Send done event and close stream
      if (!isDisconnected) {
        sendSSE(reply, 'done', {
          conversationId,
          messageId: assistantMessageId,
        });
        isDisconnected = true; // Prevent heartbeat from writing after end
        reply.raw.end();
      }
    } catch (error) {
      logger.error('Stream error', { error, userId });
      isDisconnected = true; // Prevent heartbeat from writing after end

      try {
        sendSSE(reply, 'error', {
          message: error instanceof Error ? error.message : 'Unknown error',
        });
        reply.raw.end();
      } catch (e) {
        // Stream already closed, ignore
      }
    }
  });
}
