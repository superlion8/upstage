// @ts-nocheck
/**
 * Chat Streaming API
 * SSE endpoint for real-time agent responses
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db, conversations, messages, users } from '../db/index.js';
import { eq, desc } from 'drizzle-orm';
import { runAgentStream, type AgentInput, type ConversationMessage, type StreamEvent } from '../agent/orchestrator-stream.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('api:chat-stream');

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

// ============================================
// Routes
// ============================================

export async function chatStreamRoutes(fastify: FastifyInstance) {
  
  /**
   * Stream a message to the agent
   * POST /api/chat/stream
   * 
   * Returns SSE events:
   * - thinking: Agent's thinking process
   * - tool_start: Tool execution started
   * - tool_result: Tool execution completed
   * - text_delta: Incremental text response
   * - image: Generated image
   * - done: Stream completed
   * - error: Error occurred
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
      'X-Accel-Buffering': 'no', // Disable nginx buffering
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
        
        // Send conversation ID immediately
        sendSSE(reply, 'conversation', { conversationId });
      }
      
      // Save user message
      const [userMessage] = await db.insert(messages).values({
        conversationId,
        role: 'user',
        status: 'sent',
        textContent: body.text,
        imageUrls: body.images?.map(img => img.data),
      }).returning();
      
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
          },
        }));
      
      // Build agent input
      const agentInput: AgentInput = {
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
      let thinkingContent = '';
      let finalText = '';
      let generatedImages: any[] = [];
      
      // Run agent with streaming
      const stream = runAgentStream(agentInput);
      
      for await (const event of stream) {
        // Forward event to client
        sendSSE(reply, event.type, event.data);
        
        // Collect data
        switch (event.type) {
          case 'thinking':
            thinkingContent += event.data.content + '\n';
            break;
          case 'tool_result':
            toolCalls.push({
              tool: event.data.tool,
              arguments: event.data.arguments,
              result: event.data.result,
              timestamp: new Date(),
            });
            if (event.data.result?.images) {
              generatedImages.push(...event.data.result.images);
            }
            break;
          case 'text_delta':
            finalText += event.data.delta;
            break;
          case 'image':
            generatedImages.push(event.data);
            break;
        }
      }
      
      // Save assistant message
      const [assistantMessage] = await db.insert(messages).values({
        conversationId,
        role: 'assistant',
        status: 'sent',
        textContent: finalText,
        generatedImageUrls: generatedImages.map(img => img.url),
        toolCalls: toolCalls,
        thinking: thinkingContent,
      }).returning();
      
      // Send done event
      sendSSE(reply, 'done', {
        conversationId,
        messageId: assistantMessage.id,
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

