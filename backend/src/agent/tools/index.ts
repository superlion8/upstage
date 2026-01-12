// @ts-nocheck
/**
 * Agent Tools Registry
 * 
 * 所有 Agent 可用的 Tools 在此注册
 * 
 * @author Onstage Team
 * @version 2.0.0 (Consolidated)
 */

// ============================================
// Tool 导入
// ============================================

import {
  generateOutfitInstruct,
  STYLIST_TOOL_DEFINITION,
} from './stylist.js';

import {
  generateVisualContent,
  VISUAL_GENERATOR_TOOL_DEFINITION,
} from './visual-generator.js';

import {
  analyzeVisualContent,
  VISUAL_ANALYZER_TOOL_DEFINITION,
} from './visual-analyzer.js';

import {
  generatePhotographyInstructions,
  PHOTOGRAPHER_TOOL_DEFINITION,
} from './photographer.js';

import {
  analyzeConsistency,
  CONSISTENCY_ANALYZER_TOOL_DEFINITION,
} from './consistency-analyzer.js';

// Re-export resolveImage for internal usage if needed, or define simple helper locally
import {
  scrapeWebsite,
  WEB_SCRAPER_TOOL_DEFINITION
} from './scrapers.js'; // Keeping scraper for web access if needed, or remove? User didn't mention it. Keeping safe.
// User list: 1. ImgGen, 2. ImgAnalysis, 3. Stylist, 4. Photographer, 5. Consistency.
// I will keep scraper hidden or remove it? User said "Core tools are...".
// I'll keep scraper for robustness but maybe not emphasize it.

import { createLogger } from '../../lib/logger.js';
const logger = createLogger('agent:tools');

// ============================================
// Tool Definitions（给 LLM 看的 schema）
// ============================================

export const AGENT_TOOLS = [
  // 1. 图像生成
  VISUAL_GENERATOR_TOOL_DEFINITION,

  // 2. 图像/视频分析
  VISUAL_ANALYZER_TOOL_DEFINITION,

  // 3. 搭配师
  STYLIST_TOOL_DEFINITION,

  // 4. 摄影师
  PHOTOGRAPHER_TOOL_DEFINITION,

  // 5. 商品还原分析
  CONSISTENCY_ANALYZER_TOOL_DEFINITION,

  // Web Scraper (Optional utility)
  WEB_SCRAPER_TOOL_DEFINITION,
];

// ============================================
// Tool Executor Map
// ============================================

export type ToolExecutor = (args: Record<string, any>, context: ToolContext) => Promise<any>;

import type { ImageStore } from '../image-store';
import { GeneratedImage } from '../types.js';

export interface ToolContext {
  userId: string;
  conversationId: string;
  imageContext: Record<string, string>;
  imageStore?: ImageStore;
}

export const TOOL_EXECUTORS: Record<string, ToolExecutor> = {
  // 1. Image Generation
  generate_image: async (args, context) => {
    // Resolve references if provided
    let imageReferences: string[] = [];
    if (args.image_references && Array.isArray(args.image_references)) {
      imageReferences = await Promise.all(
        args.image_references.map((ref: string) => resolveImage(ref, context))
      );
    }

    const images = await generateVisualContent({
      prompt: args.prompt,
      image_references: imageReferences,
      count: args.count,
    });

    return {
      success: true,
      images, // Agent usually looks for 'images' field or 'output'
      output: `Generated ${images.length} images.`,
      message: 'Image generation complete.',
      shouldContinue: false, // Usually generation is the end of a turn, or agent can continue if it wants to analyze
    };
  },

  // 2. Visual Analysis
  visual_analysis: async (args, context) => {
    const mediaData = await resolveImage(args.media_ref, context);
    const result = await analyzeVisualContent({
      media_ref: mediaData,
      instruction: args.instruction,
    });
    return {
      success: true,
      analysis: result,
      message: 'Analysis complete.',
      shouldContinue: true,
    };
  },

  // 3. Stylist
  stylist: async (args, context) => {
    const productImage = await resolveImage(args.product_image, context);
    const modelImage = args.model_image ? await resolveImage(args.model_image, context) : undefined;
    const sceneImage = args.scene_image ? await resolveImage(args.scene_image, context) : undefined;

    const result = await generateOutfitInstruct({
      productImage,
      modelImage,
      sceneImage,
      stylePreference: args.style_preference,
    });

    return {
      success: true,
      outfit_instruct_zh: result.outfit_instruct_zh,
      outfit_instruct_en: result.outfit_instruct_en,
      message: 'Outfit advice generated.',
      shouldContinue: true,
    };
  },

  // 4. Photographer
  photographer: async (args, context) => {
    const [product, model, scene] = await Promise.all([
      resolveImage(args.product_image, context),
      resolveImage(args.model_image, context),
      resolveImage(args.scene_image, context),
    ]);

    const result = await generatePhotographyInstructions({
      product_image: product,
      model_image: model,
      scene_image: scene,
    });

    return {
      success: true,
      ...result,
      message: 'Photography instructions generated.',
      shouldContinue: true,
    };
  },

  // 5. Consistency Analyzer
  analyze_consistency: async (args, context) => {
    const [genImg, origImg] = await Promise.all([
      resolveImage(args.generated_image, context),
      resolveImage(args.original_product_image, context),
    ]);

    const result = await analyzeConsistency({
      generated_image: genImg,
      original_product_image: origImg,
    });

    return {
      success: true,
      ...result,
      message: 'Consistency analysis complete.',
      shouldContinue: true,
    };
  },

  // Util
  web_scraper: async (args) => {
    const result = await scrapeWebsite(args.url);
    return {
      success: true,
      ...result,
      message: 'Web scrape complete',
      shouldContinue: true,
    };
  },
};

// ============================================
// Helper: Resolve Image
// ============================================

export async function resolveImage(ref: string, context: ToolContext): Promise<string> {
  if (!ref) {
    throw new Error('Image reference is required');
  }

  // Priority 1: Use ImageStore if available
  if (context.imageStore) {
    const data = context.imageStore.getData(ref);
    if (data) {
      if (typeof data === 'string' && data.startsWith('/api/chat/assets/')) {
        try {
          // Local file resolution logic (same as before)
          const filename = data.split('/').pop();
          if (filename) {
            const isProd = process.env.NODE_ENV === 'production';
            const mountPath = process.env.RAILWAY_VOLUME_MOUNT_PATH || (isProd ? '/app/uploads' : './uploads');
            const imagesDir = await import('path').then(p => p.join(mountPath, 'images'));
            const filePath = await import('path').then(p => p.join(imagesDir, filename));
            const fs = await import('fs/promises');
            const fileBuffer = await fs.readFile(filePath);
            const base64 = fileBuffer.toString('base64');
            const ext = filename.split('.').pop()?.toLowerCase();
            let mimeType = 'image/jpeg';
            if (ext === 'png') mimeType = 'image/png';
            if (ext === 'webp') mimeType = 'image/webp';
            return `data:${mimeType};base64,${base64}`;
          }
        } catch (err) {
          console.error(`Failed to read local image file for ref ${ref}:`, err);
        }
      }
      return data;
    }
  }

  // Priority 2: Fall back to legacy imageContext
  return context.imageContext?.[ref] || ref;
}

/**
 * Execute a tool by name
 */
export async function executeTool(name: string, args: any, context: ToolContext) {
  const executor = TOOL_EXECUTORS[name];
  if (!executor) {
    throw new Error(`Tool ${name} not found`);
  }
  return executor(args, context);
}
