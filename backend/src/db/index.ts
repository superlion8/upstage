/**
 * Database Connection
 * Drizzle ORM with PostgreSQL (Supabase)
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '../config/index.js';
import * as schema from './schema.js';

// Create postgres connection
const client = postgres(config.database.url);

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



