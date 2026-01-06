// @ts-nocheck
/**
 * Auth API Routes
 * Handles authentication and user management
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db, users } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('api:auth');

// ============================================
// Schemas
// ============================================

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  name: z.string().min(1).max(100).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  avatarUrl: z.string().url().optional(),
});

const guestLoginSchema = z.object({
  deviceId: z.string().min(10).max(100),
  deviceName: z.string().max(100).optional(),
});

// ============================================
// Routes
// ============================================

export async function authRoutes(fastify: FastifyInstance) {
  
  /**
   * Register a new user
   * POST /api/auth/register
   */
  fastify.post('/register', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = registerSchema.parse(request.body);
    
    // Check if user already exists
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, body.email.toLowerCase()),
    });
    
    if (existingUser) {
      return reply.status(400).send({
        success: false,
        error: 'Email already registered',
      });
    }
    
    // Hash password
    const passwordHash = await bcrypt.hash(body.password, 12);
    
    // Create user
    const [newUser] = await db.insert(users).values({
      email: body.email.toLowerCase(),
      passwordHash,
      name: body.name,
      quotaTotal: 100, // Default quota
      quotaUsed: 0,
    }).returning();
    
    logger.info('User registered', { userId: newUser.id, email: newUser.email });
    
    // Generate JWT
    const token = fastify.jwt.sign({
      id: newUser.id,
      email: newUser.email,
      role: newUser.role,
    });
    
    return reply.send({
      success: true,
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        quotaTotal: newUser.quotaTotal,
        quotaUsed: newUser.quotaUsed,
      },
      token,
    });
  });
  
  /**
   * Login
   * POST /api/auth/login
   */
  fastify.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = loginSchema.parse(request.body);
    
    // Find user
    const user = await db.query.users.findFirst({
      where: eq(users.email, body.email.toLowerCase()),
    });
    
    if (!user) {
      return reply.status(401).send({
        success: false,
        error: 'Invalid email or password',
      });
    }
    
    // Verify password
    const isValid = await bcrypt.compare(body.password, user.passwordHash);
    
    if (!isValid) {
      return reply.status(401).send({
        success: false,
        error: 'Invalid email or password',
      });
    }
    
    // Update last login
    await db.update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id));
    
    logger.info('User logged in', { userId: user.id });
    
    // Generate JWT
    const token = fastify.jwt.sign({
      id: user.id,
      email: user.email,
      role: user.role,
    });
    
    return reply.send({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        role: user.role,
        quotaTotal: user.quotaTotal,
        quotaUsed: user.quotaUsed,
      },
      token,
    });
  });
  
  /**
   * Guest login (device-bound)
   * POST /api/auth/guest-login
   */
  fastify.post('/guest-login', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = guestLoginSchema.parse(request.body);
    
    // Check if device already has a guest account
    let user = await db.query.users.findFirst({
      where: eq(users.deviceId, body.deviceId),
    });
    
    let isNewUser = false;
    
    if (!user) {
      // Create new guest user
      isNewUser = true;
      const shortId = body.deviceId.substring(0, 8).toLowerCase();
      const guestEmail = `guest_${shortId}@device.onstage.app`;
      const randomPassword = Math.random().toString(36).slice(-16);
      const passwordHash = await bcrypt.hash(randomPassword, 12);
      
      [user] = await db.insert(users).values({
        email: guestEmail,
        passwordHash,
        name: body.deviceName || '游客用户',
        role: 'guest',
        deviceId: body.deviceId,
        quotaTotal: -1, // -1 表示无限配额
        quotaUsed: 0,
      }).returning();
      
      logger.info('Guest user created', { userId: user.id, deviceId: body.deviceId.substring(0, 8) });
    } else {
      // Update last login
      await db.update(users)
        .set({ lastLoginAt: new Date() })
        .where(eq(users.id, user.id));
      
      logger.info('Guest user logged in', { userId: user.id });
    }
    
    // Generate JWT
    const token = fastify.jwt.sign({
      id: user.id,
      email: user.email,
      role: user.role,
    });
    
    return reply.send({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        role: user.role,
        quotaTotal: user.quotaTotal,
        quotaUsed: user.quotaUsed,
      },
      token,
      isNewUser,
    });
  });
  
  /**
   * Get current user profile
   * GET /api/auth/me
   */
  fastify.get('/me', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user.id;
    
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    
    if (!user) {
      return reply.status(404).send({
        success: false,
        error: 'User not found',
      });
    }
    
    return reply.send({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        role: user.role,
        quotaTotal: user.quotaTotal,
        quotaUsed: user.quotaUsed,
        quotaResetAt: user.quotaResetAt,
        createdAt: user.createdAt,
      },
    });
  });
  
  /**
   * Update user profile
   * PATCH /api/auth/me
   */
  fastify.patch('/me', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user.id;
    const body = updateProfileSchema.parse(request.body);
    
    const [updatedUser] = await db.update(users)
      .set({
        ...body,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    
    return reply.send({
      success: true,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        avatarUrl: updatedUser.avatarUrl,
        role: updatedUser.role,
      },
    });
  });
  
  /**
   * Refresh token
   * POST /api/auth/refresh
   */
  fastify.post('/refresh', {
    preHandler: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, email, role } = request.user;
    
    const token = fastify.jwt.sign({ id, email, role });
    
    return reply.send({
      success: true,
      token,
    });
  });
}



