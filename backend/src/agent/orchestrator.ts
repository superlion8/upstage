// @ts-nocheck
/**
 * Agent Orchestrator
 * Main agent loop that coordinates thinking LLM and tool execution
 */

import { getGenAIClient, extractText, extractFunctionCalls, extractThinking, safetySettings } from '../lib/genai.js';
import { config } from '../config/index.js';
import { AGENT_TOOLS, executeTool, type ToolContext } from './tools/index.js';
import { AGENT_SYSTEM_PROMPT } from './prompts/system.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('agent');

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

export interface AgentOutput {
  response: {
    text: string;
    generatedImages?: Array<{ id: string; url: string; thumbnailUrl?: string }>;
    guiRequest?: {
      type: string;
      message?: string;
      prefillData?: Record<string, any>;
    };
  };
  toolCalls: ToolCallRecord[];
  thinking?: string;
}

export interface ToolCallRecord {
  tool: string;
  arguments: Record<string, any>;
  result: any;
  timestamp: Date;
}

interface AgentContext {
  messages: any[];
  imageContext: Record<string, string>;
}

// ============================================
// Constants
// ============================================

const MAX_ITERATIONS = 5;
const THINKING_MODEL = config.ai.models.thinking;

// 工具名称显示映射
function getToolDisplayName(toolName: string): string {
  const nameMap: Record<string, string> = {
    'stylist': '搭配师',
    'analyze_image': '图像分析',
    'generate_model_image': '生成模特图',
    'change_outfit': '换搭配',
    'change_model': '换模特',
    'replicate_reference': '复刻参考图',
    'edit_image': '编辑图片',
  };
  return nameMap[toolName] || toolName;
}

// ============================================
// Main Agent Function
// ============================================

/**
 * Run the agent loop
 * 1. Build context from conversation history and current message
 * 2. Call thinking LLM with tools
 * 3. If tool call: execute tool, append result, continue loop
 * 4. If no tool call: return final response
 */
export async function runAgent(input: AgentInput): Promise<AgentOutput> {
  const client = getGenAIClient();
  const toolCalls: ToolCallRecord[] = [];
  let thinking = '';
  
  logger.info('Starting agent run', { 
    userId: input.userId, 
    conversationId: input.conversationId,
    hasText: !!input.message.text,
    imageCount: input.message.images?.length || 0,
  });
  
  // Build initial context
  let context = buildContext(input);
  
  // Agent Loop
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    logger.debug(`Agent iteration ${iteration + 1}/${MAX_ITERATIONS}`);
    
    try {
      // Call Thinking LLM
      logger.info(`Calling LLM model: ${THINKING_MODEL}`);
      const llmStartTime = Date.now();
      
      const response = await client.models.generateContent({
        model: THINKING_MODEL,
        contents: [
          { role: 'user', parts: [{ text: AGENT_SYSTEM_PROMPT }] },
          { role: 'model', parts: [{ text: '我理解了，我是 Onstage 的 AI 助手，专门帮助用户生成服饰营销内容。我会根据用户的需求选择合适的工具来完成任务。' }] },
          ...context.messages,
        ],
        config: {
          tools: [{ functionDeclarations: AGENT_TOOLS as any }],
          safetySettings,
          // 启用 thinking 输出
          thinkingConfig: {
            thinkingBudget: 8192, // 允许足够的思考 token
            includeThoughts: true, // 包含思考内容在输出中
          },
        },
      });
      
      logger.info(`LLM response received`, { duration: Date.now() - llmStartTime });
      
      const candidate = response.candidates?.[0];
      if (!candidate) {
        throw new Error('No response from agent');
      }
      
      // 调试：打印完整的 candidate 结构（部分）
      logger.debug('Candidate structure', {
        hasContent: !!candidate.content,
        partsCount: candidate.content?.parts?.length || 0,
        partTypes: candidate.content?.parts?.map((p: any) => Object.keys(p)) || [],
        candidateKeys: Object.keys(candidate),
      });
      
      // Extract thinking process (if model supports it)
      const iterationThinking = extractThinking(response);
      logger.info('Thinking extraction result', { 
        hasThinking: !!iterationThinking, 
        thinkingLength: iterationThinking?.length || 0,
        thinkingPreview: iterationThinking?.slice(0, 100) || 'none',
      });
      if (iterationThinking) {
        thinking += iterationThinking + '\n';
      }
      
      // Check for function calls
      const functionCalls = extractFunctionCalls(response);
      
      if (functionCalls.length > 0) {
        const functionCall = functionCalls[0]; // Handle one at a time
        
        logger.info('Tool call detected', { tool: functionCall.name, args: functionCall.args });
        
        // 提取模型响应的完整 parts（包含 thought 和 thought_signature）
        const modelParts = candidate.content?.parts || [];
        
        // 调试日志：查看 modelParts 结构
        logger.info('Model parts structure', {
          partsCount: modelParts.length,
          partTypes: modelParts.map((p: any) => Object.keys(p)),
          hasThought: modelParts.some((p: any) => p.thought),
          hasThoughtSignature: modelParts.some((p: any) => p.thoughtSignature),
          hasFunctionCall: modelParts.some((p: any) => p.functionCall),
        });
        
        // Execute tool
        const toolContext: ToolContext = {
          userId: input.userId,
          conversationId: input.conversationId,
          imageContext: context.imageContext,
        };
        
        try {
          const toolResult = await executeTool(functionCall.name, functionCall.args, toolContext);
          
          // Record tool call
          toolCalls.push({
            tool: functionCall.name,
            arguments: functionCall.args,
            result: toolResult,
            timestamp: new Date(),
          });
          
          logger.info('Tool executed successfully', { 
            tool: functionCall.name, 
            hasImages: !!toolResult.images,
            shouldContinue: toolResult.shouldContinue,
          });
          
          // Check if this is a GUI request - 需要用户输入，直接返回
          if (functionCall.name === 'request_gui_input') {
            return {
              response: {
                text: toolResult.message || '请在下方完成操作',
                guiRequest: {
                  type: functionCall.args.gui_type,
                  message: functionCall.args.message,
                  prefillData: functionCall.args.prefill_data,
                },
              },
              toolCalls,
              thinking,
            };
          }
          
          // 将工具结果添加到上下文，让模型继续思考
          context = appendToolResult(
            context, 
            functionCall.name, 
            functionCall.args, 
            toolResult,
            modelParts  // 传入完整的 model parts（包含 thought_signature）
          );
          
          // 如果工具返回了图片且标记为不需要继续，则直接返回
          // 否则继续 loop 让模型决定下一步
          if (toolResult.images && toolResult.shouldContinue === false) {
            logger.info('Tool returned images and marked as complete, ending loop');
            return {
              response: {
                text: toolResult.message || '图片已生成完成 ✨',
                generatedImages: toolResult.images,
              },
              toolCalls,
              thinking,
            };
          }
          
          // 继续下一轮迭代，让模型看到工具结果并决定下一步
          logger.info('Continuing agent loop after tool execution');
          continue;
          
        } catch (toolError) {
          logger.error('Tool execution failed', { tool: functionCall.name, error: toolError });
          
          // 工具执行失败，记录失败信息
          toolCalls.push({
            tool: functionCall.name,
            arguments: functionCall.args,
            result: { success: false, error: toolError instanceof Error ? toolError.message : 'Unknown error' },
            timestamp: new Date(),
          });
          
          // 将错误信息添加到上下文，让模型决定如何处理
          context = appendToolResult(
            context, 
            functionCall.name, 
            functionCall.args, 
            { success: false, error: toolError instanceof Error ? toolError.message : 'Unknown error' },
            modelParts
          );
          
          // 继续让模型处理错误情况
          continue;
        }
      }
      
      // No tool call - model is ready to give final response
      logger.info('No tool call detected, extracting final response', { iteration: iteration + 1 });
      
      const textResponse = extractText(response);
      
      // Collect all generated images from tool calls
      const generatedImages = toolCalls
        .filter(tc => tc.result?.images)
        .flatMap(tc => tc.result.images);
      
      logger.info('Agent loop completed', { 
        totalIterations: iteration + 1, 
        totalToolCalls: toolCalls.length,
        hasGeneratedImages: generatedImages.length > 0,
        thinkingLength: thinking.length,
      });
      
      return {
        response: {
          text: textResponse || '任务完成！如果需要进一步调整，请告诉我。',
          generatedImages: generatedImages.length > 0 ? generatedImages : undefined,
        },
        toolCalls,
        thinking,
      };
      
    } catch (error) {
      logger.error('Agent iteration error', { iteration, error });
      throw error;
    }
  }
  
  // Max iterations reached
  logger.warn('Agent reached max iterations');
  
  const generatedImages = toolCalls
    .filter(tc => tc.result?.images)
    .flatMap(tc => tc.result.images);
  
  return {
    response: {
      text: '我已经完成了多轮处理，这是目前的结果。如果需要进一步调整，请告诉我。',
      generatedImages: generatedImages.length > 0 ? generatedImages : undefined,
    },
    toolCalls,
    thinking,
  };
}

// ============================================
// Context Building
// ============================================

/**
 * Build context from conversation history and current message
 */
function buildContext(input: AgentInput): AgentContext {
  const messages: any[] = [];
  const imageContext: Record<string, string> = {};
  
  // Add conversation history (last 10 turns)
  const recentHistory = input.conversationHistory.slice(-10);
  for (const msg of recentHistory) {
    if (msg.role === 'user') {
      const parts: any[] = [];
      
      if (msg.content.text) {
        parts.push({ text: msg.content.text });
      }
      
      if (msg.content.images) {
        for (const img of msg.content.images) {
          parts.push({
            inlineData: {
              mimeType: img.mimeType || 'image/jpeg',
              data: img.data.replace(/^data:image\/\w+;base64,/, ''),
            },
          });
        }
      }
      
      if (parts.length > 0) {
        messages.push({ role: 'user', parts });
      }
    } else if (msg.role === 'assistant') {
      messages.push({
        role: 'model',
        parts: [{ text: msg.content.text || '' }],
      });
    }
  }
  
  // Add current message
  const currentParts: any[] = [];
  
  // Process uploaded images
  if (input.message.images && input.message.images.length > 0) {
    for (let i = 0; i < input.message.images.length; i++) {
      const img = input.message.images[i];
      const imageId = `image_${i + 1}`;
      
      // Store in imageContext for tool use
      imageContext[imageId] = img.data;
      
      // Add image to message
      currentParts.push({
        inlineData: {
          mimeType: img.mimeType || 'image/jpeg',
          data: img.data.replace(/^data:image\/\w+;base64,/, ''),
        },
      });
    }
    
    // Add image labels to text
    const imageLabels = input.message.images.map((_, i) => `图${i + 1}`).join('、');
    const imageNote = `[用户上传了 ${input.message.images.length} 张图片: ${imageLabels}]`;
    currentParts.push({ text: imageNote });
  }
  
  // Add text
  if (input.message.text) {
    currentParts.push({ text: input.message.text });
  }
  
  if (currentParts.length > 0) {
    messages.push({ role: 'user', parts: currentParts });
  }
  
  return { messages, imageContext };
}

/**
 * Append tool result to context
 * @param modelParts - 模型响应的完整 parts（包含 thought、thought_signature 和 functionCall）
 */
function appendToolResult(
  context: AgentContext, 
  toolName: string, 
  toolArgs: Record<string, any>,
  result: any,
  modelParts?: any[]
): AgentContext {
  // 调试：打印 appendToolResult 接收到的 modelParts
  logger.info('appendToolResult called', {
    toolName,
    modelPartsCount: modelParts?.length || 0,
    modelPartTypes: modelParts?.map((p: any) => Object.keys(p)) || [],
  });
  
  // 添加模型响应（包含完整的 parts 以保留 thought_signature）
  if (modelParts && modelParts.length > 0) {
    // 使用模型返回的完整 parts（包含 thought, thought_signature, functionCall）
    context.messages.push({
      role: 'model',
      parts: modelParts,
    });
    logger.info('Added model parts to context', { partsCount: modelParts.length });
  } else {
    // 兜底：如果没有 modelParts，使用简化版本
    logger.warn('No modelParts provided, using fallback');
    context.messages.push({
      role: 'model',
      parts: [{
        functionCall: {
          name: toolName,
          args: toolArgs,
        },
      }],
    });
  }
  
  // 添加函数响应
  context.messages.push({
    role: 'user',
    parts: [{
      functionResponse: {
        name: toolName,
        response: result,
      },
    }],
  });
  
  // If result contains images, add them to imageContext
  if (result.images) {
    for (let i = 0; i < result.images.length; i++) {
      const img = result.images[i];
      const imageId = `generated_${toolName}_${i + 1}`;
      if (img.data) {
        context.imageContext[imageId] = img.data;
      } else if (img.url) {
        context.imageContext[imageId] = img.url;
      }
    }
  }
  
  return context;
}



