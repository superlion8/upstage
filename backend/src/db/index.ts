/**
 * Database Connection
 * Drizzle ORM with PostgreSQL (Supabase)
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '../config/index.js';
import * as schema from './schema.js';

// Create postgres connection with timeout to prevent hanging
// CRITICAL: lazy:true prevents connection at module load time
// fetch_types:false prevents type fetching that can block
const client = postgres(config.database.url, {
  connect_timeout: 5,   // 5 seconds max to connect
  idle_timeout: 20,
  max: 10,
  // These prevent blocking at import time:
  // @ts-ignore - postgres-js types may not include these
  lazy: true,           // Don't connect until first query
  fetch_types: false,   // Don't fetch types on connect (can block)
});

// Create drizzle instance with schema
export const db = drizzle(client, { schema });

// Export schema for convenience
export * from './schema.js';

// Health check
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await client`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}





