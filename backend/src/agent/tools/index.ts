// @ts-nocheck
/**
 * Agent Tools Registry
 * 
 * 所有 Agent 可用的 Tools 在此注册
 * 
 * @author Onstage Team
 * @version 1.0.0
 */

// ============================================
// Tool 导入
// ============================================

import {
  generateOutfitInstruct,
  STYLIST_TOOL_DEFINITION,
  type StylistInput,
  type StylistOutput,
} from './stylist.js';

import {
  analyzeImage,
  ANALYZE_IMAGE_TOOL_DEFINITION,
} from './analyze-image.js';

import {
  generateModelImage,
  changeOutfit,
  changeModel,
  replicateReference,
  editImage,
  GENERATE_MODEL_IMAGE_TOOL_DEFINITION,
  CHANGE_OUTFIT_TOOL_DEFINITION,
  CHANGE_MODEL_TOOL_DEFINITION,
  REPLICATE_REFERENCE_TOOL_DEFINITION,
  EDIT_IMAGE_TOOL_DEFINITION,
} from './generate-image.js';

import {
  generateSoraVideo,
  SORA_VIDEO_TOOL_DEFINITION,
} from './video-gen.js';

import {
  scrapeWebsite,
  analyzeSocial,
  analyzeVideo,
  WEB_SCRAPER_TOOL_DEFINITION,
  SOCIAL_ANALYZER_TOOL_DEFINITION,
  VIDEO_ANALYZER_TOOL_DEFINITION,
} from './scrapers.js';

import { z } from 'zod';
import { createLogger } from '../../lib/logger.js';

const logger = createLogger('agent:tools');

// ============================================
// Zod Schemas for Tool Parameter Validation
// ============================================

const TOOL_SCHEMAS: Record<string, z.ZodSchema> = {
  analyze_image: z.object({
    image_ref: z.string(),
    analysis_type: z.enum(['clothing', 'model', 'scene', 'full']).optional(),
  }),
  change_outfit: z.object({
    original_image: z.string(),
    outfit_images: z.array(z.string()),
    outfit_instruct: z.string().optional(),
    style_notes: z.string().optional(),
  }),
  change_model: z.object({
    original_image: z.string(),
    model_reference: z.string().optional(),
    model_style: z.enum(['korean', 'japanese', 'western', 'chinese', 'auto']).optional(),
    model_gender: z.enum(['female', 'male']).optional(),
  }),
  replicate_reference: z.object({
    product_image: z.string(),
    reference_image: z.string(),
    elements_to_replicate: z.array(z.enum(['composition', 'pose', 'lighting', 'vibe', 'color_tone'])).optional(),
  }),
  generate_model_image: z.object({
    product_image: z.string(),
    model_reference: z.string().optional(),
    model_style: z.enum(['korean', 'japanese', 'western', 'chinese', 'auto']).optional(),
    scene_type: z.enum(['studio', 'outdoor', 'indoor', 'street', 'custom']).optional(),
    scene_reference: z.string().optional(),
    outfit_instruct: z.string().optional(),
    vibe: z.string().optional(),
    count: z.number().optional(),
  }),
  edit_image: z.object({
    image_ref: z.string(),
    edit_instruction: z.string(),
    edit_region: z.enum(['full', 'upper_body', 'lower_body', 'background', 'accessory', 'face']).optional(),
  }),
  stylist: z.object({
    product_image: z.string(),
    model_image: z.string().optional(),
    scene_image: z.string().optional(),
    style_preference: z.string().optional(),
  }),
  request_gui_input: z.object({
    gui_type: z.enum(['change_outfit', 'change_model', 'replicate_reference', 'select_model', 'select_scene']),
    message: z.string().optional(),
    prefill_data: z.record(z.any()).optional(),
  }),
  web_scraper: z.object({
    url: z.string().url(),
  }),
  social_analyzer: z.object({
    url: z.string().url(),
  }),
  video_to_text: z.object({
    url: z.string().url(),
  }),
  generate_sora_video: z.object({
    prompt: z.string(),
    preview_image: z.string().optional(),
  }),
};

// ============================================
// Tool Definitions（给 LLM 看的 schema）
// ============================================

export const AGENT_TOOLS = [
  // 品牌引导流程相关
  WEB_SCRAPER_TOOL_DEFINITION,
  SOCIAL_ANALYZER_TOOL_DEFINITION,
  VIDEO_ANALYZER_TOOL_DEFINITION,
  SORA_VIDEO_TOOL_DEFINITION,

  // 搭配师 - 分析图像生成搭配建议
  STYLIST_TOOL_DEFINITION,

  // 图像分析
  {
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
  },

  // 换搭配
  {
    name: 'change_outfit',
    description: '保持原图的模特和场景不变，替换服装搭配。需要原图和新服装图片。',
    parameters: {
      type: 'object',
      properties: {
        original_image: {
          type: 'string',
          description: "原图引用，如 'image_1'",
        },
        outfit_images: {
          type: 'array',
          items: { type: 'string' },
          description: "新服装图片引用列表，如 ['image_2', 'image_3']",
        },
        outfit_instruct: {
          type: 'string',
          description: '搭配描述（可选，可由 stylist tool 生成）',
        },
        style_notes: {
          type: 'string',
          description: "风格说明，如 '休闲风格'、'保持颜色协调'",
        },
      },
      required: ['original_image', 'outfit_images'],
    },
  },

  // 换模特
  {
    name: 'change_model',
    description: '保持原图的服装和场景不变，替换模特。可以使用参考模特图或指定模特风格。',
    parameters: {
      type: 'object',
      properties: {
        original_image: {
          type: 'string',
          description: '原图引用',
        },
        model_reference: {
          type: 'string',
          description: '模特参考图引用（可选）',
        },
        model_style: {
          type: 'string',
          enum: ['korean', 'japanese', 'western', 'chinese', 'auto'],
          description: '模特风格（当没有参考图时使用）',
        },
        model_gender: {
          type: 'string',
          enum: ['female', 'male'],
          description: '模特性别',
        },
      },
      required: ['original_image'],
    },
  },

  // 复刻参考图
  {
    name: 'replicate_reference',
    description: '参考目标图的构图、氛围、姿势等元素，用指定商品生成类似风格的图片。',
    parameters: {
      type: 'object',
      properties: {
        product_image: {
          type: 'string',
          description: '商品图引用',
        },
        reference_image: {
          type: 'string',
          description: '参考图引用',
        },
        elements_to_replicate: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['composition', 'pose', 'lighting', 'vibe', 'color_tone'],
          },
          description: '要复刻的元素',
        },
      },
      required: ['product_image', 'reference_image'],
    },
  },

  // 生成模特图
  {
    name: 'generate_model_image',
    description: '根据商品图生成模特穿着图。可以指定模特风格、场景类型等。',
    parameters: {
      type: 'object',
      properties: {
        product_image: {
          type: 'string',
          description: '商品图引用',
        },
        model_reference: {
          type: 'string',
          description: '模特参考图引用（可选）',
        },
        model_style: {
          type: 'string',
          enum: ['korean', 'japanese', 'western', 'chinese', 'auto'],
          description: '模特风格',
        },
        scene_type: {
          type: 'string',
          enum: ['studio', 'outdoor', 'indoor', 'street', 'custom'],
          description: '场景类型',
        },
        scene_reference: {
          type: 'string',
          description: '场景参考图引用（当 scene_type 为 custom 时使用）',
        },
        outfit_instruct: {
          type: 'string',
          description: '搭配描述（可选，由 stylist tool 生成）',
        },
        vibe: {
          type: 'string',
          description: "氛围描述，如 '高级感'、'活力青春'",
        },
        count: {
          type: 'number',
          description: '生成数量，默认 2',
        },
      },
      required: ['product_image'],
    },
  },

  // 编辑图片
  {
    name: 'edit_image',
    description: '对图片进行局部编辑，如修改服装细节、调整背景等。',
    parameters: {
      type: 'object',
      properties: {
        image_ref: {
          type: 'string',
          description: '要编辑的图片引用',
        },
        edit_instruction: {
          type: 'string',
          description: "编辑指令，如 '把袖子改成短袖'、'去掉背景中的人'",
        },
        edit_region: {
          type: 'string',
          enum: ['full', 'upper_body', 'lower_body', 'background', 'accessory', 'face'],
          description: '编辑区域（可选，帮助模型聚焦）',
        },
      },
      required: ['image_ref', 'edit_instruction'],
    },
  },

  // 搜索资产
  {
    name: 'search_assets',
    description: '在用户的资产库中搜索素材，如模特图、场景图、商品图等。',
    parameters: {
      type: 'object',
      properties: {
        asset_type: {
          type: 'string',
          enum: ['model', 'scene', 'product', 'generated', 'all'],
          description: '资产类型',
        },
        query: {
          type: 'string',
          description: '搜索关键词',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: '标签过滤',
        },
        limit: {
          type: 'number',
          description: '返回数量限制',
        },
      },
      required: [],
    },
  },

  // 获取预设
  {
    name: 'get_presets',
    description: '获取系统预设的素材，如预设模特、预设场景等。',
    parameters: {
      type: 'object',
      properties: {
        preset_type: {
          type: 'string',
          enum: ['model', 'scene', 'pose', 'lighting'],
          description: '预设类型',
        },
        style: {
          type: 'string',
          description: '风格筛选',
        },
        category: {
          type: 'string',
          description: '分类筛选',
        },
      },
      required: ['preset_type'],
    },
  },

  // 保存到资产库
  {
    name: 'save_to_assets',
    description: '将生成的图片保存到用户的资产库。',
    parameters: {
      type: 'object',
      properties: {
        image_ref: {
          type: 'string',
          description: '要保存的图片引用',
        },
        asset_type: {
          type: 'string',
          enum: ['model', 'scene', 'product', 'generated'],
          description: '资产类型',
        },
        name: {
          type: 'string',
          description: '资产名称',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: '标签',
        },
      },
      required: ['image_ref', 'asset_type'],
    },
  },

  // 请求 GUI 输入
  {
    name: 'request_gui_input',
    description: '当需要用户通过 GUI 提供更精确的输入时使用。会在客户端弹出相应的输入界面。',
    parameters: {
      type: 'object',
      properties: {
        gui_type: {
          type: 'string',
          enum: ['change_outfit', 'change_model', 'replicate_reference', 'select_model', 'select_scene'],
          description: 'GUI 类型',
        },
        message: {
          type: 'string',
          description: '提示用户的消息',
        },
        prefill_data: {
          type: 'object',
          description: '预填充数据',
        },
      },
      required: ['gui_type'],
    },
  },
];

// ============================================
// Tool Executor Map
// ============================================

export type ToolExecutor = (args: Record<string, any>, context: ToolContext) => Promise<any>;

export interface ToolContext {
  userId: string;
  conversationId: string;
  imageContext: Record<string, string>;  // image_ref -> image_data
}

/**
 * Tool 执行器映射
 * key: tool name
 * value: 执行函数
 */
export const TOOL_EXECUTORS: Record<string, ToolExecutor> = {
  // ============================================
  // 搭配师
  // ============================================
  stylist: async (args, context) => {
    const productImage = resolveImageRef(args.product_image, context.imageContext);
    const modelImage = args.model_image
      ? resolveImageRef(args.model_image, context.imageContext)
      : undefined;
    const sceneImage = args.scene_image
      ? resolveImageRef(args.scene_image, context.imageContext)
      : undefined;

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
      outfit_instruct: result.outfit_instruct_en,
      message: '搭配方案已生成！',
      shouldContinue: true,
    };
  },

  // ============================================
  // 品牌引导流程相关工具执行项
  // ============================================
  web_scraper: async (args) => {
    const result = await scrapeWebsite(args.url);
    return {
      success: true,
      ...result,
      message: '网页抓取完成',
      shouldContinue: true,
    };
  },

  social_analyzer: async (args) => {
    const result = await analyzeSocial(args.url);
    return {
      success: true,
      ...result,
      message: '社交媒体分析完成',
      shouldContinue: true,
    };
  },

  video_to_text: async (args) => {
    const result = await analyzeVideo(args.url);
    return {
      success: true,
      ...result,
      message: '视频分析完成',
      shouldContinue: true,
    };
  },

  generate_sora_video: async (args, context) => {
    const previewImage = args.preview_image
      ? resolveImageRef(args.preview_image, context.imageContext)
      : undefined;

    const result = await generateSoraVideo(args.prompt, { preview_image: previewImage });

    return {
      success: true,
      ...result,
      message: 'Sora 视频生成完成',
      shouldContinue: true,
    };
  },

  // ============================================
  // 图像分析
  // ============================================
  analyze_image: async (args, context) => {
    const imageData = resolveImageRef(args.image_ref, context.imageContext);

    const result = await analyzeImage({
      imageData,
      analysisType: args.analysis_type || 'full',
    });

    return {
      success: true,
      analysis: result.analysis,
      structured: result.structured,
      message: '图像分析完成',
      shouldContinue: true,
    };
  },

  // ============================================
  // 生成模特图
  // ============================================
  generate_model_image: async (args, context) => {
    const productImage = resolveImageRef(args.product_image, context.imageContext);
    const modelReference = args.model_reference
      ? resolveImageRef(args.model_reference, context.imageContext)
      : undefined;
    const sceneReference = args.scene_reference
      ? resolveImageRef(args.scene_reference, context.imageContext)
      : undefined;

    const images = await generateModelImage({
      productImage,
      modelReference,
      modelStyle: args.model_style,
      sceneType: args.scene_type,
      sceneReference,
      outfitInstruct: args.outfit_instruct,
      vibe: args.vibe,
      count: args.count,
    });

    return {
      success: true,
      images,
      message: '模特图生成完成！',
      shouldContinue: false,
    };
  },

  // ============================================
  // 换搭配
  // ============================================
  change_outfit: async (args, context) => {
    const originalImage = resolveImageRef(args.original_image, context.imageContext);
    const outfitImages = args.outfit_images.map((ref: string) =>
      resolveImageRef(ref, context.imageContext)
    );

    const images = await changeOutfit({
      originalImage,
      outfitImages,
      outfitInstruct: args.outfit_instruct,
      styleNotes: args.style_notes,
    });

    return {
      success: true,
      images,
      message: '换搭配完成！',
      shouldContinue: false,
    };
  },

  // ============================================
  // 换模特
  // ============================================
  change_model: async (args, context) => {
    const originalImage = resolveImageRef(args.original_image, context.imageContext);
    const modelReference = args.model_reference
      ? resolveImageRef(args.model_reference, context.imageContext)
      : undefined;

    const images = await changeModel({
      originalImage,
      modelReference,
      modelStyle: args.model_style,
      modelGender: args.model_gender,
    });

    return {
      success: true,
      images,
      message: '换模特完成！',
      shouldContinue: false,
    };
  },

  // ============================================
  // 复刻参考图
  // ============================================
  replicate_reference: async (args, context) => {
    const productImage = resolveImageRef(args.product_image, context.imageContext);
    const referenceImage = resolveImageRef(args.reference_image, context.imageContext);

    const images = await replicateReference({
      productImage,
      referenceImage,
      elementsToReplicate: args.elements_to_replicate,
    });

    return {
      success: true,
      images,
      message: '参考图复刻完成！',
      shouldContinue: false,
    };
  },

  // ============================================
  // 编辑图片
  // ============================================
  edit_image: async (args, context) => {
    const image = resolveImageRef(args.image_ref, context.imageContext);

    const images = await editImage({
      image,
      instruction: args.edit_instruction,
      region: args.edit_region,
    });

    return {
      success: true,
      images,
      message: '图片编辑完成！',
      shouldContinue: false,
    };
  },

  // ============================================
  // 搜索资产（需要数据库查询）
  // ============================================
  search_assets: async (args, context) => {
    // TODO: Implement with database query
    return {
      success: true,
      assets: [],
      message: '搜索完成',
      shouldContinue: true,
    };
  },

  // ============================================
  // 获取预设（需要数据库查询）
  // ============================================
  get_presets: async (args, context) => {
    // TODO: Implement with database query
    return {
      success: true,
      presets: [],
      message: '获取预设完成',
      shouldContinue: true,
    };
  },

  // ============================================
  // 保存到资产库（需要数据库操作）
  // ============================================
  save_to_assets: async (args, context) => {
    // TODO: Implement with database and storage
    return {
      success: true,
      message: '已保存到资产库',
      shouldContinue: true,
    };
  },

  // ============================================
  // 请求 GUI 输入
  // ============================================
  request_gui_input: async (args, context) => {
    return {
      success: true,
      guiType: args.gui_type,
      message: args.message || '请在下方完成输入',
      prefillData: args.prefill_data,
      shouldContinue: false,
    };
  },
};

// ============================================
// 辅助函数
// ============================================

/**
 * 解析图片引用
 */
function resolveImageRef(ref: string, imageContext: Record<string, string>): string {
  if (!ref) {
    throw new Error('Image reference is required');
  }

  // 如果在 context 中找到
  if (imageContext[ref]) {
    return imageContext[ref];
  }

  // 如果是 URL 或 Base64，直接返回
  if (ref.startsWith('http') || ref.startsWith('data:')) {
    return ref;
  }

  // 如果是原始 base64 数据 (JPEG/PNG 等)，直接返回
  // JPEG base64 starts with /9j/, PNG starts with iVBOR
  if (ref.startsWith('/9j/') || ref.startsWith('iVBOR') || ref.length > 1000) {
    return ref;
  }

  throw new Error(`Unknown image reference: ${ref.substring(0, 50)}...`);
}

/**
 * 获取所有可用的 Tool 名称
 */
export function getAvailableToolNames(): string[] {
  return AGENT_TOOLS.map(tool => tool.name);
}

/**
 * 根据名称获取 Tool 定义
 */
export function getToolDefinition(name: string) {
  return AGENT_TOOLS.find(tool => tool.name === name);
}

/**
 * 执行 Tool
 */
export async function executeTool(
  name: string,
  args: Record<string, any>,
  context: ToolContext
): Promise<any> {
  const executor = TOOL_EXECUTORS[name];

  if (!executor) {
    throw new Error(`Tool not implemented: ${name}`);
  }

  logger.info(`Executing tool: ${name}`);

  // Validate arguments using zod schema if available
  const schema = TOOL_SCHEMAS[name];
  if (schema) {
    const validation = schema.safeParse(args);
    if (!validation.success) {
      const errorMessages = validation.error.errors.map(e =>
        `${e.path.join('.')}: ${e.message}`
      ).join('; ');
      return {
        success: false,
        error: `参数校验失败: ${errorMessages}`,
        shouldContinue: true,
      };
    }
  }

  return executor(args, context);
}

