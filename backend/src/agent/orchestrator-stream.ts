// @ts-nocheck
/**
 * Streaming Agent Orchestrator
 * 使用 SDK Chat 类自动管理 history（包括 thought_signature）
 */

import { getGenAIClient, extractText, extractFunctionCalls, safetySettings } from '../lib/genai.js';
import { config } from '../config/index.js';
import { AGENT_TOOLS, executeTool, type ToolContext } from './tools/index.js';
import { AGENT_SYSTEM_PROMPT } from './prompts/system.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('agent-stream');

// ============================================
// Types
// ============================================

export interface AgentInput {
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

export interface StreamEvent {
  type: 'thinking' | 'tool_start' | 'tool_result' | 'text_delta' | 'image' | 'done' | 'error';
  data: any;
}

// ============================================
// Constants
// ============================================

const MAX_ITERATIONS = 5;
const THINKING_MODEL = config.ai.models.thinking;

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  'stylist': '搭配师',
  'analyze_image': '图像分析',
  'generate_model_image': '生成模特图',
  'change_outfit': '换搭配',
  'change_model': '换模特',
  'replicate_reference': '复刻参考图',
  'edit_image': '编辑图片',
};

// 控制是否向前端暴露 thinking 内容（默认开启）
const EXPOSE_THINKING = process.env.EXPOSE_THINKING !== 'false';

// ============================================
// Streaming Agent Generator
// ============================================

/**
 * Run agent loop with streaming output
 * 使用 SDK Chat 类自动管理 thought_signature
 */
export async function* runAgentStream(input: AgentInput): AsyncGenerator<StreamEvent> {
  const client = getGenAIClient();

  logger.info('Starting streaming agent run', {
    userId: input.userId,
    conversationId: input.conversationId,
  });

  // 构建图片上下文
  const imageContext: Record<string, string> = {};

  // 创建 Chat Session
  const chat = client.chats.create({
    model: THINKING_MODEL,
    config: {
      tools: [{ functionDeclarations: AGENT_TOOLS as any }],
      safetySettings,
      systemInstruction: AGENT_SYSTEM_PROMPT,
      thinkingConfig: {
        thinkingBudget: 8192,
        includeThoughts: true,
      },
    },
  });

  // 构建当前消息的 parts
  const currentParts = buildCurrentMessageParts(input, imageContext);

  logger.info('Chat session created', {
    currentPartsCount: currentParts.length,
  });

  // Agent Loop
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    logger.info(`Agent iteration ${iteration + 1}/${MAX_ITERATIONS}`);

    try {
      // 发送消息 - SDK 自动处理 thought_signature
      let response;
      if (iteration === 0) {
        // 第一次迭代：发送用户消息
        // 确保 parts 不为空
        if (currentParts.length === 0) {
          currentParts.push({ text: '请帮我处理' });
        }

        // Debug: log the parts being sent
        logger.info('Sending message to chat', {
          partsCount: currentParts.length,
          partTypes: currentParts.map((p: any) => Object.keys(p)),
          hasInlineData: currentParts.some((p: any) => p.inlineData),
          hasText: currentParts.some((p: any) => p.text),
          // Log first 100 chars of base64 for each inlineData part
          inlineDataPreview: currentParts
            .filter((p: any) => p.inlineData)
            .map((p: any) => ({
              mimeType: p.inlineData.mimeType,
              dataLength: p.inlineData.data?.length || 0,
              dataPrefix: p.inlineData.data?.substring(0, 50) || 'null',
            })),
        });

        console.log(`\n[Iteration ${iteration + 1}] Sending user message with ${currentParts.length} parts`);

        // 尝试发送消息，如果失败则回退到纯文本
        // SDK 要求 sendMessage 使用 { message: parts } 格式
        try {
          response = await chat.sendMessage({ message: currentParts });
        } catch (sendError: any) {
          logger.error('sendMessage failed, trying text-only fallback', {
            error: sendError.message,
          });
          // 回退到纯文本消息
          const textOnlyParts = currentParts.filter((p: any) => p.text);
          if (textOnlyParts.length === 0) {
            textOnlyParts.push({ text: '请帮我处理上传的图片' });
          }
          response = await chat.sendMessage({ message: textOnlyParts });
        }
      } else {
        // 后续迭代：sendMessage 已经被 functionResponse 调用了
        // 这里不应该再发送，而是在上一轮工具调用后已经得到了新的 response
        // 这个分支不应该被执行，因为工具调用后会 continue 或 return
        logger.warn('Unexpected iteration without pending message');
        break;
      }

      const candidate = response.candidates?.[0];
      if (!candidate) {
        yield { type: 'error', data: { message: 'No response from agent' } };
        return;
      }

      const parts = candidate.content?.parts || [];
      console.log(`[Iteration ${iteration + 1}] Response parts:`, parts.map((p: any) => Object.keys(p)));

      // 提取并输出 thinking
      const thinkingText = extractThinkingFromParts(parts);
      if (thinkingText && EXPOSE_THINKING) {
        yield { type: 'thinking', data: { content: thinkingText } };
      }

      // 检查是否有工具调用
      const functionCalls = extractFunctionCalls(response);

      if (functionCalls.length > 0) {
        // 处理工具调用
        for (const functionCall of functionCalls) {
          const displayName = TOOL_DISPLAY_NAMES[functionCall.name] || functionCall.name;

          yield {
            type: 'tool_start',
            data: {
              tool: functionCall.name,
              displayName,
              arguments: functionCall.args,
            }
          };

          // 执行工具
          const toolContext: ToolContext = {
            userId: input.userId,
            conversationId: input.conversationId,
            imageContext,
          };

          let toolResult;
          try {
            toolResult = await executeTool(functionCall.name, functionCall.args, toolContext);

            yield {
              type: 'tool_result',
              data: {
                tool: functionCall.name,
                displayName,
                arguments: functionCall.args,
                result: {
                  success: toolResult.success !== false,
                  message: toolResult.message,
                  hasImages: !!toolResult.images?.length,
                },
              }
            };

            // 输出生成的图片
            if (toolResult.images) {
              for (const img of toolResult.images) {
                yield { type: 'image', data: img };
                // 添加到图片上下文
                if (img.data) {
                  imageContext[`generated_${functionCall.name}_${Date.now()}`] = img.data;
                }
              }
            }

          } catch (toolError) {
            logger.error('Tool execution failed', { tool: functionCall.name, error: toolError });
            toolResult = {
              success: false,
              error: toolError instanceof Error ? toolError.message : 'Unknown error'
            };

            yield {
              type: 'tool_result',
              data: {
                tool: functionCall.name,
                displayName,
                result: {
                  success: false,
                  message: toolResult.error,
                },
              }
            };
          }

          // 发送工具响应 - SDK 自动处理 thought_signature
          console.log(`[Iteration ${iteration + 1}] Sending function response for ${functionCall.name}`);
          const nextResponse = await chat.sendMessage({
            message: [{
              functionResponse: {
                name: functionCall.name,
                response: toolResult,
              },
            }]
          });

          const nextCandidate = nextResponse.candidates?.[0];
          if (!nextCandidate) {
            yield { type: 'error', data: { message: 'No response after tool execution' } };
            return;
          }

          const nextParts = nextCandidate.content?.parts || [];
          console.log(`[After tool] Response parts:`, nextParts.map((p: any) => Object.keys(p)));

          // 提取并输出 thinking
          const nextThinking = extractThinkingFromParts(nextParts);
          if (nextThinking && EXPOSE_THINKING) {
            yield { type: 'thinking', data: { content: nextThinking } };
          }

          // 检查是否有更多工具调用
          const nextFunctionCalls = extractFunctionCalls(nextResponse);

          if (nextFunctionCalls.length > 0) {
            // 还有更多工具调用，递归处理
            for await (const event of processToolCalls(
              chat,
              nextFunctionCalls,
              input,
              imageContext,
              iteration + 1
            )) {
              yield event;
            }
            return;
          }

          // 没有更多工具调用，输出最终文本
          const finalText = extractText(nextResponse);
          if (finalText) {
            const chunks = splitIntoChunks(finalText, 10);
            for (const chunk of chunks) {
              yield { type: 'text_delta', data: { delta: chunk } };
              await sleep(20);
            }
          } else {
            yield { type: 'text_delta', data: { delta: '任务完成！' } };
          }
          return;
        }
      } else {
        // 没有工具调用，输出文本响应
        const textResponse = extractText(response) || '有什么我可以帮助您的吗？';

        const chunks = splitIntoChunks(textResponse, 10);
        for (const chunk of chunks) {
          yield { type: 'text_delta', data: { delta: chunk } };
          await sleep(20);
        }
        return;
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      logger.error('Agent iteration error', {
        iteration,
        errorMessage,
        errorStack,
        errorType: error?.constructor?.name,
      });

      yield {
        type: 'error',
        data: {
          message: errorMessage,
          details: errorStack,
          iteration: iteration + 1,
        }
      };
      return;
    }
  }

  yield { type: 'text_delta', data: { delta: '已完成多轮处理，如需进一步调整请告诉我。' } };
}

// ============================================
// 递归处理工具调用
// ============================================

async function* processToolCalls(
  chat: any,
  functionCalls: any[],
  input: AgentInput,
  imageContext: Record<string, string>,
  depth: number
): AsyncGenerator<StreamEvent> {
  if (depth > MAX_ITERATIONS) {
    yield { type: 'text_delta', data: { delta: '已达到最大处理深度。' } };
    return;
  }

  for (const functionCall of functionCalls) {
    const displayName = TOOL_DISPLAY_NAMES[functionCall.name] || functionCall.name;

    yield {
      type: 'tool_start',
      data: {
        tool: functionCall.name,
        displayName,
        arguments: functionCall.args,
      }
    };

    const toolContext: ToolContext = {
      userId: input.userId,
      conversationId: input.conversationId,
      imageContext,
    };

    let toolResult;
    try {
      toolResult = await executeTool(functionCall.name, functionCall.args, toolContext);

      yield {
        type: 'tool_result',
        data: {
          tool: functionCall.name,
          displayName,
          arguments: functionCall.args,
          result: {
            success: toolResult.success !== false,
            message: toolResult.message,
            hasImages: !!toolResult.images?.length,
          },
        }
      };

      if (toolResult.images) {
        for (const img of toolResult.images) {
          yield { type: 'image', data: img };
          if (img.data) {
            imageContext[`generated_${functionCall.name}_${Date.now()}`] = img.data;
          }
        }
      }

    } catch (toolError) {
      logger.error('Tool execution failed', { tool: functionCall.name, error: toolError });
      toolResult = {
        success: false,
        error: toolError instanceof Error ? toolError.message : 'Unknown error'
      };

      yield {
        type: 'tool_result',
        data: {
          tool: functionCall.name,
          displayName,
          result: {
            success: false,
            message: toolResult.error,
          },
        }
      };
    }

    // 发送工具响应
    console.log(`[Depth ${depth}] Sending function response for ${functionCall.name}`);
    const nextResponse = await chat.sendMessage({
      message: [{
        functionResponse: {
          name: functionCall.name,
          response: toolResult,
        },
      }]
    });

    const nextCandidate = nextResponse.candidates?.[0];
    if (!nextCandidate) {
      yield { type: 'error', data: { message: 'No response after tool execution' } };
      return;
    }

    const nextParts = nextCandidate.content?.parts || [];

    // 提取 thinking
    const nextThinking = extractThinkingFromParts(nextParts);
    if (nextThinking && EXPOSE_THINKING) {
      yield { type: 'thinking', data: { content: nextThinking } };
    }

    // 检查是否有更多工具调用
    const nextFunctionCalls = extractFunctionCalls(nextResponse);

    if (nextFunctionCalls.length > 0) {
      // 递归处理
      for await (const event of processToolCalls(
        chat,
        nextFunctionCalls,
        input,
        imageContext,
        depth + 1
      )) {
        yield event;
      }
      return;
    }

    // 输出最终文本
    const finalText = extractText(nextResponse);
    if (finalText) {
      const chunks = splitIntoChunks(finalText, 10);
      for (const chunk of chunks) {
        yield { type: 'text_delta', data: { delta: chunk } };
        await sleep(20);
      }
    } else {
      yield { type: 'text_delta', data: { delta: '任务完成！' } };
    }
    return;
  }
}

// ============================================
// Helper Functions
// ============================================

function extractThinkingFromParts(parts: any[]): string | null {
  const thinkingTexts: string[] = [];

  for (const part of parts) {
    if (part.thought === true && part.text && typeof part.text === 'string') {
      thinkingTexts.push(part.text);
    }
  }

  return thinkingTexts.join('\n').trim() || null;
}

function splitIntoChunks(text: string, chunkSize: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 构建初始历史消息（不包括当前消息）
 */
function buildInitialHistory(input: AgentInput, imageContext: Record<string, string>): any[] {
  const history: any[] = [];

  // 添加对话历史
  for (const msg of input.conversationHistory.slice(-10)) {
    const parts: any[] = [];

    if (msg.content.images) {
      for (const img of msg.content.images) {
        imageContext[img.id] = img.data;
        // Strip data URL prefix if present
        const base64Data = img.data.replace(/^data:image\/\w+;base64,/, '');
        parts.push({
          inlineData: {
            mimeType: img.mimeType || 'image/jpeg',
            data: base64Data,
          },
        });
      }
    }

    if (msg.content.text) {
      parts.push({ text: msg.content.text });
    }

    if (parts.length > 0) {
      history.push({
        role: msg.role === 'user' ? 'user' : 'model',
        parts,
      });
    }
  }

  return history;
}

/**
 * 构建当前消息的 parts
 */
function buildCurrentMessageParts(input: AgentInput, imageContext: Record<string, string>): any[] {
  const parts: any[] = [];

  if (input.message.images) {
    for (let i = 0; i < input.message.images.length; i++) {
      const img = input.message.images[i];
      const imageId = `image_${i + 1}`;
      imageContext[imageId] = img.data;

      // Strip data URL prefix if present
      const base64Data = img.data.replace(/^data:image\/\w+;base64,/, '');

      parts.push({
        inlineData: {
          mimeType: img.mimeType || 'image/jpeg',
          data: base64Data,
        },
      });
    }

    const imageLabels = input.message.images.map((_, i) => `图${i + 1}`).join('、');
    parts.push({ text: `[用户上传了 ${input.message.images.length} 张图片: ${imageLabels}]` });
  }

  if (input.message.text) {
    parts.push({ text: input.message.text });
  }

  return parts;
}
