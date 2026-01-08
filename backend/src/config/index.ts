/**
 * Application Configuration
 * Centralized configuration management with environment variable validation
 */

import { z } from 'zod';

// Environment schema validation
const envSchema = z.object({
  // Server
  PORT: z.string().default('3000'),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database (Railway provides DATABASE_URL automatically)
  DATABASE_URL: z.string().min(1),

  // Supabase (optional - for storage and auth)
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

  // Redis (optional)
  REDIS_URL: z.string().optional(),

  // Google AI / Vertex AI
  GEMINI_API_KEY: z.string().min(1), // Works for both AI Studio and Vertex AI
  VERTEX_AI_ENABLED: z.string().default('true'), // Use Vertex AI endpoint

  // Sora 2 API
  SORA_API_KEY: z.string().optional(),
  SORA_MODEL: z.string().default('sora-2'),

  // Claude / Anthropic AI
  ANTHROPIC_API_KEY: z.string().optional(),
  CLAUDE_MODEL: z.string().default('claude-sonnet-4-20250514'),

  // Models
  THINKING_MODEL: z.string().default('gemini-3-flash-preview'),
  STYLIST_MODEL: z.string().default('gemini-3-flash-preview'),
  IMAGE_GEN_MODEL: z.string().default('gemini-3-pro-image-preview'),
  ANALYSIS_MODEL: z.string().default('gemini-3-flash-preview'),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),

  // Rate Limiting
  RATE_LIMIT_MAX: z.string().default('100'),
  RATE_LIMIT_WINDOW_MS: z.string().default('60000'),

  // Storage
  STORAGE_BUCKET: z.string().default('onstage-assets'),
  MAX_FILE_SIZE_MB: z.string().default('10'),

  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

// Parse and validate environment variables
function loadConfig() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(result.error.format());
    process.exit(1);
  }

  return result.data;
}

// Export validated config
const env = loadConfig();

export const config = {
  // Server
  server: {
    port: parseInt(env.PORT, 10),
    host: env.HOST,
    isDev: env.NODE_ENV === 'development',
    isProd: env.NODE_ENV === 'production',
    isTest: env.NODE_ENV === 'test',
  },

  // Database
  database: {
    url: env.DATABASE_URL,
    supabaseUrl: env.SUPABASE_URL || null,
    supabaseAnonKey: env.SUPABASE_ANON_KEY || null,
    supabaseServiceKey: env.SUPABASE_SERVICE_ROLE_KEY || null,
  },

  // Redis (optional)
  redis: {
    url: env.REDIS_URL || null,
    enabled: !!env.REDIS_URL,
  },

  // AI Models
  ai: {
    apiKey: env.GEMINI_API_KEY,
    vertexAI: {
      enabled: env.VERTEX_AI_ENABLED === 'true',
    },
    models: {
      thinking: env.THINKING_MODEL,
      stylist: env.STYLIST_MODEL,
      imageGen: env.IMAGE_GEN_MODEL,
      analysis: env.ANALYSIS_MODEL,
    },
    sora: {
      apiKey: env.SORA_API_KEY || env.GEMINI_API_KEY, // Fallback if applicable or separate
      model: env.SORA_MODEL,
    },
    claude: {
      apiKey: env.ANTHROPIC_API_KEY || null,
      model: env.CLAUDE_MODEL,
      enabled: !!env.ANTHROPIC_API_KEY,
    },
  },

  // JWT
  jwt: {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
  },

  // Rate Limiting
  rateLimit: {
    max: parseInt(env.RATE_LIMIT_MAX, 10),
    windowMs: parseInt(env.RATE_LIMIT_WINDOW_MS, 10),
  },

  // Storage
  storage: {
    bucket: env.STORAGE_BUCKET,
    maxFileSizeMB: parseInt(env.MAX_FILE_SIZE_MB, 10),
    maxFileSizeBytes: parseInt(env.MAX_FILE_SIZE_MB, 10) * 1024 * 1024,
  },

  // Logging
  logging: {
    level: env.LOG_LEVEL,
  },
} as const;

export type Config = typeof config;



