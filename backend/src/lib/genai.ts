/**
 * Google Generative AI Client
 * Centralized AI client management with safety settings and utilities
 */

import { GoogleGenAI, HarmCategory, HarmBlockThreshold, type SafetySetting } from '@google/genai';
import { config } from '../config/index.js';

// ============================================
// Client Instance
// ============================================

let clientInstance: GoogleGenAI | null = null;

/**
 * Get or create the GoogleGenAI client instance
 */
export function getGenAIClient(): GoogleGenAI {
  if (!clientInstance) {
    clientInstance = new GoogleGenAI({ apiKey: config.ai.apiKey });
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
 */
export function extractThinking(response: any): string | null {
  try {
    const candidate = response.candidates?.[0];
    if (!candidate?.content?.parts) return null;
    
    const thinkingParts = candidate.content.parts
      .filter((part: any) => part.thought)
      .map((part: any) => part.thought);
    
    return thinkingParts.join('\n').trim() || null;
  } catch {
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



