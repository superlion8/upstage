// @ts-nocheck
/**
 * Authentication Middleware
 * JWT verification and user injection
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { config } from '../config/index.js';

// Extend FastifyRequest to include user
declare module 'fastify' {
  interface FastifyRequest {
    user: {
      id: string;
      email: string;
      role: string;
    };
  }
  
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export async function setupAuth(fastify: FastifyInstance) {
  // Register JWT plugin
  await fastify.register(fastifyJwt, {
    secret: config.jwt.secret,
    sign: {
      expiresIn: config.jwt.expiresIn,
    },
  });
  
  // Decorate with authenticate function
  fastify.decorate('authenticate', async function(request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.status(401).send({
        success: false,
        error: 'Unauthorized',
      });
    }
  });
}



