/**
 * Database Schema
 * Drizzle ORM schema definitions for PostgreSQL
 */

import { pgTable, uuid, varchar, text, timestamp, integer, boolean, jsonb, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ============================================
// Enums
// ============================================

export const userRoleEnum = pgEnum('user_role', ['user', 'admin', 'guest']);
export const assetTypeEnum = pgEnum('asset_type', ['model', 'product', 'scene', 'generated', 'reference']);
export const messageRoleEnum = pgEnum('message_role', ['user', 'assistant', 'system']);
export const messageStatusEnum = pgEnum('message_status', ['sending', 'sent', 'failed', 'generating']);
export const generationStatusEnum = pgEnum('generation_status', ['pending', 'processing', 'completed', 'failed']);

// ============================================
// Users
// ============================================

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  name: varchar('name', { length: 100 }),
  avatarUrl: text('avatar_url'),
  role: userRoleEnum('role').default('user').notNull(),

  // 设备绑定（游客登录用）
  deviceId: varchar('device_id', { length: 100 }).unique(),

  // Quota
  quotaTotal: integer('quota_total').default(100).notNull(),
  quotaUsed: integer('quota_used').default(0).notNull(),
  quotaResetAt: timestamp('quota_reset_at', { withTimezone: true }),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
});

// ============================================
// Conversations
// ============================================

export const conversations = pgTable('conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================
// Messages
// ============================================

export const messages = pgTable('messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  role: messageRoleEnum('role').notNull(),
  status: messageStatusEnum('status').default('sent').notNull(),

  // Content
  textContent: text('text_content'),
  // Image URLs (max 10 recommended)
  imageUrls: jsonb('image_urls').$type<string[]>(),
  // Generated image URLs (max 10 recommended)
  generatedImageUrls: jsonb('generated_image_urls').$type<string[]>(),

  // Agent metadata
  // Tool calls array - store only essential result data
  toolCalls: jsonb('tool_calls').$type<Array<{
    tool: string;
    args: Record<string, any>;
    result: { success: boolean; message?: string };  // Lean result only
  }>>(),
  thinking: text('thinking'),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================
// Images (Normalized Storage)
// ============================================

export const images = pgTable('images', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),

  // Storage info
  url: text('url').notNull(),         // Public accessible URL
  path: text('path'),                 // Internal filesystem/volume path
  storageType: varchar('storage_type', { length: 50 }).default('volume').notNull(), // 'volume', 's3', 'base64'

  // Metadata
  mimeType: varchar('mime_type', { length: 100 }),
  width: integer('width'),
  height: integer('height'),
  size: integer('size'),

  // Context
  source: varchar('source', { length: 50 }), // 'upload', 'generated', 'reference'
  prompt: text('prompt'),                    // Generation prompt if applicable

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================
// Assets
// ============================================

export const assets = pgTable('assets', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: assetTypeEnum('type').notNull(),

  // File info
  name: varchar('name', { length: 255 }),
  url: text('url').notNull(),
  thumbnailUrl: text('thumbnail_url'),
  mimeType: varchar('mime_type', { length: 100 }),
  fileSize: integer('file_size'),

  // Metadata
  tags: jsonb('tags').$type<string[]>(),
  metadata: jsonb('metadata').$type<Record<string, any>>(),

  // For generated assets
  sourceConversationId: uuid('source_conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
  sourceMessageId: uuid('source_message_id').references(() => messages.id, { onDelete: 'set null' }),
  generationPrompt: text('generation_prompt'),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================
// Presets (System-provided assets)
// ============================================

export const presets = pgTable('presets', {
  id: uuid('id').defaultRandom().primaryKey(),
  type: assetTypeEnum('type').notNull(),

  // Info
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  url: text('url').notNull(),
  thumbnailUrl: text('thumbnail_url'),

  // Categorization
  category: varchar('category', { length: 100 }),
  style: varchar('style', { length: 100 }),
  tags: jsonb('tags').$type<string[]>(),

  // Metadata
  metadata: jsonb('metadata').$type<Record<string, any>>(),

  // Status
  isActive: boolean('is_active').default(true).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================
// Generations (Generation history/tracking)
// ============================================

export const generations = pgTable('generations', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
  messageId: uuid('message_id').references(() => messages.id, { onDelete: 'set null' }),

  // Generation info
  type: varchar('type', { length: 50 }).notNull(), // 'model_image', 'change_outfit', etc.
  status: generationStatusEnum('status').default('pending').notNull(),

  // Input
  inputImages: jsonb('input_images').$type<string[]>(),
  prompt: text('prompt'),
  parameters: jsonb('parameters').$type<Record<string, any>>(),

  // Output
  outputImages: jsonb('output_images').$type<string[]>(),
  error: text('error'),

  // Metrics
  processingTimeMs: integer('processing_time_ms'),
  modelUsed: varchar('model_used', { length: 100 }),
  tokensUsed: integer('tokens_used'),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

// ============================================
// Shoot Room Sessions
// ============================================

export const shootRoomSessions = pgTable('shoot_room_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),

  // Name
  name: varchar('name', { length: 255 }),

  // Configuration
  config: jsonb('config').$type<{
    model?: { id: string; url: string };
    product?: { id: string; url: string };
    scene?: { id: string; url: string };
    sceneObjects?: Array<{ id: string; type: string; position: { x: number; y: number } }>;
    lighting?: {
      position: { x: number; y: number };
      direction: number;
      intensity: number;
    };
    camera?: {
      position: { x: number; y: number };
      angle: 'high' | 'eye' | 'low';
      focalLength: number;
    };
  }>(),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================
// Relations
// ============================================

export const usersRelations = relations(users, ({ many }) => ({
  conversations: many(conversations),
  assets: many(assets),
  generations: many(generations),
  shootRoomSessions: many(shootRoomSessions),
  images: many(images),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  user: one(users, {
    fields: [conversations.userId],
    references: [users.id],
  }),
  messages: many(messages),
  assets: many(assets),
  generations: many(generations),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

export const assetsRelations = relations(assets, ({ one }) => ({
  user: one(users, {
    fields: [assets.userId],
    references: [users.id],
  }),
  sourceConversation: one(conversations, {
    fields: [assets.sourceConversationId],
    references: [conversations.id],
  }),
  sourceMessage: one(messages, {
    fields: [assets.sourceMessageId],
    references: [messages.id],
  }),
}));

export const generationsRelations = relations(generations, ({ one }) => ({
  user: one(users, {
    fields: [generations.userId],
    references: [users.id],
  }),
  conversation: one(conversations, {
    fields: [generations.conversationId],
    references: [conversations.id],
  }),
  message: one(messages, {
    fields: [generations.messageId],
    references: [messages.id],
  }),
}));

export const shootRoomSessionsRelations = relations(shootRoomSessions, ({ one }) => ({
  user: one(users, {
    fields: [shootRoomSessions.userId],
    references: [users.id],
  }),
}));

export const imagesRelations = relations(images, ({ one }) => ({
  user: one(users, {
    fields: [images.userId],
    references: [users.id],
  }),
}));

// ============================================
// Types
// ============================================

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;

export type Preset = typeof presets.$inferSelect;
export type NewPreset = typeof presets.$inferInsert;

export type Generation = typeof generations.$inferSelect;
export type NewGeneration = typeof generations.$inferInsert;

export type ShootRoomSession = typeof shootRoomSessions.$inferSelect;
export type NewShootRoomSession = typeof shootRoomSessions.$inferInsert;



