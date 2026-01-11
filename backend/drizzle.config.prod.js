/**
 * Drizzle Config for Production (runs against compiled JS)
 */
export default {
    schema: './dist/db/schema.js',
    out: './dist/db/migrations',
    dialect: 'postgresql',
    dbCredentials: {
        url: process.env.DATABASE_URL,
    },
    verbose: true,
    strict: true,
};
