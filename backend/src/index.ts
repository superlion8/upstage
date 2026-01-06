// @ts-nocheck
/**
 * Onstage Backend Server
 * Main entry point
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

import { config } from './config/index.js';
import { logger, createLogger } from './lib/logger.js';
import { checkDatabaseConnection } from './db/index.js';
import { setupAuth } from './middleware/auth.js';

// Routes
import { authRoutes } from './api/auth.js';
import { chatRoutes } from './api/chat.js';
import { assetsRoutes } from './api/assets.js';
import { shootRoomRoutes } from './api/shoot-room.js';

const log = createLogger('server');

// ============================================
// Server Setup
// ============================================

async function buildServer() {
  const fastify = Fastify({
    logger: false, // We use our own logger
  });
  
  // ============================================
  // Plugins
  // ============================================
  
  // CORS
  await fastify.register(cors, {
    origin: config.server.isDev ? true : ['https://onstage.app'], // Adjust for production
    credentials: true,
  });
  
  // Multipart (file uploads)
  await fastify.register(multipart, {
    limits: {
      fileSize: config.storage.maxFileSizeBytes,
    },
  });
  
  // Rate limiting
  await fastify.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.windowMs,
  });
  
  // Swagger documentation
  if (config.server.isDev) {
    await fastify.register(swagger, {
      openapi: {
        info: {
          title: 'Onstage API',
          description: 'AI-powered fashion content generation API',
          version: '1.0.0',
        },
        servers: [
          { url: `http://localhost:${config.server.port}` },
        ],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
            },
          },
        },
      },
    });
    
    await fastify.register(swaggerUi, {
      routePrefix: '/docs',
    });
  }
  
  // Authentication
  await setupAuth(fastify);
  
  // ============================================
  // Routes
  // ============================================
  
  // Health check
  fastify.get('/health', async () => {
    const dbOk = await checkDatabaseConnection();
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: dbOk ? 'connected' : 'disconnected',
    };
  });
  
  // API routes
  await fastify.register(authRoutes, { prefix: '/api/auth' });
  await fastify.register(chatRoutes, { prefix: '/api/chat' });
  await fastify.register(assetsRoutes, { prefix: '/api/assets' });
  await fastify.register(shootRoomRoutes, { prefix: '/api/shoot-room' });
  
  // ============================================
  // Error Handling
  // ============================================
  
  fastify.setErrorHandler((error, request, reply) => {
    log.error('Request error', {
      error: error.message,
      stack: error.stack,
      url: request.url,
      method: request.method,
    });
    
    // Zod validation errors
    if (error.name === 'ZodError') {
      return reply.status(400).send({
        success: false,
        error: 'Validation error',
        details: error.issues,
      });
    }
    
    // JWT errors
    if (error.code === 'FST_JWT_NO_AUTHORIZATION_IN_HEADER') {
      return reply.status(401).send({
        success: false,
        error: 'Authorization header required',
      });
    }
    
    // Default error
    return reply.status(error.statusCode || 500).send({
      success: false,
      error: config.server.isDev ? error.message : 'Internal server error',
    });
  });
  
  return fastify;
}

// ============================================
// Start Server
// ============================================

async function start() {
  try {
    // Check database connection (don't exit if fails, just warn)
    const dbOk = await checkDatabaseConnection();
    if (dbOk) {
      log.info('Database connected');
    } else {
      log.warn('Database not connected - some features may not work');
    }
    
    // Build and start server
    const server = await buildServer();
    
    await server.listen({
      port: config.server.port,
      host: config.server.host,
    });
    
    log.info(`🚀 Server running at http://${config.server.host}:${config.server.port}`);
    
    if (config.server.isDev) {
      log.info(`📚 API docs at http://localhost:${config.server.port}/docs`);
    }
    
  } catch (error) {
    log.error('Failed to start server', { error });
    process.exit(1);
  }
}

start();



