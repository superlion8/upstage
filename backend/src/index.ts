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

import { chatStreamRoutes } from './api/chat-stream.js';
import { chatHistoryRoutes } from './api/chat-history.js';
import { assetsRoutes } from './api/assets.js';
import { shootRoomRoutes } from './api/shoot-room.js';
import onboardingRoutes from './api/onboarding.js';

const log = createLogger('server');

// ============================================
// Server Setup
// ============================================

async function buildServer() {
  const fastify = Fastify({
    logger: false, // We use our own logger
    requestTimeout: 600000, // 10 minutes for long image gen
    connectionTimeout: 600000,
    keepAliveTimeout: 610000,
    bodyLimit: 52428800, // 50MB for large base64 image payloads
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

  // Health check - MUST NOT BLOCK (Railway depends on this)
  fastify.get('/health', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  });

  // Readiness check - can be slow, checks DB
  fastify.get('/readyz', async () => {
    const dbOk = await Promise.race([
      checkDatabaseConnection(),
      new Promise<boolean>(resolve => setTimeout(() => resolve(false), 3000)),
    ]);
    return {
      status: dbOk ? 'ready' : 'degraded',
      timestamp: new Date().toISOString(),
      database: dbOk ? 'connected' : 'disconnected',
    };
  });

  // API routes
  await fastify.register(authRoutes, { prefix: '/api/auth' });

  await fastify.register(chatStreamRoutes, { prefix: '/api/chat' }); // Streaming endpoint
  await fastify.register(chatHistoryRoutes, { prefix: '/api/chat' }); // History endpoints
  await fastify.register(assetsRoutes, { prefix: '/api/assets' });
  await fastify.register(shootRoomRoutes, { prefix: '/api/shoot-room' });
  await fastify.register(onboardingRoutes, { prefix: '/api' });

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
    // CRITICAL: Start server FIRST, then check DB asynchronously
    // This ensures Railway sees a healthy port binding immediately
    const server = await buildServer();

    await server.listen({
      port: config.server.port,
      host: config.server.host,
    });

    log.info(`🚀 Server running at http://${config.server.host}:${config.server.port}`);

    // Now check DB async (non-blocking, won't prevent startup)
    checkDatabaseConnection()
      .then(ok => ok ? log.info('Database connected') : log.warn('Database not connected - some features may not work'))
      .catch(err => log.warn({ err }, 'Database check failed'));

    // Debug: log all env var names on startup
    const allEnvVars = Object.keys(process.env).sort();
    const anthropicRelated = allEnvVars.filter(k => k.includes('ANTHROPIC') || k.includes('CLAUDE'));
    log.info('Environment variables loaded', {
      totalCount: allEnvVars.length,
      anthropicRelated: anthropicRelated,
      hasAnthropicApiKey: allEnvVars.includes('ANTHROPIC_API_KEY'),
      hasClaudeModel: allEnvVars.includes('CLAUDE_MODEL'),
    });

    if (config.server.isDev) {
      log.info(`📚 API docs at http://localhost:${config.server.port}/docs`);
    }

  } catch (error) {
    log.error('Failed to start server', { error });
    process.exit(1);
  }
}

start();



