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
import { createImageStore, ImageStore } from './image-store.js';

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

// ============================================
// Anthropic Client
// ============================================

function getAnthropicClient(): Anthropic {
    const apiKey = config.ai.claude?.apiKey;
    if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY is not configured');
    }
    return new Anthropic({
        apiKey,
        baseURL: config.ai.claude?.apiBase,
    });
}

// ============================================
// Tool Definitions
// ============================================

function getClaudeToolDefinitions(): Anthropic.Tool[] {
    return AGENT_TOOLS.map(tool => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters as Anthropic.Tool.InputSchema,
    }));
}

// ============================================
// Helpers
// ============================================

function getLeanResult(result: any): any {
    if (!result) return result;
    const lean = JSON.parse(JSON.stringify(result));
    const strip = (obj: any) => {
        if (!obj || typeof obj !== 'object') return;
        for (const key in obj) {
            if (typeof obj[key] === 'string') {
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

function buildClaudeMessages(input: ClaudeAgentInput, imageStore: ImageStore): Anthropic.MessageParam[] {
    const messages: Anthropic.MessageParam[] = [];

    // 1. History
    for (const msg of input.conversationHistory) {
        if (msg.role === 'user') {
            let historyText = msg.content.text || '';
            if (msg.content.images && msg.content.images.length > 0) {
                const labels: string[] = [];
                for (const img of msg.content.images) {
                    const id = imageStore.register({
                        id: img.id,
                        data: img.data,
                        type: 'reference',
                        description: 'User uploaded image from history',
                        aliases: [`image_${msg.content.images.indexOf(img) + 1} (history)`]
                    });
                    labels.push(id);
                }
                historyText = `[用户在历史记录中上传了图片: ${labels.join(', ')}] ` + historyText;
            }
            if (historyText) {
                messages.push({ role: 'user', content: historyText });
            }
        } else {
            let assistantText = msg.content.text || '';
            if (msg.content.generatedImages && msg.content.generatedImages.length > 0) {
                const labels: string[] = [];
                for (const img of msg.content.generatedImages) {
                    const id = imageStore.register({
                        id: img.id,
                        data: img.url,
                        type: 'generated',
                        description: 'Previously generated image',
                        aliases: [img.url]
                    });
                    labels.push(id);
                }
                assistantText += ` [已生成图片: ${labels.join(', ')}]`;
            }
            if (assistantText) {
                messages.push({ role: 'assistant', content: assistantText });
            }
        }
    }

    // 2. Current Input
    const currentContent: Anthropic.MessageParam['content'] = [];

    if (input.message.images && input.message.images.length > 0) {
        for (let i = 0; i < input.message.images.length; i++) {
            const img = input.message.images[i];
            const mimeType = img.mimeType || 'image/jpeg';

            const id = imageStore.register({
                id: img.id,
                data: img.data,
                type: 'uploaded',
                description: 'User uploaded image in current turn',
                aliases: [`image_${i + 1}`]
            });

            const base64Data = img.data.replace(/^data:image\/\w+;base64,/, '');

            currentContent.push({
                type: 'image',
                source: {
                    type: 'base64',
                    media_type: mimeType as any,
                    data: base64Data,
                },
            });

            currentContent.push({
                type: 'text',
                text: `[Uploaded Image ID: ${id}]`
            });
        }
    }

    if (input.message.text) {
        currentContent.push({
            type: 'text',
            text: input.message.text,
        });
    }

    if (currentContent.length > 0) {
        messages.push({ role: 'user', content: currentContent as any });
    }

    return messages;
}

// ============================================
// Main Runner
// ============================================

export async function runClaudeAgent(input: ClaudeAgentInput): Promise<{
    response: {
        text: string;
        generatedImages: Array<{ id: string; url: string }>;
        guiRequest?: any;
    };
    toolCalls: any[];
    thinking: string;
}> {
    const client = getAnthropicClient();
    const imageStore = createImageStore();
    const messages = buildClaudeMessages(input, imageStore);
    const toolDefinitions = getClaudeToolDefinitions();

    const toolCalls: any[] = [];
    const generatedImages: Array<{ id: string; url: string }> = [];
    let thinking = '';
    let finalResponseText = '';

    let iteration = 0;
    const maxIterations = 5;

    while (iteration < maxIterations) {
        iteration++;
        logger.info(`Claude iteration ${iteration}/${maxIterations}`);

        const imagePrompt = imageStore.getAvailableImagesPrompt();
        const systemPrompt = `${AGENT_SYSTEM_PROMPT}\n\n${imagePrompt}`;

        try {
            const stream = client.messages.stream({
                model: 'claude-3-7-sonnet-20250219',
                max_tokens: 4096,
                system: systemPrompt,
                messages: messages,
                tools: toolDefinitions,
            });

            let currentContentBlock: any = {};

            for await (const event of stream) {
                if (event.type === 'content_block_start') {
                    if (event.content_block.type === 'tool_use') {
                        currentContentBlock = {
                            type: 'tool_use',
                            id: event.content_block.id,
                            name: event.content_block.name,
                            input: '',
                        };
                    }
                } else if (event.type === 'content_block_delta') {
                    if (event.delta.type === 'text_delta') {
                        const text = event.delta.text;
                        if (!currentContentBlock.text) currentContentBlock.text = '';
                        currentContentBlock.text += text;
                        if (!currentContentBlock.type) currentContentBlock.type = 'text';

                    } else if (event.delta.type === 'input_json_delta') {
                        if (currentContentBlock.type === 'tool_use') {
                            currentContentBlock.input += event.delta.partial_json;
                        }
                    } else if (event.delta.type === 'thinking_delta') {
                        thinking += event.delta.thinking;
                    }
                } else if (event.type === 'content_block_stop') {
                    if (currentContentBlock.type === 'tool_use') {
                        // pass
                    } else if (currentContentBlock.type === 'text') {
                        finalResponseText += currentContentBlock.text;
                    }
                    currentContentBlock = {};
                }
            }

            const finalMessage = await stream.finalMessage();
            messages.push({ role: 'assistant', content: finalMessage.content });

            const toolUseBlocks = finalMessage.content.filter((c: any) => c.type === 'tool_use');

            if (toolUseBlocks.length === 0) {
                logger.info('Claude response complete', { stopReason: finalMessage.stop_reason });
                break;
            }

            const toolResults: any[] = [];

            for (const toolUse of toolUseBlocks) {
                if (toolUse.type !== 'tool_use') continue;

                logger.info(`Executing tool: ${toolUse.name}`, { input: toolUse.input });

                try {
                    const executor = TOOL_EXECUTORS[toolUse.name];
                    if (!executor) {
                        throw new Error(`Unknown tool: ${toolUse.name}`);
                    }

                    const result = await executor(toolUse.input as any, {
                        userId: input.userId,
                        conversationId: input.conversationId,
                        imageContext: imageStore.getAllContext(),
                        imageStore: imageStore,
                    });

                    if (result.images) {
                        for (const img of result.images) {
                            const id = imageStore.register({
                                id: img.id,
                                data: img.data || img.url,
                                type: 'generated',
                                description: `Generated by tool ${toolUse.name}`,
                                aliases: [img.url, img.id]
                            });
                            generatedImages.push({ id: img.id, url: img.url });
                        }
                    }

                    const leanResult = getLeanResult(result);

                    toolResults.push({
                        type: 'tool_result',
                        tool_use_id: toolUse.id,
                        content: JSON.stringify(leanResult),
                        is_error: false
                    });

                    toolCalls.push({
                        tool: toolUse.name,
                        arguments: toolUse.input,
                        result: leanResult,
                        timestamp: new Date()
                    });

                } catch (error: any) {
                    logger.error(`Tool execution failed`, { tool: toolUse.name, error: error.message });
                    toolResults.push({
                        type: 'tool_result',
                        tool_use_id: toolUse.id,
                        content: `Error: ${error.message}`,
                        is_error: true
                    });

                    toolCalls.push({
                        tool: toolUse.name,
                        arguments: toolUse.input,
                        result: { success: false, message: error.message },
                        timestamp: new Date()
                    });
                }
            }

            if (toolResults.length > 0) {
                messages.push({ role: 'user', content: toolResults });
            }

        } catch (error) {
            logger.error('Claude API error', error);
            throw error;
        }
    }

    return {
        response: {
            text: finalResponseText,
            generatedImages: generatedImages.length > 0 ? generatedImages : undefined,
        },
        toolCalls,
        thinking,
    };
}

// ============================================
// Streaming Runner
// ============================================

export type ClaudeStreamEvent =
    | { type: 'text_delta'; data: { delta: string } }
    | { type: 'thinking'; data: { content: string } }
    | { type: 'tool_start'; data: { tool: string; displayName: string; arguments: any } }
    | { type: 'tool_result'; data: { tool: string; result: any; arguments: any } }
    | { type: 'image'; data: { id: string; url: string; mimeType: string } }
    ;

export async function* runClaudeAgentStream(input: ClaudeAgentInput): AsyncGenerator<ClaudeStreamEvent> {
    const client = getAnthropicClient();
    const imageStore = createImageStore();
    const messages = buildClaudeMessages(input, imageStore);
    const toolDefinitions = getClaudeToolDefinitions();

    let iteration = 0;
    const maxIterations = 5;

    // We maintain local history for the loop
    const localMessages = [...messages];

    while (iteration < maxIterations) {
        iteration++;
        logger.info(`Claude stream iteration ${iteration}/${maxIterations}`);

        const imagePrompt = imageStore.getAvailableImagesPrompt();
        const systemPrompt = `${AGENT_SYSTEM_PROMPT}\n\n${imagePrompt}`;

        const stream = client.messages.stream({
            model: 'claude-3-7-sonnet-20250219',
            max_tokens: 4096,
            system: systemPrompt,
            messages: localMessages,
            tools: toolDefinitions,
        });

        let currentContentBlock: any = {};

        // --- 1. Stream the API response ---
        for await (const event of stream) {
            if (event.type === 'content_block_start') {
                if (event.content_block.type === 'tool_use') {
                    currentContentBlock = {
                        type: 'tool_use',
                        id: event.content_block.id,
                        name: event.content_block.name,
                        input: '',
                    };
                }
            } else if (event.type === 'content_block_delta') {
                if (event.delta.type === 'text_delta') {
                    if (!currentContentBlock.text) currentContentBlock.text = '';
                    currentContentBlock.text += event.delta.text;
                    currentContentBlock.type = 'text';

                    // Yield text delta
                    yield { type: 'text_delta', data: { delta: event.delta.text } };

                } else if (event.delta.type === 'input_json_delta') {
                    if (currentContentBlock.type === 'tool_use') {
                        currentContentBlock.input += event.delta.partial_json;
                    }
                } else if (event.delta.type === 'thinking_delta') {
                    // Yield thinking event for frontend display
                    yield { type: 'thinking', data: { content: event.delta.thinking } };
                }
            } else if (event.type === 'content_block_stop') {
                if (currentContentBlock.type === 'text') {
                    // done with text block
                }
                currentContentBlock = {};
            }
        }

        // --- 2. Handle Tool Execution ---
        const finalMessage = await stream.finalMessage();
        localMessages.push({ role: 'assistant', content: finalMessage.content });

        const toolUseBlocks = finalMessage.content.filter((c: any) => c.type === 'tool_use');

        if (toolUseBlocks.length === 0) {
            break; // Done
        }

        const toolResults: any[] = [];

        for (const toolUse of toolUseBlocks) {
            if (toolUse.type !== 'tool_use') continue;

            logger.info(`Executing tool (stream): ${toolUse.name}`, { input: toolUse.input });

            // Yield tool_start event BEFORE executing
            yield {
                type: 'tool_start',
                data: {
                    tool: toolUse.name,
                    displayName: toolUse.name.replace(/_/g, ' '),
                    arguments: toolUse.input
                }
            };

            try {
                const executor = TOOL_EXECUTORS[toolUse.name];
                if (!executor) throw new Error(`Unknown tool: ${toolUse.name}`);

                const result = await executor(toolUse.input as any, {
                    userId: input.userId,
                    conversationId: input.conversationId,
                    imageContext: imageStore.getAllContext(),
                    imageStore: imageStore,
                });

                // Handle generated images
                if (result.images) {
                    for (const img of result.images) {
                        const id = imageStore.register({
                            id: img.id,
                            data: img.data || img.url,
                            type: 'generated',
                            description: `Generated by tool ${toolUse.name}`,
                            aliases: [img.url, img.id]
                        });

                        // Yield image event so frontend can display it
                        yield {
                            type: 'image',
                            data: {
                                id: img.id,
                                url: img.url,
                                mimeType: img.mimeType || 'image/jpeg'
                            }
                        };
                    }
                }

                const leanResult = getLeanResult(result);

                toolResults.push({
                    type: 'tool_result',
                    tool_use_id: toolUse.id,
                    content: JSON.stringify(leanResult),
                    is_error: false
                });

                // Yield tool result to client
                yield {
                    type: 'tool_result',
                    data: {
                        tool: toolUse.name,
                        result: leanResult,
                        arguments: toolUse.input
                    }
                };

            } catch (error: any) {
                logger.error(`Tool execution failed`, { tool: toolUse.name, error: error.message });
                toolResults.push({
                    type: 'tool_result',
                    tool_use_id: toolUse.id,
                    content: `Error: ${error.message}`,
                    is_error: true
                });
                // Yield error result?
            }
        }

        if (toolResults.length > 0) {
            localMessages.push({ role: 'user', content: toolResults });
        }
    }
}
