// @ts-nocheck
/**
 * Chat API Routes
 * Handles conversation and message endpoints
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db, conversations, messages, users } from '../db/index.js';
import { eq, desc } from 'drizzle-orm';
import { runClaudeAgent, type ClaudeAgentInput, type ConversationMessage } from '../agent/orchestrator-claude.js';
import { createLogger } from '../lib/logger.js';
import { nanoid } from 'nanoid';

const logger = createLogger('api:chat');

// ============================================
// Schemas
// ============================================

const sendMessageSchema = z.object({
  // 支持 snake_case (iOS) 和 camelCase
  conversationId: z.string().uuid().optional(),
  conversation_id: z.string().uuid().optional(),
  text: z.string().optional(),
  images: z.array(z.object({
    id: z.string().optional(), // 可选，如果没有则自动生成
    data: z.string(), // Base64
    mimeType: z.string().optional(),
    mime_type: z.string().optional(),
  })).optional(),
  actionType: z.string().optional(),
  actionData: z.record(z.any()).optional(),
}).transform(data => ({
  // 统一转换为 camelCase
  conversationId: data.conversationId || data.conversation_id,
  text: data.text,
  images: data.images?.map((img, i) => ({
    id: img.id || `img_${Date.now()}_${i}`, // 自动生成 id
    data: img.data,
    mimeType: img.mimeType || img.mime_type || 'image/jpeg',
  })),
  actionType: data.actionType,
  actionData: data.actionData,
}));

const getConversationsSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

const getMessagesSchema = z.object({
  conversationId: z.string().uuid().optional(),
  conversation_id: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
}).transform(data => ({
  conversationId: data.conversationId || data.conversation_id || '',
  limit: data.limit,
  offset: data.offset,
}));

// ============================================
// Routes
// ============================================

export async function chatRoutes(fastify: FastifyInstance) {

  /**
   * Send a message to the agent
   * POST /api/chat/send
   */
  fastify.post('/send', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user.id;

    // 详细记录请求体结构
    logger.info('Raw request body structure', {
      bodyKeys: Object.keys(request.body as object),
      hasImages: !!(request.body as any)?.images,
      imagesCount: (request.body as any)?.images?.length,
      firstImageKeys: (request.body as any)?.images?.[0] ? Object.keys((request.body as any).images[0]) : [],
    });

    const body = sendMessageSchema.parse(request.body);

    logger.info('Parsed body', {
      hasConversationId: !!body.conversationId,
      hasText: !!body.text,
      imageCount: body.images?.length || 0,
      firstImageId: body.images?.[0]?.id,
    });

    try {
      // Get or create conversation
      let conversationId = body.conversationId;

      if (!conversationId) {
        // Create new conversation
        logger.info('Creating new conversation', { userId, titlePreview: body.text?.slice(0, 20) });
        const [newConversation] = await db.insert(conversations).values({
          userId,
          title: body.text?.slice(0, 50) || '新对话',
        }).returning();
        conversationId = newConversation.id;
        logger.info('Created new conversation', { conversationId });
      }

      // Save user message
      const imageUrls = body.images?.map(img => img.data);
      logger.info('Saving user message', {
        conversationId,
        hasText: !!body.text,
        imageUrlsCount: imageUrls?.length || 0,
        imageUrlsType: imageUrls ? typeof imageUrls : 'undefined',
        firstImageUrlLength: imageUrls?.[0]?.length,
      });

      const [userMessage] = await db.insert(messages).values({
        conversationId,
        role: 'user',
        status: 'sent',
        textContent: body.text,
        imageUrls: imageUrls,
      }).returning();

      logger.info('User message saved', { messageId: userMessage.id });

      // Get conversation history
      const historyMessages = await db.query.messages.findMany({
        where: eq(messages.conversationId, conversationId),
        orderBy: [desc(messages.createdAt)],
        limit: 20,
      });

      // Convert to agent format
      const conversationHistory: ConversationMessage[] = historyMessages
        .reverse()
        .slice(0, -1) // Exclude the message we just added
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

      // Run agent
      const agentInput: ClaudeAgentInput = {
        userId,
        conversationId,
        message: {
          text: body.text,
          images: body.images,
        },
        conversationHistory,
      };

      logger.info('Starting agent run...');
      const startTime = Date.now();

      // 添加超时
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Agent timeout after 90s')), 90000);
      });

      const agentOutput = await Promise.race([
        runClaudeAgent(agentInput),
        timeoutPromise,
      ]) as any;

      logger.info('Agent completed', { duration: Date.now() - startTime });

      // Save assistant message
      const [assistantMessage] = await db.insert(messages).values({
        conversationId,
        role: 'assistant',
        status: 'sent',
        textContent: agentOutput.response.text,
        generatedImageUrls: agentOutput.response.generatedImages?.map(img => img.url),
        toolCalls: agentOutput.toolCalls,
        thinking: agentOutput.thinking,
      }).returning();

      // Update conversation title if it's a new conversation
      if (!body.conversationId && body.text) {
        await db.update(conversations)
          .set({ title: body.text.slice(0, 50), updatedAt: new Date() })
          .where(eq(conversations.id, conversationId));
      }

      // Check and update user quota
      // TODO: 正确实现配额追踪（目前暂时禁用，避免 [object Object] 错误）
      // if (agentOutput.toolCalls.some(tc => tc.result?.images)) {
      //   const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
      //   if (user) {
      //     await db.update(users)
      //       .set({ quotaUsed: user.quotaUsed + 1 })
      //       .where(eq(users.id, userId));
      //   }
      // }

      return reply.send({
        success: true,
        conversationId,
        message: {
          id: assistantMessage.id,
          role: 'assistant',
          text: agentOutput.response.text,
          generatedImages: agentOutput.response.generatedImages,
          guiRequest: agentOutput.response.guiRequest,
          createdAt: assistantMessage.createdAt,
        },
        // Agent 执行步骤（供前端展示）
        agentSteps: agentOutput.toolCalls.map(tc => ({
          type: 'tool_call',
          tool: tc.tool,
          arguments: tc.arguments,
          result: {
            success: tc.result?.success ?? true,
            message: tc.result?.message,
            hasImages: !!tc.result?.images?.length,
          },
          timestamp: tc.timestamp,
        })),
        thinking: agentOutput.thinking,
      });

    } catch (error) {
      logger.error('Chat error', { error, userId });

      // Update message status to failed
      if (body.conversationId) {
        await db.update(messages)
          .set({ status: 'failed' })
          .where(eq(messages.conversationId, body.conversationId));
      }

      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * Get user's conversations
   * GET /api/chat/conversations
   */
  fastify.get('/conversations', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user.id;
    const query = getConversationsSchema.parse(request.query);

    const userConversations = await db.query.conversations.findMany({
      where: eq(conversations.userId, userId),
      orderBy: [desc(conversations.updatedAt)],
      limit: query.limit,
      offset: query.offset,
    });

    return reply.send({
      success: true,
      conversations: userConversations,
    });
  });

  /**
   * Get messages in a conversation
   * GET /api/chat/messages
   */
  fastify.get('/messages', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user.id;
    const query = getMessagesSchema.parse(request.query);

    // Verify conversation belongs to user
    const conversation = await db.query.conversations.findFirst({
      where: eq(conversations.id, query.conversationId),
    });

    if (!conversation || conversation.userId !== userId) {
      return reply.status(404).send({
        success: false,
        error: 'Conversation not found',
      });
    }

    const conversationMessages = await db.query.messages.findMany({
      where: eq(messages.conversationId, query.conversationId),
      orderBy: [desc(messages.createdAt)],
      limit: query.limit,
      offset: query.offset,
    });

    return reply.send({
      success: true,
      messages: conversationMessages.reverse().map(msg => ({
        id: msg.id,
        role: msg.role,
        text: msg.textContent,
        images: msg.imageUrls,
        generatedImages: msg.generatedImageUrls,
        createdAt: msg.createdAt,
      })),
    });
  });

  /**
   * Delete a conversation
   * DELETE /api/chat/conversations/:id
   */
  fastify.delete('/conversations/:id', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const userId = request.user.id;
    const conversationId = request.params.id;

    // Verify conversation belongs to user
    const conversation = await db.query.conversations.findFirst({
      where: eq(conversations.id, conversationId),
    });

    if (!conversation || conversation.userId !== userId) {
      return reply.status(404).send({
        success: false,
        error: 'Conversation not found',
      });
    }

    await db.delete(conversations).where(eq(conversations.id, conversationId));

    return reply.send({
      success: true,
    });
  });
}



