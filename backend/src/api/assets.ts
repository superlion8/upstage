// @ts-nocheck
/**
 * Assets API Routes
 * Handles asset management (models, products, scenes, generated images)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db, assets, presets } from '../db/index.js';
import { eq, and, desc, ilike, inArray } from 'drizzle-orm';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('api:assets');

// ============================================
// Schemas
// ============================================

const assetTypeSchema = z.enum(['model', 'product', 'scene', 'generated', 'reference', 'all']);

const listAssetsSchema = z.object({
  type: assetTypeSchema.optional(),
  tags: z.string().optional(), // Comma-separated
  search: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

const createAssetSchema = z.object({
  type: z.enum(['model', 'product', 'scene', 'reference']),
  name: z.string().max(255).optional(),
  url: z.string().url(),
  thumbnailUrl: z.string().url().optional(),
  mimeType: z.string().max(100).optional(),
  fileSize: z.number().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
});

const updateAssetSchema = z.object({
  name: z.string().max(255).optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
});

const listPresetsSchema = z.object({
  type: assetTypeSchema,
  category: z.string().optional(),
  style: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

// ============================================
// Routes
// ============================================

export async function assetsRoutes(fastify: FastifyInstance) {
  
  /**
   * List user's assets
   * GET /api/assets
   */
  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user.id;
    const query = listAssetsSchema.parse(request.query);
    
    // Build conditions
    const conditions = [eq(assets.userId, userId)];
    
    if (query.type && query.type !== 'all') {
      conditions.push(eq(assets.type, query.type));
    }
    
    // TODO: Add tag and search filtering with proper SQL
    
    const userAssets = await db.query.assets.findMany({
      where: and(...conditions),
      orderBy: [desc(assets.createdAt)],
      limit: query.limit,
      offset: query.offset,
    });
    
    return reply.send({
      success: true,
      assets: userAssets.map(asset => ({
        id: asset.id,
        type: asset.type,
        name: asset.name,
        url: asset.url,
        thumbnailUrl: asset.thumbnailUrl,
        tags: asset.tags,
        createdAt: asset.createdAt,
      })),
    });
  });
  
  /**
   * Get a single asset
   * GET /api/assets/:id
   */
  fastify.get('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const userId = request.user.id;
    const assetId = request.params.id;
    
    const asset = await db.query.assets.findFirst({
      where: and(eq(assets.id, assetId), eq(assets.userId, userId)),
    });
    
    if (!asset) {
      return reply.status(404).send({
        success: false,
        error: 'Asset not found',
      });
    }
    
    return reply.send({
      success: true,
      asset,
    });
  });
  
  /**
   * Create a new asset
   * POST /api/assets
   */
  fastify.post('/', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user.id;
    const body = createAssetSchema.parse(request.body);
    
    const [newAsset] = await db.insert(assets).values({
      userId,
      ...body,
    }).returning();
    
    logger.info('Asset created', { userId, assetId: newAsset.id, type: body.type });
    
    return reply.status(201).send({
      success: true,
      asset: newAsset,
    });
  });
  
  /**
   * Update an asset
   * PATCH /api/assets/:id
   */
  fastify.patch('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const userId = request.user.id;
    const assetId = request.params.id;
    const body = updateAssetSchema.parse(request.body);
    
    // Verify ownership
    const existing = await db.query.assets.findFirst({
      where: and(eq(assets.id, assetId), eq(assets.userId, userId)),
    });
    
    if (!existing) {
      return reply.status(404).send({
        success: false,
        error: 'Asset not found',
      });
    }
    
    const [updatedAsset] = await db.update(assets)
      .set({
        ...body,
        updatedAt: new Date(),
      })
      .where(eq(assets.id, assetId))
      .returning();
    
    return reply.send({
      success: true,
      asset: updatedAsset,
    });
  });
  
  /**
   * Delete an asset
   * DELETE /api/assets/:id
   */
  fastify.delete('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const userId = request.user.id;
    const assetId = request.params.id;
    
    // Verify ownership
    const existing = await db.query.assets.findFirst({
      where: and(eq(assets.id, assetId), eq(assets.userId, userId)),
    });
    
    if (!existing) {
      return reply.status(404).send({
        success: false,
        error: 'Asset not found',
      });
    }
    
    await db.delete(assets).where(eq(assets.id, assetId));
    
    // TODO: Delete from storage as well
    
    return reply.send({
      success: true,
    });
  });
  
  /**
   * List system presets
   * GET /api/assets/presets
   */
  fastify.get('/presets', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const query = listPresetsSchema.parse(request.query);
    
    // Build conditions
    const conditions = [eq(presets.isActive, true)];
    
    if (query.type !== 'all') {
      conditions.push(eq(presets.type, query.type));
    }
    
    if (query.category) {
      conditions.push(eq(presets.category, query.category));
    }
    
    if (query.style) {
      conditions.push(eq(presets.style, query.style));
    }
    
    const presetList = await db.query.presets.findMany({
      where: and(...conditions),
      orderBy: [presets.sortOrder, desc(presets.createdAt)],
      limit: query.limit,
      offset: query.offset,
    });
    
    return reply.send({
      success: true,
      presets: presetList.map(p => ({
        id: p.id,
        type: p.type,
        name: p.name,
        description: p.description,
        url: p.url,
        thumbnailUrl: p.thumbnailUrl,
        category: p.category,
        style: p.style,
        tags: p.tags,
      })),
    });
  });
}



