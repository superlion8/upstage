/**
 * Google Generative AI Client
 * Centralized AI client management with safety settings and utilities
 * Supports both AI Studio and Vertex AI endpoints
 */

import { GoogleGenAI, HarmCategory, HarmBlockThreshold, type SafetySetting } from '@google/genai';
import { config } from '../config/index.js';

// ============================================
// Vertex AI Mode Setup
// ============================================

// Set Vertex AI mode via environment variable if enabled
if (config.ai.vertexAI.enabled) {
  process.env.GOOGLE_GENAI_USE_VERTEXAI = 'true';
}

// ============================================
// Client Instance
// ============================================

let clientInstance: GoogleGenAI | null = null;

/**
 * Get or create the GoogleGenAI client instance
 * Works with both AI Studio API Key and Vertex AI API Key
 */
export function getGenAIClient(): GoogleGenAI {
  if (!clientInstance) {
    const apiKey = config.ai.apiKey;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    clientInstance = new GoogleGenAI({ apiKey });
  }
  return clientInstance;
}

// ============================================
// Safety Settings
// ============================================

/**
 * Default safety settings for content generation
 * Relaxed for fashion/clothing content
 */
export const safetySettings: SafetySetting[] = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

// ============================================
// Response Utilities
// ============================================

/**
 * Extract text from a Gemini response
 */
export function extractText(response: any): string | null {
  try {
    const candidate = response.candidates?.[0];
    if (!candidate?.content?.parts) return null;
    
    const textParts = candidate.content.parts
      .filter((part: any) => part.text)
      .map((part: any) => part.text);
    
    return textParts.join('').trim() || null;
  } catch {
    return null;
  }
}

/**
 * Extract images from a Gemini response
 */
export function extractImages(response: any): Array<{ mimeType: string; data: string }> {
  try {
    const candidate = response.candidates?.[0];
    if (!candidate?.content?.parts) return [];
    
    return candidate.content.parts
      .filter((part: any) => part.inlineData)
      .map((part: any) => ({
        mimeType: part.inlineData.mimeType,
        data: part.inlineData.data,
      }));
  } catch {
    return [];
  }
}

/**
 * Extract thinking/reasoning from a Gemini response (if available)
 * Handles multiple possible field names used by different Gemini model versions
 */
export function extractThinking(response: any): string | null {
  try {
    const candidate = response.candidates?.[0];
    if (!candidate?.content?.parts) return null;
    
    // 尝试多种可能的字段名
    const thinkingParts = candidate.content.parts
      .map((part: any) => {
        // Gemini 3 可能使用 "thought" 或 "thinking" 或其他字段
        return part.thought || part.thinking || part.reasoning || null;
      })
      .filter(Boolean);
    
    // 如果没有找到，尝试 candidate 级别
    if (thinkingParts.length === 0) {
      const candidateThinking = candidate.thinking || candidate.thought || candidate.reasoning;
      if (candidateThinking) {
        return candidateThinking;
      }
    }
    
    // 如果还是没有，检查 groundingMetadata 或其他元数据
    if (thinkingParts.length === 0) {
      const metadata = candidate.groundingMetadata || candidate.metadata;
      if (metadata?.thinking) {
        return metadata.thinking;
      }
    }
    
    return thinkingParts.join('\n').trim() || null;
  } catch (err) {
    console.error('Error extracting thinking:', err);
    return null;
  }
}

/**
 * Extract function calls from a Gemini response
 */
export function extractFunctionCalls(response: any): Array<{ name: string; args: Record<string, any> }> {
  try {
    const candidate = response.candidates?.[0];
    if (!candidate?.content?.parts) return [];
    
    return candidate.content.parts
      .filter((part: any) => part.functionCall)
      .map((part: any) => ({
        name: part.functionCall.name,
        args: part.functionCall.args || {},
      }));
  } catch {
    return [];
  }
}

// ============================================
// Image Utilities
// ============================================

/**
 * Create an inline image part for Gemini API
 */
export function createImagePart(imageData: string, mimeType?: string): any {
  // Handle data URL format
  if (imageData.startsWith('data:')) {
    const matches = imageData.match(/^data:(.+);base64,(.+)$/);
    if (matches) {
      return {
        inlineData: {
          mimeType: matches[1],
          data: matches[2],
        },
      };
    }
  }
  
  // Handle pure base64 (assume JPEG if no mime type provided)
  if (!imageData.startsWith('http')) {
    return {
      inlineData: {
        mimeType: mimeType || 'image/jpeg',
        data: imageData,
      },
    };
  }
  
  // Handle URL
  return {
    fileData: {
      fileUri: imageData,
    },
  };
}

/**
 * Convert base64 image to data URL
 */
export function toDataUrl(base64: string, mimeType: string = 'image/jpeg'): string {
  if (base64.startsWith('data:')) return base64;
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Extract base64 from data URL
 */
export function fromDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const matches = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!matches) return null;
  return {
    mimeType: matches[1],
    data: matches[2],
  };
}

// ============================================
// Model Helpers
// ============================================

/**
 * Get model name from config
 */
export function getModelName(type: keyof typeof config.ai.models): string {
  return config.ai.models[type];
}

/**
 * Check if response was blocked by safety filters
 */
export function isBlocked(response: any): boolean {
  const candidate = response.candidates?.[0];
  return candidate?.finishReason === 'SAFETY' || candidate?.finishReason === 'BLOCKED';
}

/**
 * Get block reason if response was blocked
 */
export function getBlockReason(response: any): string | null {
  const candidate = response.candidates?.[0];
  if (!isBlocked(response)) return null;
  
  const safetyRatings = candidate?.safetyRatings || [];
  const blocked = safetyRatings.find((r: any) => r.blocked);
  return blocked ? `Blocked by ${blocked.category}` : 'Unknown safety block';
}



