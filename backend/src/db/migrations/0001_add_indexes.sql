-- ============================================
-- Migration: Add indexes, updatedAt, and images table
-- Date: 2026-01-11
-- ============================================

-- Issue #1: Add updatedAt to messages table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL;

-- Issue #4: Add database indexes for common queries
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_assets_user_id ON assets(user_id);
CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(type);
CREATE INDEX IF NOT EXISTS idx_assets_created_at ON assets(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_generations_user_id ON generations(user_id);
CREATE INDEX IF NOT EXISTS idx_generations_status ON generations(status);

-- Issue #2: Add normalized images table
CREATE TABLE IF NOT EXISTS images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    url TEXT NOT NULL,
    path TEXT,
    storage_type VARCHAR(50) DEFAULT 'volume' NOT NULL,
    
    mime_type VARCHAR(100),
    width INTEGER,
    height INTEGER,
    size INTEGER,
    
    source VARCHAR(50),
    prompt TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_images_user_id ON images(user_id);
