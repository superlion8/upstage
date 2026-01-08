/**
 * Claude Agent SDK Client
 * Centralized Claude client management
 */

import { query, tool, type Options, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { config } from '../config/index.js';
import { createLogger } from './logger.js';
import { z } from 'zod';

const logger = createLogger('lib:claude');

// Re-export SDK functions for convenience
export { query, tool };
export type { Options, SDKMessage };

// ============================================
// Client Helpers
// ============================================

/**
 * Check if Claude Agent SDK is available
 */
export function isClaudeAvailable(): boolean {
    return !!config.ai.claude?.apiKey;
}

/**
 * Get default query options
 * Note: ANTHROPIC_API_KEY must be set as environment variable
 */
export function getDefaultOptions(): Partial<Options> {
    return {
        model: config.ai.claude?.model,
    };
}

/**
 * Run a Claude Agent query with streaming
 */
export async function* runClaudeQuery(
    prompt: string,
    options: Partial<Options> = {}
): AsyncGenerator<SDKMessage> {
    if (!isClaudeAvailable()) {
        throw new Error('ANTHROPIC_API_KEY is not configured');
    }

    logger.info('Starting Claude Agent query', { promptLength: prompt.length });

    const mergedOptions: Options = {
        ...getDefaultOptions(),
        ...options,
    } as Options;

    const q = query({
        prompt,
        options: mergedOptions,
    });

    for await (const message of q) {
        yield message;
    }
}

// ============================================
// Tool Definition Helpers
// ============================================

/**
 * Create a Claude SDK tool from a Gemini-style definition
 */
export function createClaudeTool<T extends z.ZodRawShape>(
    name: string,
    description: string,
    schema: T,
    handler: (args: z.infer<z.ZodObject<T>>) => Promise<any>
) {
    return tool(name, description, schema, async (args) => {
        const result = await handler(args as any);
        return {
            content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        };
    });
}

// ============================================
// Message Format Helpers
// ============================================

export interface ClaudeImagePart {
    type: 'image';
    source: {
        type: 'base64';
        media_type: string;
        data: string;
    };
}

export interface ClaudeTextPart {
    type: 'text';
    text: string;
}

export type ClaudeContentPart = ClaudeImagePart | ClaudeTextPart;

/**
 * Create Claude image content block from base64 data
 */
export function createClaudeImagePart(base64Data: string, mimeType: string = 'image/jpeg'): ClaudeImagePart {
    // Strip data URL prefix if present
    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');

    return {
        type: 'image',
        source: {
            type: 'base64',
            media_type: mimeType,
            data: cleanBase64,
        },
    };
}

/**
 * Create Claude text content block
 */
export function createClaudeTextPart(text: string): ClaudeTextPart {
    return {
        type: 'text',
        text,
    };
}
