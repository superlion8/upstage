// @ts-nocheck
/**
 * Streaming Agent Orchestrator
 * Agent loop with streaming output via async generator
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

interface AgentContext {
  messages: any[];
  imageContext: Record<string, string>;
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

// ============================================
// Streaming Agent Generator
// ============================================

/**
 * Run agent loop with streaming output
 * Yields StreamEvent objects for each step
 */
export async function* runAgentStream(input: AgentInput): AsyncGenerator<StreamEvent> {
  const client = getGenAIClient();
  
  logger.info('Starting streaming agent run', { 
    userId: input.userId, 
    conversationId: input.conversationId,
  });
  
  // Build initial context
  let context = buildContext(input);
  
  // Agent Loop
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    logger.info(`Agent iteration ${iteration + 1}/${MAX_ITERATIONS}`);
    
    try {
      const isFirstIteration = iteration === 0;
      
      // 打印发送的 contents 结构（用于调试 thought_signature 问题）
      const fullContents = [
        { role: 'user', parts: [{ text: AGENT_SYSTEM_PROMPT }] },
        { role: 'model', parts: [{ text: '我理解了，我是 Onstage 的 AI 助手。' }] },
        ...context.messages,
      ];
      
      logger.info('=== FULL REQUEST CONTENTS ===', {
        iteration: iteration + 1,
        totalContentsCount: fullContents.length,
      });
      
      // 详细打印每个 content block
      fullContents.forEach((content, idx) => {
        const partsInfo = content.parts.map((part: any, pIdx: number) => {
          const keys = Object.keys(part);
          return {
            partIndex: pIdx,
            keys,
            hasThought: part.thought === true,
            // 检查 thought_signature（可能是 camelCase 或 snake_case）
            hasThoughtSignature: !!(part.thoughtSignature || part.thought_signature),
            thoughtSignaturePreview: part.thoughtSignature ? 
              part.thoughtSignature.substring(0, 50) + '...' : 
              (part.thought_signature ? part.thought_signature.substring(0, 50) + '...' : null),
            hasFunctionCall: !!part.functionCall,
            functionCallName: part.functionCall?.name,
            hasFunctionResponse: !!part.functionResponse,
            functionResponseName: part.functionResponse?.name,
            hasText: !!part.text,
            textPreview: part.text ? part.text.substring(0, 50) + '...' : null,
          };
        });
        
        logger.info(`Content block ${idx}`, {
          role: content.role,
          partsCount: content.parts.length,
          partsInfo,
        });
      });
      
      // 如果是第二次迭代，打印完整的 JSON（用于对比）
      if (iteration > 0) {
        logger.info('Context messages JSON (iteration > 0):', {
          messagesJson: JSON.stringify(context.messages.map((m: any) => ({
            role: m.role,
            partsKeys: m.parts.map((p: any) => Object.keys(p)),
          })), null, 2),
        });
      }
      
      // Call LLM - 始终启用 thinking
      const response = await client.models.generateContent({
        model: THINKING_MODEL,
        contents: [
          { role: 'user', parts: [{ text: AGENT_SYSTEM_PROMPT }] },
          { role: 'model', parts: [{ text: '我理解了，我是 Onstage 的 AI 助手。' }] },
          ...context.messages,
        ],
        config: {
          tools: [{ functionDeclarations: AGENT_TOOLS as any }],
          safetySettings,
          thinkingConfig: {
            thinkingBudget: 8192,
            includeThoughts: true,
          },
        },
      });
      
      const candidate = response.candidates?.[0];
      if (!candidate) {
        yield { type: 'error', data: { message: 'No response from agent' } };
        return;
      }
      
      // Extract and stream thinking
      const thinkingText = extractThinkingFromParts(candidate.content?.parts || []);
      if (thinkingText) {
        yield { type: 'thinking', data: { content: thinkingText } };
      }
      
      // Check for function calls
      const functionCalls = extractFunctionCalls(response);
      
      if (functionCalls.length > 0) {
        const functionCall = functionCalls[0];
        const displayName = TOOL_DISPLAY_NAMES[functionCall.name] || functionCall.name;
        
        // Yield tool start event
        yield { 
          type: 'tool_start', 
          data: { 
            tool: functionCall.name, 
            displayName,
            arguments: functionCall.args,
          } 
        };
        
        const modelParts = candidate.content?.parts || [];
        
        // 详细日志：查看 modelParts 中的 thought_signature
        logger.info('=== MODEL RESPONSE PARTS ===');
        modelParts.forEach((part: any, idx: number) => {
          const partInfo: Record<string, any> = {
            partIndex: idx,
            keys: Object.keys(part),
          };
          
          if (part.thought === true) {
            partInfo.thought = true;
            partInfo.textPreview = part.text ? part.text.substring(0, 100) + '...' : null;
          }
          
          if (part.functionCall) {
            partInfo.functionCall = {
              name: part.functionCall.name,
              hasArgs: !!part.functionCall.args,
            };
          }
          
          // 关键：检查 thought_signature
          if (part.thoughtSignature) {
            partInfo.thoughtSignature = part.thoughtSignature.substring(0, 80) + '...';
          }
          if (part.thought_signature) {
            partInfo.thought_signature = part.thought_signature.substring(0, 80) + '...';
          }
          
          // 检查是否有其他未知字段
          const knownKeys = ['thought', 'text', 'functionCall', 'thoughtSignature', 'thought_signature', 'inlineData'];
          const unknownKeys = Object.keys(part).filter(k => !knownKeys.includes(k));
          if (unknownKeys.length > 0) {
            partInfo.unknownKeys = unknownKeys;
            partInfo.unknownValues = unknownKeys.reduce((acc, k) => {
              acc[k] = typeof part[k] === 'string' ? part[k].substring(0, 50) + '...' : typeof part[k];
              return acc;
            }, {} as Record<string, any>);
          }
          
          logger.info(`Model part ${idx}:`, partInfo);
        });
        
        // 打印完整的 parts JSON 用于调试
        logger.info('Full modelParts JSON:', JSON.stringify(modelParts, (key, value) => {
          // 截断长字符串
          if (typeof value === 'string' && value.length > 200) {
            return value.substring(0, 200) + '...[truncated]';
          }
          return value;
        }, 2));
        
        // Execute tool
        const toolContext: ToolContext = {
          userId: input.userId,
          conversationId: input.conversationId,
          imageContext: context.imageContext,
        };
        
        try {
          const toolResult = await executeTool(functionCall.name, functionCall.args, toolContext);
          
          // Yield tool result event
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
          
          // If images were generated, yield them
          if (toolResult.images) {
            for (const img of toolResult.images) {
              yield { type: 'image', data: img };
            }
          }
          
          // Add result to context - 保留完整的 modelParts（包括 thought_signature）
          logger.info('Adding tool result to context', {
            modelPartsCount: modelParts.length,
            modelPartsKeys: modelParts.map((p: any) => Object.keys(p)),
          });
          context = appendToolResult(context, functionCall.name, functionCall.args, toolResult, modelParts);
          
          // If tool marked as complete with images, end loop
          if (toolResult.images && toolResult.shouldContinue === false) {
            // Yield final text
            yield { type: 'text_delta', data: { delta: toolResult.message || '图片已生成完成 ✨' } };
            return;
          }
          
          // Continue to next iteration
          continue;
          
        } catch (toolError) {
          logger.error('Tool execution failed', { tool: functionCall.name, error: toolError });
          
          yield { 
            type: 'tool_result', 
            data: { 
              tool: functionCall.name,
              displayName,
              result: {
                success: false,
                message: toolError instanceof Error ? toolError.message : 'Unknown error',
              },
            } 
          };
          
          // Add error to context and continue
          context = appendToolResult(
            context, 
            functionCall.name, 
            functionCall.args, 
            { success: false, error: toolError instanceof Error ? toolError.message : 'Unknown error' },
            modelParts
          );
          continue;
        }
      }
      
      // No tool call - extract final response and stream it
      const textResponse = extractText(response) || '任务完成！';
      
      // Stream text in chunks for a typing effect
      const chunks = splitIntoChunks(textResponse, 10);
      for (const chunk of chunks) {
        yield { type: 'text_delta', data: { delta: chunk } };
        // Small delay for typing effect (optional, can be removed)
        await sleep(20);
      }
      
      return;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      logger.error('Agent iteration error', { 
        iteration, 
        errorMessage,
        errorStack,
        errorType: error?.constructor?.name,
      });
      
      // 发送详细错误信息到前端
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
  
  // Max iterations reached
  yield { type: 'text_delta', data: { delta: '已完成多轮处理，如需进一步调整请告诉我。' } };
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

function buildContext(input: AgentInput): AgentContext {
  const messages: any[] = [];
  const imageContext: Record<string, string> = {};
  
  // Add conversation history
  for (const msg of input.conversationHistory.slice(-10)) {
    const parts: any[] = [];
    
    if (msg.content.images) {
      for (let i = 0; i < msg.content.images.length; i++) {
        const img = msg.content.images[i];
        imageContext[img.id] = img.data;
        parts.push({
          inlineData: {
            mimeType: img.mimeType,
            data: img.data,
          },
        });
      }
    }
    
    if (msg.content.text) {
      parts.push({ text: msg.content.text });
    }
    
    if (parts.length > 0) {
      messages.push({
        role: msg.role === 'user' ? 'user' : 'model',
        parts,
      });
    }
  }
  
  // Add current message
  const currentParts: any[] = [];
  
  if (input.message.images) {
    for (let i = 0; i < input.message.images.length; i++) {
      const img = input.message.images[i];
      const imageId = `image_${i + 1}`;
      imageContext[imageId] = img.data;
      
      currentParts.push({
        inlineData: {
          mimeType: img.mimeType,
          data: img.data,
        },
      });
    }
    
    const imageLabels = input.message.images.map((_, i) => `图${i + 1}`).join('、');
    currentParts.push({ text: `[用户上传了 ${input.message.images.length} 张图片: ${imageLabels}]` });
  }
  
  if (input.message.text) {
    currentParts.push({ text: input.message.text });
  }
  
  if (currentParts.length > 0) {
    messages.push({ role: 'user', parts: currentParts });
  }
  
  return { messages, imageContext };
}

function appendToolResult(
  context: AgentContext, 
  toolName: string, 
  toolArgs: Record<string, any>,
  result: any,
  modelParts?: any[]
): AgentContext {
  logger.info('appendToolResult called', {
    toolName,
    hasModelParts: !!modelParts,
    modelPartsCount: modelParts?.length || 0,
    contextMessagesCount: context.messages.length,
  });
  
  // Add model response with tool call (preserving thought_signature)
  if (modelParts && modelParts.length > 0) {
    logger.info('Using original modelParts (with thought_signature)');
    context.messages.push({
      role: 'model',
      parts: modelParts,
    });
  } else {
    logger.warn('No modelParts, using fallback (may cause thought_signature error)');
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
  
  // Add function response
  context.messages.push({
    role: 'user',
    parts: [{
      functionResponse: {
        name: toolName,
        response: result,
      },
    }],
  });
  
  // Add generated images to context
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

