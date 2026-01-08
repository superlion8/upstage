// @ts-nocheck
/**
 * Claude Agent Orchestrator
 * Main agent loop using Claude Agent SDK
 */

import { query, createSdkMcpServer, type Options, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { config } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { AGENT_SYSTEM_PROMPT } from './prompts/system.js';
import {
    generateModelImageTool,
    changeOutfitTool,
    changeModelTool,
    replicateReferenceTool,
    editImageTool,
    stylistTool,
    analyzeImageTool,
    webScraperTool,
    socialAnalyzerTool,
    videoAnalyzerTool,
} from './tools/claude-adapters/index.js';

const logger = createLogger('claude-orchestrator');

// ============================================
// Types
// ============================================

export interface ClaudeAgentInput {
    userId: string;
    conversationId: string;
    message: {
        text?: string;
        images?: Array<{ id: string; data: string; mimeType: string }>;
    };
    conversationHistory: ConversationMessage[];
}

export interface ConversationMessage {
    role: 'user' | 'assistant';
    content: {
        text?: string;
        images?: Array<{ id: string; data: string; mimeType: string }>;
        generatedImages?: Array<{ id: string; url: string }>;
    };
}

export interface ClaudeStreamEvent {
    type: 'thinking' | 'tool_start' | 'tool_result' | 'text_delta' | 'image' | 'done' | 'error';
    data: any;
}

// ============================================
// MCP Server with Custom Tools
// ============================================

const customMcpServer = createSdkMcpServer({
    name: 'onstage-tools',
    version: '1.0.0',
    tools: [
        generateModelImageTool,
        changeOutfitTool,
        changeModelTool,
        replicateReferenceTool,
        editImageTool,
        stylistTool,
        analyzeImageTool,
        webScraperTool,
        socialAnalyzerTool,
        videoAnalyzerTool,
    ],
});

// ============================================
// Build Prompt with Context
// ============================================

function buildPromptWithContext(input: ClaudeAgentInput): string {
    const parts: string[] = [];

    // Add system instruction
    parts.push(AGENT_SYSTEM_PROMPT);
    parts.push('\n---\n');

    // Add image registry if images are present
    if (input.message.images && input.message.images.length > 0) {
        parts.push('## Image Registry\n');
        input.message.images.forEach((img, i) => {
            parts.push(`[图${i + 1}] ID: ${img.id} (用户上传)\n`);
        });
        parts.push('\n');
    }

    // Add conversation history context (last few turns for context)
    if (input.conversationHistory.length > 0) {
        parts.push('## 最近对话\n');
        const recentHistory = input.conversationHistory.slice(-5);
        for (const msg of recentHistory) {
            if (msg.role === 'user') {
                parts.push(`用户: ${msg.content.text || '[图片]'}\n`);
            } else {
                parts.push(`助手: ${msg.content.text || '[回复]'}\n`);
            }
        }
        parts.push('\n---\n');
    }

    // Add current message
    parts.push('## 当前请求\n');
    if (input.message.images && input.message.images.length > 0) {
        parts.push(`[用户上传了 ${input.message.images.length} 张图片]\n`);
    }
    if (input.message.text) {
        parts.push(input.message.text);
    }

    return parts.join('');
}

// ============================================
// Main Agent Stream Function
// ============================================

/**
 * Run the Claude agent with streaming events
 */
export async function* runClaudeAgentStream(input: ClaudeAgentInput): AsyncGenerator<ClaudeStreamEvent> {
    logger.info('Starting Claude agent run', {
        userId: input.userId,
        conversationId: input.conversationId,
        hasText: !!input.message.text,
        imageCount: input.message.images?.length || 0,
    });

    const prompt = buildPromptWithContext(input);

    const options: Options = {
        model: config.ai.claude?.model || 'claude-sonnet-4-20250514',
        mcpServers: [customMcpServer],
        // Enable extended thinking
        maxThinkingTokens: 8000,
    };

    try {
        logger.info('Creating Claude query', { promptLength: prompt.length, model: options.model });
        const q = query({ prompt, options });

        let messageCount = 0;
        for await (const message of q) {
            messageCount++;
            // Debug: log raw SDK message structure
            logger.info('Claude SDK message received', {
                messageCount,
                messageType: typeof message,
                hasSubtype: 'subtype' in message,
                subtype: (message as any).subtype,
                keys: Object.keys(message),
                rawPreview: JSON.stringify(message).substring(0, 500),
            });

            // Convert SDK message to our event format
            const event = convertSdkMessage(message);
            if (event) {
                logger.info('Converted to event', { eventType: event.type });
                yield event;
            } else {
                logger.info('Message not converted to event');
            }
        }

        logger.info('Claude query completed', { totalMessages: messageCount });

        // Send done event
        yield {
            type: 'done',
            data: { conversationId: input.conversationId },
        };

    } catch (error: any) {
        logger.error('Claude agent error', { error: error.message });
        yield {
            type: 'error',
            data: { message: error.message },
        };
    }
}

// ============================================
// Message Conversion
// ============================================

function convertSdkMessage(message: SDKMessage): ClaudeStreamEvent | null {
    // Handle different message types from Claude Agent SDK
    if ('subtype' in message) {
        switch (message.subtype) {
            case 'assistant':
                // Text response
                if (message.message?.content) {
                    const textContent = message.message.content
                        .filter((c: any) => c.type === 'text')
                        .map((c: any) => c.text)
                        .join('');
                    if (textContent) {
                        return {
                            type: 'text_delta',
                            data: { delta: textContent },
                        };
                    }
                }
                break;

            case 'tool_use':
                // Tool invocation
                return {
                    type: 'tool_start',
                    data: {
                        tool: message.name,
                        arguments: message.input,
                    },
                };

            case 'tool_result':
                // Tool result
                return {
                    type: 'tool_result',
                    data: {
                        tool: message.name,
                        result: message.result,
                    },
                };

            case 'thinking':
                // Extended thinking content
                if (message.thinking) {
                    return {
                        type: 'thinking',
                        data: { content: message.thinking },
                    };
                }
                break;
        }
    }

    return null;
}

// ============================================
// Non-Streaming Version (for compatibility)
// ============================================

export async function runClaudeAgent(input: ClaudeAgentInput): Promise<{
    response: {
        text: string;
        generatedImages?: Array<{ id: string; url: string }>;
    };
    toolCalls: any[];
    thinking?: string;
}> {
    const toolCalls: any[] = [];
    let thinking = '';
    let finalText = '';
    const generatedImages: Array<{ id: string; url: string }> = [];

    for await (const event of runClaudeAgentStream(input)) {
        switch (event.type) {
            case 'thinking':
                thinking += event.data.content + '\n';
                break;
            case 'tool_result':
                toolCalls.push({
                    tool: event.data.tool,
                    result: event.data.result,
                    timestamp: new Date(),
                });
                // Extract images from tool results
                try {
                    const result = JSON.parse(event.data.result);
                    if (result.images) {
                        generatedImages.push(...result.images);
                    }
                } catch { }
                break;
            case 'text_delta':
                finalText += event.data.delta;
                break;
        }
    }

    return {
        response: {
            text: finalText || '任务完成！如果需要进一步调整，请告诉我。',
            generatedImages: generatedImages.length > 0 ? generatedImages : undefined,
        },
        toolCalls,
        thinking: thinking || undefined,
    };
}
