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

  // 构建图片上下文和注册表描述
  const imageContext: Record<string, string> = {};
  const imageRegistry: string[] = [];

  // 构建初始历史
  const initialHistory = buildInitialHistory(input, imageContext, imageRegistry);

  // 构建当前消息的 parts
  const currentParts = buildCurrentMessageParts(input, imageContext, imageRegistry);

  // 动态构建 System Prompt (注入图片注册表)
  let dynamicSystemPrompt = AGENT_SYSTEM_PROMPT;
  if (imageRegistry.length > 0) {
    dynamicSystemPrompt += `\n\n## 当前会话图片资产注册表 (Image Registry)\n如果你需要引用图片，请使用以下 ID：\n${imageRegistry.map(item => `- ${item}`).join('\n')}\n\n注意：旧历史中的图片数据已被剥离以节省 token，请优先根据 ID 引用。`;
  }

  // 创建 Chat Session
  const chat = client.chats.create({
    model: THINKING_MODEL,
    config: {
      tools: [{ functionDeclarations: AGENT_TOOLS as any }],
      safetySettings,
      systemInstruction: dynamicSystemPrompt,
      thinkingConfig: {
        thinkingBudget: 8192,
        includeThoughts: true,
      },
    },
    history: initialHistory,
  });

  logger.info('Chat session created with hybrid memory', {
    historySize: initialHistory.length,
    registrySize: imageRegistry.length,
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

      // ========== TRACE: Model Response ==========
      const modelResponseSummary = {
        iteration: iteration + 1,
        partsCount: parts.length,
        partTypes: parts.map((p: any) => Object.keys(p)),
        hasThinking: parts.some((p: any) => p.thought),
        hasFunctionCall: parts.some((p: any) => p.functionCall),
        hasText: parts.some((p: any) => p.text && !p.thought),
      };
      logger.info(`[TRACE] Model Response:`, modelResponseSummary);
      console.log(`\n[TRACE] Model Response (Iteration ${iteration + 1}):`, JSON.stringify(modelResponseSummary, null, 2));

      // 提取并输出 thinking
      const thinkingText = extractThinkingFromParts(parts);
      if (thinkingText && EXPOSE_THINKING) {
        yield { type: 'thinking', data: { content: thinkingText } };
      }

      // 提取并输出普通文本内容 (VLM 搭配建议等)
      // 注意：过滤掉作为 thought 的 text 部分
      const actualText = parts
        .filter((p: any) => p.text && !p.thought)
        .map((p: any) => p.text)
        .join('\n');

      if (actualText) {
        console.log(`[Iteration ${iteration + 1}] Found actual text (${actualText.length} chars): ${actualText.substring(0, 100)}...`);
        const chunks = splitIntoChunks(actualText, 200);
        for (const chunk of chunks) {
          yield { type: 'text_delta', data: { delta: chunk } };
          await sleep(10);
        }
      }

      // 检查是否有工具调用
      const functionCalls = extractFunctionCalls(response);

      if (functionCalls.length > 0) {
        console.log(`[TRACE] Function calls detected: ${functionCalls.map((fc: any) => fc.name).join(', ')}`);
      }

      if (functionCalls.length > 0) {
        // 处理工具调用
        for (const functionCall of functionCalls) {
          const displayName = TOOL_DISPLAY_NAMES[functionCall.name] || functionCall.name;

          // ========== TRACE: Tool Call Start ==========
          logger.info(`[TRACE] Tool Call: ${functionCall.name}`, {
            tool: functionCall.name,
            input: functionCall.args,
          });
          console.log(`\n========================================`);
          console.log(`[TRACE] Tool: ${functionCall.name}`);
          console.log(`[TRACE] Input:`, JSON.stringify(functionCall.args, null, 2));
          console.log(`========================================`);

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

            // ========== TRACE: Tool Result ==========
            const resultSummary = {
              success: toolResult.success !== false,
              message: toolResult.message,
              hasImages: !!toolResult.images?.length,
              imageCount: toolResult.images?.length || 0,
              // 显示部分文本预览，但不显示完整 base64
              ...(toolResult.outfit_instruct_zh ? { outfit_instruct_zh: toolResult.outfit_instruct_zh.substring(0, 100) + '...' } : {}),
              ...(toolResult.outfit_instruct_en ? { outfit_instruct_en: toolResult.outfit_instruct_en.substring(0, 100) + '...' } : {}),
            };
            logger.info(`[TRACE] Tool Result: ${functionCall.name}`, resultSummary);
            console.log(`[TRACE] Output:`, JSON.stringify(resultSummary, null, 2));
            console.log(`========================================\n`);

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
                  // 传递搭配建议给前端展示
                  outfit_instruct_zh: toolResult.outfit_instruct_zh,
                  outfit_instruct_en: toolResult.outfit_instruct_en,
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

          // 发送工具响应 - 去掉 base64 图片数据以避免 token 超限
          console.log(`[Iteration ${iteration + 1}] Sending function response for ${functionCall.name}`);

          // 过滤掉 base64 图片数据，只保留元数据
          const sanitizedResult = sanitizeToolResultForModel(toolResult);

          const nextResponse = await chat.sendMessage({
            message: [{
              functionResponse: {
                name: functionCall.name,
                response: sanitizedResult,
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
  yield { type: 'done', data: {} };
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
            // 传递搭配建议给前端展示
            outfit_instruct_zh: toolResult.outfit_instruct_zh,
            outfit_instruct_en: toolResult.outfit_instruct_en,
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

    // 发送工具响应 - 去掉 base64 图片数据以避免 token 超限
    console.log(`[Depth ${depth}] Sending function response for ${functionCall.name}`);
    const sanitizedResult = sanitizeToolResultForModel(toolResult);
    const nextResponse = await chat.sendMessage({
      message: [{
        functionResponse: {
          name: functionCall.name,
          response: sanitizedResult,
        },
      }]
    });

    const nextCandidate = nextResponse.candidates?.[0];
    if (!nextCandidate) {
      yield { type: 'error', data: { message: 'No response after tool execution' } };
      return;
    }

    const nextParts = nextCandidate.content?.parts || [];

    // 提取并输出 thinking
    const nextThinking = extractThinkingFromParts(nextParts);
    if (nextThinking && EXPOSE_THINKING) {
      yield { type: 'thinking', data: { content: nextThinking } };
    }

    // 提取并输出普通文本内容
    const actualText = nextParts
      .filter((p: any) => p.text && !p.thought)
      .map((p: any) => p.text)
      .join('\n');

    if (actualText) {
      console.log(`[Depth ${depth}] Found actual text (${actualText.length} chars): ${actualText.substring(0, 100)}...`);
      const chunks = splitIntoChunks(actualText, 200);
      for (const chunk of chunks) {
        yield { type: 'text_delta', data: { delta: chunk } };
        await sleep(10);
      }
    }

    // 检查是否有更多工具调用
    const nextFunctionCalls = extractFunctionCalls(nextResponse);

    if (nextFunctionCalls.length > 0) {
      try {
        yield* processToolCalls(chat, nextFunctionCalls, input, imageContext, depth + 1);
      } catch (recurseError) {
        logger.error('Recursive tool call failed', { depth, error: recurseError });
        yield { type: 'error', data: { message: 'Recursive processing failed', details: String(recurseError) } };
      }
      return;
    }

    // 这一轮没有新的工具调用，递归结束。
    // 由于上面已经 yield 了 actualText，这里不需要再处理 finalText。
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
 * 过滤工具结果中的 base64 图片数据，避免发送给模型时 token 超限
 * 只保留图片的元数据（id, url 前缀），不包含完整数据
 */
function sanitizeToolResultForModel(result: any): any {
  if (!result) return result;

  // 如果有 images 数组，移除 base64 data 字段
  if (result.images && Array.isArray(result.images)) {
    return {
      ...result,
      images: result.images.map((img: any) => ({
        id: img.id,
        url: img.url ? `[图片已生成: ${img.id}]` : undefined,
        // 不包含 data 字段
      })),
      message: result.message || `已生成 ${result.images.length} 张图片`,
    };
  }

  // 如果有搭配建议，截断发送给模型的文本（可选，如果太长）
  if (result.outfit_instruct_zh || result.outfit_instruct_en) {
    return {
      ...result,
      // 保持完整发送给模型，除非确认这里也导致了超限。
      // 目前主要超限是图片，文字几百字通常没问题。
      // 如果需要截断，可以在这里做。
    };
  }

  return result;
}

/**
 * 构建初始历史消息（不包括当前消息）
 * 实现滑动窗口和 Base64 剥离
 */
function buildInitialHistory(input: AgentInput, imageContext: Record<string, string>, imageRegistry: string[]): any[] {
  const history: any[] = [];
  const FULL_CONTEXT_WINDOW = 6; // 最近 6 条消息（约 3 轮对话）保留完整数据

  const historyMessages = input.conversationHistory;
  const totalCount = historyMessages.length;

  for (let i = 0; i < totalCount; i++) {
    const msg = historyMessages[i];
    const isWithinWindow = (totalCount - i) <= FULL_CONTEXT_WINDOW;
    const parts: any[] = [];

    // 1. 处理用户上传图片
    if (msg.content.images) {
      for (const img of msg.content.images) {
        if (img.id && img.data) {
          imageContext[img.id] = img.data;

          const desc = `[用户上传] ID: ${img.id}`;
          if (!imageRegistry.includes(desc)) imageRegistry.push(desc);

          if (isWithinWindow) {
            // 在窗口内，保留 base64
            const base64Data = img.data.replace(/^data:image\/\w+;base64,/, '');
            parts.push({
              inlineData: {
                mimeType: img.mimeType || 'image/jpeg',
                data: base64Data,
              },
            });
          } else {
            // 窗口外，剥离数据，只留占位符
            parts.push({ text: `[已缓存图片: ${img.id}]` });
          }
        }
      }
    }

    // 2. 处理已生成的图片（同步到注册表，用于引用）
    if (msg.content.generatedImages) {
      for (const img of msg.content.generatedImages) {
        if (img.id && img.url) {
          if (img.url.startsWith('data:')) {
            imageContext[img.id] = img.url;
          }
          const desc = `[生成结果] ID: ${img.id}`;
          if (!imageRegistry.includes(desc)) imageRegistry.push(desc);
        }
      }
    }

    // 3. 处理文本
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
function buildCurrentMessageParts(input: AgentInput, imageContext: Record<string, string>, imageRegistry: string[]): any[] {
  const parts: any[] = [];

  if (input.message.images) {
    for (let i = 0; i < input.message.images.length; i++) {
      const img = input.message.images[i];
      const imageId = img.id || `image_${Date.now()}_${i}`;
      imageContext[imageId] = img.data;

      const desc = `[当前上传] ID: ${imageId}`;
      if (!imageRegistry.includes(desc)) imageRegistry.push(desc);

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

  if (input.message.text) {
    parts.push({ text: input.message.text });
  }

  return parts;
}
