// @ts-nocheck
/**
 * Claude Agent Orchestrator
 * Main agent loop using Anthropic SDK (HTTP API)
 */

import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { AGENT_SYSTEM_PROMPT } from './prompts/system.js';
import { TOOL_EXECUTORS, AGENT_TOOLS } from './tools/index.js';

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
// Anthropic Client
// ============================================

function getAnthropicClient(): Anthropic {
    const apiKey = config.ai.claude?.apiKey;
    if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY is not configured');
    }
    return new Anthropic({ apiKey });
}

// ============================================
// Tool Definitions for Claude
// ============================================

function getClaudeToolDefinitions(): Anthropic.Tool[] {
    // Convert our tool definitions to Claude format
    return AGENT_TOOLS.map(tool => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters as Anthropic.Tool.InputSchema,
    }));
}

// ============================================
// Helpers
// ============================================

/**
 * Remove large binary data from tool results before sending to LLM context
 */
function getLeanResult(result: any): any {
    if (!result) return result;
    const lean = JSON.parse(JSON.stringify(result));

    // Recursively strip large strings (base64)
    const strip = (obj: any) => {
        if (!obj || typeof obj !== 'object') return;

        for (const key in obj) {
            if (typeof obj[key] === 'string') {
                // Strip fields that typically contain base64 or large data URLs
                if (key === 'data' || key === 'base64' || (key === 'url' && obj[key].startsWith('data:'))) {
                    obj[key] = `[REMOVED_BINARY_DATA_${obj[key].length}_CHARS]`;
                }
            } else if (typeof obj[key] === 'object') {
                strip(obj[key]);
            }
        }
    };

    strip(lean);
    return lean;
}

// ============================================
// Build Messages
// ============================================

function buildClaudeMessages(input: ClaudeAgentInput): Anthropic.MessageParam[] {
    const messages: Anthropic.MessageParam[] = [];

    // Add conversation history (text only - no images to save tokens)
    for (const msg of input.conversationHistory.slice(-5)) {
        if (msg.role === 'user') {
            // For history, only include text (images are too large for context)
            let historyText = msg.content.text || '';
            if (msg.content.images && msg.content.images.length > 0) {
                historyText = `[用户上传了 ${msg.content.images.length} 张图片] ` + historyText;
            }
            if (historyText) {
                messages.push({ role: 'user', content: historyText });
            }
        } else {
            // Assistant messages - only text
            let assistantText = msg.content.text || '';
            if (msg.content.generatedImages && msg.content.generatedImages.length > 0) {
                assistantText += ` [已生成 ${msg.content.generatedImages.length} 张图片]`;
            }
            if (assistantText) {
                messages.push({ role: 'assistant', content: assistantText });
            }
        }
    }

    // Add current message
    const currentContent: Anthropic.ContentBlockParam[] = [];

    // Add current images with ID info
    const imageIds: string[] = [];
    if (input.message.images) {
        for (const img of input.message.images) {
            const base64Data = img.data.replace(/^data:image\/\w+;base64,/, '');
            currentContent.push({
                type: 'image',
                source: {
                    type: 'base64',
                    media_type: (img.mimeType || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                    data: base64Data,
                },
            });
            imageIds.push(img.id);
        }
    }

    // Add text with image registry info
    let textContent = '';
    if (imageIds.length > 0) {
        textContent += `[上传的图片 ID: ${imageIds.join(', ')}]\n\n`;
    }
    if (input.message.text) {
        textContent += input.message.text;
    }
    if (textContent) {
        currentContent.push({ type: 'text', text: textContent });
    }

    if (currentContent.length > 0) {
        messages.push({ role: 'user', content: currentContent });
    }

    return messages;
}

// ============================================
// Main Agent Stream Function
// ============================================

const MAX_ITERATIONS = 5;

export async function* runClaudeAgentStream(input: ClaudeAgentInput): AsyncGenerator<ClaudeStreamEvent> {
    logger.info('Starting Claude agent run', {
        userId: input.userId,
        conversationId: input.conversationId,
        hasText: !!input.message.text,
        imageCount: input.message.images?.length || 0,
    });

    const client = getAnthropicClient();
    const model = config.ai.claude?.model || 'claude-sonnet-4-20250514';
    const tools = getClaudeToolDefinitions();
    let messages = buildClaudeMessages(input);

    // Image context for tool execution
    const imageContext: Record<string, string> = {};

    // Add current images to context
    if (input.message.images) {
        for (const img of input.message.images) {
            imageContext[img.id] = img.data;
        }
    }

    try {
        for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
            logger.info(`Claude iteration ${iteration + 1}/${MAX_ITERATIONS}`);

            // Create message with extended thinking
            const response = await client.messages.create({
                model,
                max_tokens: 16000,
                thinking: {
                    type: 'enabled',
                    budget_tokens: 8000,
                },
                system: AGENT_SYSTEM_PROMPT + '\n\n## 回复格式\n请使用 Markdown 格式回复，包括标题、列表、粗体等，让回复更加清晰美观。',
                tools,
                messages,
            });

            const toolUses: Array<{ id: string; name: string; input: any }> = [];

            logger.info('Claude response received', {
                stopReason: response.stop_reason,
                contentBlocks: response.content.length,
            });

            // Process response content - extract thinking and text
            for (const block of response.content) {
                if (block.type === 'thinking') {
                    // Emit thinking content
                    yield {
                        type: 'thinking',
                        data: { content: block.thinking },
                    };
                } else if (block.type === 'text') {
                    yield {
                        type: 'text_delta',
                        data: { delta: block.text },
                    };
                } else if (block.type === 'tool_use') {
                    toolUses.push({
                        id: block.id,
                        name: block.name,
                        input: block.input,
                    });
                }
            }

            // If no tool calls, we're done
            if (response.stop_reason !== 'tool_use' || toolUses.length === 0) {
                logger.info('Claude finished (no tool calls)');
                break;
            }

            // Execute tools
            const toolResults: Anthropic.ToolResultBlockParam[] = [];

            for (const toolUse of toolUses) {
                yield {
                    type: 'tool_start',
                    data: { tool: toolUse.name, arguments: toolUse.input },
                };

                try {
                    const executor = TOOL_EXECUTORS[toolUse.name];
                    if (!executor) {
                        throw new Error(`Unknown tool: ${toolUse.name}`);
                    }

                    const result = await executor(toolUse.input, {
                        userId: input.userId,
                        conversationId: input.conversationId,
                        imageContext,
                    });

                    // Update image context if tool generated images
                    if (result.images) {
                        for (const img of result.images) {
                            imageContext[img.id] = img.url || img.data;
                            yield {
                                type: 'image',
                                data: { id: img.id, url: img.url },
                            };
                        }
                    }

                    yield {
                        type: 'tool_result',
                        data: { tool: toolUse.name, arguments: toolUse.input, result },
                    };

                    toolResults.push({
                        type: 'tool_result',
                        tool_use_id: toolUse.id,
                        content: JSON.stringify(getLeanResult(result)),
                    });

                } catch (error: any) {
                    logger.error('Tool execution failed', { tool: toolUse.name, error: error.message });

                    toolResults.push({
                        type: 'tool_result',
                        tool_use_id: toolUse.id,
                        content: JSON.stringify({ success: false, error: error.message }),
                        is_error: true,
                    });
                }
            }

            // Add assistant response and tool results to messages for next iteration
            messages.push({
                role: 'assistant',
                content: response.content,
            });

            messages.push({
                role: 'user',
                content: toolResults,
            });
        }

        // Send done event
        yield {
            type: 'done',
            data: { conversationId: input.conversationId },
        };

    } catch (error: any) {
        logger.error('Claude agent error', { error: error.message, stack: error.stack });
        yield {
            type: 'error',
            data: { message: error.message },
        };
    }
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
    let finalText = '';
    const generatedImages: Array<{ id: string; url: string }> = [];

    for await (const event of runClaudeAgentStream(input)) {
        switch (event.type) {
            case 'tool_result':
                toolCalls.push({
                    tool: event.data.tool,
                    arguments: event.data.arguments,
                    result: event.data.result,
                    timestamp: new Date(),
                });
                break;
            case 'text_delta':
                finalText += event.data.delta;
                break;
            case 'image':
                generatedImages.push({ id: event.data.id, url: event.data.url });
                break;
        }
    }

    return {
        response: {
            text: finalText || '任务完成！如果需要进一步调整，请告诉我。',
            generatedImages: generatedImages.length > 0 ? generatedImages : undefined,
        },
        toolCalls,
    };
}
