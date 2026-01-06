/**
 * Analyze Image Tool
 * Analyzes images to identify clothing, models, and scenes
 */

import { getGenAIClient, safetySettings, createImagePart, extractText } from '../../lib/genai.js';
import { config } from '../../config/index.js';

const ANALYSIS_MODEL = config.ai.models.analysis;

// ============================================
// Types
// ============================================

export interface AnalyzeImageInput {
  imageData: string;
  analysisType: 'clothing' | 'model' | 'scene' | 'full';
}

export interface AnalyzeImageOutput {
  analysis: string;
  structured?: {
    clothing?: ClothingAnalysis;
    model?: ModelAnalysis;
    scene?: SceneAnalysis;
  };
}

interface ClothingAnalysis {
  type: string;
  color: string;
  material: string;
  pattern?: string;
  style: string;
  details: string[];
}

interface ModelAnalysis {
  gender?: string;
  bodyType?: string;
  pose?: string;
  expression?: string;
  aesthetic: string;
}

interface SceneAnalysis {
  locationType: string;
  lighting: string;
  colorPalette: string[];
  atmosphere: string;
  props?: string[];
}

// ============================================
// Main Function
// ============================================

export async function analyzeImage(input: AnalyzeImageInput): Promise<AnalyzeImageOutput> {
  const client = getGenAIClient();
  
  const prompt = buildAnalysisPrompt(input.analysisType);
  
  const response = await client.models.generateContent({
    model: ANALYSIS_MODEL,
    contents: [{
      role: 'user',
      parts: [
        createImagePart(input.imageData),
        { text: prompt },
      ],
    }],
    config: {
      safetySettings,
      temperature: 0.3, // Lower temperature for more consistent analysis
      maxOutputTokens: 1024,
    },
  });
  
  const analysisText = extractText(response);
  
  if (!analysisText) {
    throw new Error('Failed to analyze image');
  }
  
  // Try to parse structured output
  const structured = tryParseStructuredAnalysis(analysisText, input.analysisType);
  
  return {
    analysis: analysisText,
    structured,
  };
}

// ============================================
// Prompts
// ============================================

function buildAnalysisPrompt(type: string): string {
  const prompts: Record<string, string> = {
    clothing: `Analyze the clothing item in this image. Provide a detailed description including:
1. Type of garment (e.g., shirt, dress, jacket)
2. Primary and secondary colors (use precise color names)
3. Material/fabric (e.g., cotton, silk, denim, leather)
4. Pattern if any (solid, striped, floral, etc.)
5. Style category (casual, formal, streetwear, etc.)
6. Notable details (buttons, zippers, embroidery, etc.)

Format your response as a structured analysis in Chinese, followed by an English summary.`,

    model: `Analyze the model/person in this image. Describe:
1. Apparent gender presentation
2. Body type and proportions
3. Current pose and posture
4. Facial expression and mood
5. Overall aesthetic/vibe (e.g., elegant, edgy, natural)

Format your response as a structured analysis in Chinese, followed by an English summary.`,

    scene: `Analyze the background/scene in this image. Describe:
1. Location type (studio, outdoor, indoor, etc.)
2. Lighting conditions (natural, artificial, direction, intensity)
3. Color palette of the environment
4. Overall atmosphere/mood
5. Notable props or elements

Format your response as a structured analysis in Chinese, followed by an English summary.`,

    full: `Provide a comprehensive analysis of this fashion/product image:

## Clothing Analysis
- Type, color, material, pattern, style, and notable details

## Model Analysis (if present)
- Gender, body type, pose, expression, and overall aesthetic

## Scene Analysis
- Location, lighting, color palette, atmosphere, and props

Format your response with clear sections in Chinese, followed by brief English summaries for each section.`,
  };
  
  return prompts[type] || prompts.full;
}

// ============================================
// Parsing
// ============================================

function tryParseStructuredAnalysis(text: string, type: string): AnalyzeImageOutput['structured'] {
  // Simple extraction - in production, you might use more sophisticated parsing
  // or ask the model to output JSON directly
  
  const structured: AnalyzeImageOutput['structured'] = {};
  
  if (type === 'clothing' || type === 'full') {
    // Extract clothing info from text
    structured.clothing = {
      type: extractBetween(text, '类型', '\n') || extractBetween(text, 'Type:', '\n') || '',
      color: extractBetween(text, '颜色', '\n') || extractBetween(text, 'Color:', '\n') || '',
      material: extractBetween(text, '材质', '\n') || extractBetween(text, 'Material:', '\n') || '',
      style: extractBetween(text, '风格', '\n') || extractBetween(text, 'Style:', '\n') || '',
      details: [],
    };
  }
  
  if (type === 'model' || type === 'full') {
    structured.model = {
      aesthetic: extractBetween(text, '风格', '\n') || extractBetween(text, 'Aesthetic:', '\n') || '',
    };
  }
  
  if (type === 'scene' || type === 'full') {
    structured.scene = {
      locationType: extractBetween(text, '场景', '\n') || extractBetween(text, 'Location:', '\n') || '',
      lighting: extractBetween(text, '光线', '\n') || extractBetween(text, 'Lighting:', '\n') || '',
      colorPalette: [],
      atmosphere: extractBetween(text, '氛围', '\n') || extractBetween(text, 'Atmosphere:', '\n') || '',
    };
  }
  
  return structured;
}

function extractBetween(text: string, start: string, end: string): string {
  const startIdx = text.indexOf(start);
  if (startIdx === -1) return '';
  
  const afterStart = text.slice(startIdx + start.length);
  const endIdx = afterStart.indexOf(end);
  
  return (endIdx === -1 ? afterStart : afterStart.slice(0, endIdx)).trim().replace(/^[：:]\s*/, '');
}

// ============================================
// Tool Definition
// ============================================

export const ANALYZE_IMAGE_TOOL_DEFINITION = {
  name: 'analyze_image',
  description: '分析图片内容，识别服装、模特、场景等元素。用于理解用户上传的图片。',
  parameters: {
    type: 'object',
    properties: {
      image_ref: {
        type: 'string',
        description: "图片引用，如 'image_1', 'image_2'",
      },
      analysis_type: {
        type: 'string',
        enum: ['clothing', 'model', 'scene', 'full'],
        description: '分析类型：clothing=服装细节, model=模特特征, scene=场景背景, full=完整分析',
      },
    },
    required: ['image_ref'],
  },
};



