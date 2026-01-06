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
  
  // Google AI
  GOOGLE_API_KEY: z.string().min(1),
  
  // Models
  THINKING_MODEL: z.string().default('gemini-2.5-pro-preview-05-06'),
  STYLIST_MODEL: z.string().default('gemini-2.5-flash-preview-05-20'),
  IMAGE_GEN_MODEL: z.string().default('gemini-2.0-flash-preview-image-generation'),
  ANALYSIS_MODEL: z.string().default('gemini-2.5-flash-preview-05-20'),
  
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
    apiKey: env.GOOGLE_API_KEY,
    models: {
      thinking: env.THINKING_MODEL,
      stylist: env.STYLIST_MODEL,
      imageGen: env.IMAGE_GEN_MODEL,
      analysis: env.ANALYSIS_MODEL,
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



