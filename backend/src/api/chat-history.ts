// @ts-nocheck
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db, conversations, messages } from '../db/index.js';
import { eq, desc, and } from 'drizzle-orm';

export async function chatHistoryRoutes(fastify: FastifyInstance) {

    // GET /conversations
    fastify.get('/conversations', {
        preHandler: [fastify.authenticate],
    }, async (request: FastifyRequest<{ Querystring: { limit?: number; offset?: number } }>, reply) => {
        const userId = request.user.id;
        const limit = Number(request.query.limit) || 20;
        const offset = Number(request.query.offset) || 0;

        // Fetch conversations
        const items = await db.query.conversations.findMany({
            where: eq(conversations.userId, userId),
            orderBy: [desc(conversations.createdAt)],
            limit,
            offset,
        });

        return items;
    });

    // GET /conversations/:id
    fastify.get('/conversations/:id', {
        preHandler: [fastify.authenticate],
    }, async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
        const userId = request.user.id;
        const { id } = request.params;

        const conversation = await db.query.conversations.findFirst({
            where: and(
                eq(conversations.id, id),
                eq(conversations.userId, userId)
            ),
        });

        if (!conversation) {
            return reply.status(404).send({ error: 'Conversation not found' });
        }

        return conversation;
    });

    // DELETE /conversations/:id
    fastify.delete('/conversations/:id', {
        preHandler: [fastify.authenticate],
    }, async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
        const userId = request.user.id;
        const { id } = request.params;

        // Verify ownership
        const conversation = await db.query.conversations.findFirst({
            where: and(
                eq(conversations.id, id),
                eq(conversations.userId, userId)
            ),
        });

        if (!conversation) {
            return reply.status(404).send({ error: 'Conversation not found' });
        }

        // Delete messages first (cascade usually handles this but good to be explicit/safe if not)
        await db.delete(messages).where(eq(messages.conversationId, id));
        await db.delete(conversations).where(eq(conversations.id, id));

        return { success: true };
    });

    // GET /conversations/:id/messages
    fastify.get('/conversations/:id/messages', {
        preHandler: [fastify.authenticate],
    }, async (request: FastifyRequest<{ Params: { id: string }; Querystring: { limit?: number; offset?: number } }>, reply) => {
        const userId = request.user.id;
        const { id } = request.params;
        const limit = Number(request.query.limit) || 50;
        const offset = Number(request.query.offset) || 0;

        // Verify ownership
        const conversation = await db.query.conversations.findFirst({
            where: and(
                eq(conversations.id, id),
                eq(conversations.userId, userId)
            ),
        });

        if (!conversation) {
            return reply.status(404).send({ error: 'Conversation not found' });
        }

        const msgs = await db.query.messages.findMany({
            where: eq(messages.conversationId, id),
            orderBy: [desc(messages.createdAt)], // Newest first for pagination usually, or sync with UI expectation
            limit,
            offset,
        });

        // Reverse to chronological order if UI expects it, or keep standard.
        // Usually APIs return newest first (desc) or oldest first (asc).
        // Let's stick to desc (database natural) or asc (chat log).
        // If it's a "load previous" pagination, DESC is better.
        // If it's "load full history", ASC is better.
        // Let's return DESC, UI usually reverses.
        return msgs.reverse();
    });
}
