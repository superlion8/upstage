// @ts-nocheck
/**
 * Streaming Agent Orchestrator
 * 使用 SDK Chat 类自动管理 history（包括 thought_signature）
 */

import { getGenAIClient, extractText, extractFunctionCalls, safetySettings } from '../lib/genai.js';
import { config } from '../config/index.js';
import { AGENT_TOOLS, executeTool } from './tools/index.js';
import { AGENT_SYSTEM_PROMPT } from './prompts/system.js';
import { createLogger } from '../lib/logger.js';
import { MemoryManager } from './memory.js';
import { AgentInput, StreamEvent } from './types.js';

const logger = createLogger('agent-stream');

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
  const imageRegistry: { id: string, desc: string }[] = [];

  // 使用 MemoryManager 构建初始历史和当前消息
  const initialHistory = MemoryManager.buildInitialHistory(input, imageContext, imageRegistry);
  const currentParts = MemoryManager.buildCurrentMessageParts(input, imageContext, imageRegistry);

  // 动态构建 System Prompt (注入图片注册表)
  const dynamicSystemPrompt = AGENT_SYSTEM_PROMPT + MemoryManager.getRegistryPrompt(imageRegistry);

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

  logger.info('Chat session created with modular memory manager', {
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
      const thinkingText = MemoryManager.extractThinking(parts);
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
        const chunks = MemoryManager.splitIntoChunks(actualText, 200);
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
        // 处理工具调用（可能是多工具并行）
        console.log(`[Iteration ${iteration + 1}] Delegating ${functionCalls.length} tool calls to processToolCalls`);
        yield* processToolCalls(chat, functionCalls, input, imageContext, 0);
        return;
      } else {
        // 没有工具调用，输出文本响应
        const textResponse = extractText(response) || '有什么我可以帮助您的吗？';

        const chunks = MemoryManager.splitIntoChunks(textResponse, 200);
        for (const chunk of chunks) {
          yield { type: 'text_delta', data: { delta: chunk } };
          await sleep(10);
        }
        yield { type: 'done', data: {} };
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
    logger.warn(`Max recursion depth reached: ${depth}`);
    yield { type: 'text_delta', data: { delta: '\n\n(已达到最大处理深度)' } };
    return;
  }

  const responseParts: any[] = [];

  // 1. 全部执行并在本地收集结果
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
            outfit_instruct_zh: toolResult.outfit_instruct_zh,
            outfit_instruct_en: toolResult.outfit_instruct_en,
          },
        }
      };

      if (toolResult.images) {
        for (const img of toolResult.images) {
          yield { type: 'image', data: img };
          if (img.data) {
            imageContext[img.id || `gen_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`] = img.data;
          }
        }
      }
    } catch (toolError) {
      logger.error('Tool execution failed', { tool: functionCall.name, error: toolError });
      toolResult = {
        success: false,
        message: toolError instanceof Error ? toolError.message : 'Unknown error'
      };

      yield {
        type: 'tool_result',
        data: {
          tool: functionCall.name,
          displayName,
          result: {
            success: false,
            message: toolResult.message,
          },
        }
      };
    }

    // 收集响应 Part (剥离 base64 以节省 token)
    responseParts.push({
      functionResponse: {
        name: functionCall.name,
        response: MemoryManager.sanitizeToolResult(toolResult),
      }
    });
  }

  // 2. 一次性发送所有工具响应（必须配对发送）
  console.log(`[Depth ${depth}] Sending ${responseParts.length} function responses`);
  const nextResponse = await chat.sendMessage({ message: responseParts });

  const nextCandidate = nextResponse.candidates?.[0];
  if (!nextCandidate) {
    yield { type: 'error', data: { message: 'No response after tool execution' } };
    return;
  }

  const nextParts = nextCandidate.content?.parts || [];

  // 3. 处理后续输出 (Thinking -> Text -> Tools)
  // 提取 Thinking
  const nextThinking = MemoryManager.extractThinking(nextParts);
  if (nextThinking && EXPOSE_THINKING) {
    yield { type: 'thinking', data: { content: nextThinking } };
  }

  // 提取并串流文本
  const actualText = nextParts
    .filter((p: any) => p.text && !p.thought)
    .map((p: any) => p.text)
    .join('\n');

  if (actualText) {
    const chunks = MemoryManager.splitIntoChunks(actualText, 200);
    for (const chunk of chunks) {
      yield { type: 'text_delta', data: { delta: chunk } };
      await sleep(10);
    }
  }

  // 检查是否还有更多工具调用（递归）
  const nextFunctionCalls = extractFunctionCalls(nextResponse);
  if (nextFunctionCalls.length > 0) {
    yield* processToolCalls(chat, nextFunctionCalls, input, imageContext, depth + 1);
  } else {
    // 整个工具链条结束
    yield { type: 'done', data: {} };
  }
}

// ============================================
// Helper Functions
// ============================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

