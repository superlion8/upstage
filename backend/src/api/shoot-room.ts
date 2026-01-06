/**
 * Shoot Room API Routes
 * Handles professional shooting room functionality
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db, shootRoomSessions, generations } from '../db/index.js';
import { eq, desc } from 'drizzle-orm';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('api:shoot-room');

// ============================================
// Schemas
// ============================================

const shootRoomConfigSchema = z.object({
  model: z.object({
    id: z.string(),
    url: z.string(),
  }).optional(),
  product: z.object({
    id: z.string(),
    url: z.string(),
  }).optional(),
  scene: z.object({
    id: z.string(),
    url: z.string(),
  }).optional(),
  sceneObjects: z.array(z.object({
    id: z.string(),
    type: z.string(),
    position: z.object({
      x: z.number(),
      y: z.number(),
    }),
  })).optional(),
  lighting: z.object({
    position: z.object({
      x: z.number(),
      y: z.number(),
    }),
    direction: z.number(), // degrees
    intensity: z.number().min(0).max(100),
  }).optional(),
  camera: z.object({
    position: z.object({
      x: z.number(),
      y: z.number(),
    }),
    angle: z.enum(['high', 'eye', 'low']),
    focalLength: z.number().min(16).max(200), // mm
  }).optional(),
});

const createSessionSchema = z.object({
  name: z.string().max(255).optional(),
  config: shootRoomConfigSchema.optional(),
});

const generateSchema = z.object({
  sessionId: z.string().uuid().optional(),
  config: shootRoomConfigSchema,
  count: z.number().min(1).max(4).default(2),
});

// ============================================
// Routes
// ============================================

export async function shootRoomRoutes(fastify: FastifyInstance) {
  
  /**
   * List user's shoot room sessions
   * GET /api/shoot-room/sessions
   */
  fastify.get('/sessions', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user.id;
    
    const sessions = await db.query.shootRoomSessions.findMany({
      where: eq(shootRoomSessions.userId, userId),
      orderBy: [desc(shootRoomSessions.updatedAt)],
      limit: 50,
    });
    
    return reply.send({
      success: true,
      sessions: sessions.map(s => ({
        id: s.id,
        name: s.name,
        config: s.config,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
    });
  });
  
  /**
   * Get a single session
   * GET /api/shoot-room/sessions/:id
   */
  fastify.get('/sessions/:id', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const userId = request.user.id;
    const sessionId = request.params.id;
    
    const session = await db.query.shootRoomSessions.findFirst({
      where: eq(shootRoomSessions.id, sessionId),
    });
    
    if (!session || session.userId !== userId) {
      return reply.status(404).send({
        success: false,
        error: 'Session not found',
      });
    }
    
    return reply.send({
      success: true,
      session,
    });
  });
  
  /**
   * Create a new session
   * POST /api/shoot-room/sessions
   */
  fastify.post('/sessions', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user.id;
    const body = createSessionSchema.parse(request.body);
    
    const [newSession] = await db.insert(shootRoomSessions).values({
      userId,
      name: body.name || '新拍摄',
      config: body.config || {},
    }).returning();
    
    logger.info('Shoot room session created', { userId, sessionId: newSession.id });
    
    return reply.status(201).send({
      success: true,
      session: newSession,
    });
  });
  
  /**
   * Update a session
   * PATCH /api/shoot-room/sessions/:id
   */
  fastify.patch('/sessions/:id', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const userId = request.user.id;
    const sessionId = request.params.id;
    const body = createSessionSchema.parse(request.body);
    
    // Verify ownership
    const existing = await db.query.shootRoomSessions.findFirst({
      where: eq(shootRoomSessions.id, sessionId),
    });
    
    if (!existing || existing.userId !== userId) {
      return reply.status(404).send({
        success: false,
        error: 'Session not found',
      });
    }
    
    const [updatedSession] = await db.update(shootRoomSessions)
      .set({
        name: body.name,
        config: body.config,
        updatedAt: new Date(),
      })
      .where(eq(shootRoomSessions.id, sessionId))
      .returning();
    
    return reply.send({
      success: true,
      session: updatedSession,
    });
  });
  
  /**
   * Delete a session
   * DELETE /api/shoot-room/sessions/:id
   */
  fastify.delete('/sessions/:id', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const userId = request.user.id;
    const sessionId = request.params.id;
    
    // Verify ownership
    const existing = await db.query.shootRoomSessions.findFirst({
      where: eq(shootRoomSessions.id, sessionId),
    });
    
    if (!existing || existing.userId !== userId) {
      return reply.status(404).send({
        success: false,
        error: 'Session not found',
      });
    }
    
    await db.delete(shootRoomSessions).where(eq(shootRoomSessions.id, sessionId));
    
    return reply.send({
      success: true,
    });
  });
  
  /**
   * Generate images from shoot room configuration
   * POST /api/shoot-room/generate
   */
  fastify.post('/generate', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user.id;
    const body = generateSchema.parse(request.body);
    
    logger.info('Shoot room generation requested', { userId, config: body.config });
    
    // Create generation record
    const [generation] = await db.insert(generations).values({
      userId,
      type: 'shoot_room',
      status: 'processing',
      parameters: body.config as any,
    }).returning();
    
    try {
      // Build prompt from configuration
      const prompt = buildShootRoomPrompt(body.config);
      
      // TODO: Call image generation service
      // For now, return a placeholder
      
      // Update generation record
      await db.update(generations)
        .set({
          status: 'completed',
          prompt,
          // outputImages: generatedImages,
          completedAt: new Date(),
        })
        .where(eq(generations.id, generation.id));
      
      // If session ID provided, update the session
      if (body.sessionId) {
        await db.update(shootRoomSessions)
          .set({
            config: body.config as any,
            updatedAt: new Date(),
          })
          .where(eq(shootRoomSessions.id, body.sessionId));
      }
      
      return reply.send({
        success: true,
        generationId: generation.id,
        prompt,
        // images: generatedImages,
        message: 'Generation started. Images will be available shortly.',
      });
      
    } catch (error) {
      logger.error('Shoot room generation failed', { error, generationId: generation.id });
      
      await db.update(generations)
        .set({
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        })
        .where(eq(generations.id, generation.id));
      
      return reply.status(500).send({
        success: false,
        error: 'Generation failed',
      });
    }
  });
}

// ============================================
// Helpers
// ============================================

/**
 * Build a prompt from shoot room configuration
 */
function buildShootRoomPrompt(config: z.infer<typeof shootRoomConfigSchema>): string {
  const parts: string[] = [
    'Professional fashion e-commerce photography.',
  ];
  
  // Camera angle
  if (config.camera) {
    const angleMap = {
      high: 'shot from above, high angle view',
      eye: 'shot at eye level, straight on',
      low: 'shot from below, low angle view',
    };
    parts.push(angleMap[config.camera.angle] || '');
    
    // Focal length affects framing
    if (config.camera.focalLength <= 24) {
      parts.push('wide angle shot, full body visible');
    } else if (config.camera.focalLength <= 50) {
      parts.push('standard lens, three-quarter body shot');
    } else if (config.camera.focalLength <= 85) {
      parts.push('portrait lens, upper body focus');
    } else {
      parts.push('telephoto lens, close-up detail shot');
    }
  }
  
  // Lighting
  if (config.lighting) {
    const intensity = config.lighting.intensity;
    if (intensity < 30) {
      parts.push('soft, diffused lighting, low contrast');
    } else if (intensity < 70) {
      parts.push('balanced studio lighting, medium contrast');
    } else {
      parts.push('dramatic lighting, high contrast, defined shadows');
    }
    
    // Direction
    const dir = config.lighting.direction;
    if (dir < 45 || dir > 315) {
      parts.push('front lighting');
    } else if (dir < 135) {
      parts.push('side lighting from the right');
    } else if (dir < 225) {
      parts.push('back lighting, rim light effect');
    } else {
      parts.push('side lighting from the left');
    }
  }
  
  // Scene
  if (config.scene) {
    parts.push('in a professional studio setting');
  }
  
  parts.push('Sharp focus on clothing details. High quality, editorial style.');
  
  return parts.filter(Boolean).join('. ');
}



