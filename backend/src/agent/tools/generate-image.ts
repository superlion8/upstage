// @ts-nocheck
/**
 * Image Generation Tools
 * Handles various image generation tasks using Gemini
 */

import { getGenAIClient, safetySettings, createImagePart, extractText, extractImages } from '../../lib/genai.js';
import { config } from '../../config/index.js';
import { createLogger } from '../../lib/logger.js';
import { nanoid } from 'nanoid';

const logger = createLogger('tools:generate-image');
const IMAGE_GEN_MODEL = config.ai.models.imageGen;

// ============================================
// Types
// ============================================

export interface GenerateModelImageInput {
  productImage: string;
  modelReference?: string;
  modelStyle?: 'korean' | 'japanese' | 'western' | 'chinese' | 'auto';
  sceneType?: 'studio' | 'outdoor' | 'indoor' | 'street' | 'custom';
  sceneReference?: string;
  outfitInstruct?: string;
  vibe?: string;
  count?: number;
}

export interface ChangeOutfitInput {
  originalImage: string;
  outfitImages: string[];
  outfitInstruct?: string;
  styleNotes?: string;
}

export interface ChangeModelInput {
  originalImage: string;
  modelReference?: string;
  modelStyle?: 'korean' | 'japanese' | 'western' | 'chinese' | 'auto';
  modelGender?: 'female' | 'male';
}

export interface ReplicateReferenceInput {
  productImage: string;
  referenceImage: string;
  elementsToReplicate?: Array<'composition' | 'pose' | 'lighting' | 'vibe' | 'color_tone'>;
}

export interface EditImageInput {
  image: string;
  instruction: string;
  region?: 'full' | 'upper_body' | 'lower_body' | 'background' | 'accessory' | 'face';
}

export interface GeneratedImage {
  id: string;
  url: string;
  data?: string; // Base64
  thumbnailUrl?: string;
}

// ============================================
// Generate Model Image
// ============================================

export async function generateModelImage(input: GenerateModelImageInput): Promise<GeneratedImage[]> {
  const client = getGenAIClient();
  const count = input.count || 2;

  logger.info('Generating model image', {
    hasModelRef: !!input.modelReference,
    hasSceneRef: !!input.sceneReference,
    modelStyle: input.modelStyle,
    count,
  });

  const prompt = buildModelImagePrompt(input);
  const parts: any[] = [];

  // Add product image
  parts.push(createImagePart(input.productImage));

  // Add model reference if provided
  if (input.modelReference) {
    parts.push(createImagePart(input.modelReference));
  }

  // Add scene reference if provided
  if (input.sceneReference) {
    parts.push(createImagePart(input.sceneReference));
  }

  // Add prompt
  parts.push({ text: prompt });

  const response = await client.models.generateContent({
    model: IMAGE_GEN_MODEL,
    contents: [{ role: 'user', parts }],
    config: {
      safetySettings,
      responseModalities: ['image', 'text'],
      // @ts-ignore - Some models support multiple images
      numberOfImages: count,
    },
  });

  const images = extractImages(response);

  if (images.length === 0) {
    throw new Error('No images generated');
  }

  return images.map((img, i) => ({
    id: `gen_${nanoid(8)}`,
    url: `data:${img.mimeType};base64,${img.data}`,
    data: img.data,
  }));
}

// ============================================
// Change Outfit
// ============================================

export async function changeOutfit(input: ChangeOutfitInput): Promise<GeneratedImage[]> {
  const client = getGenAIClient();

  logger.info('Changing outfit', { outfitCount: input.outfitImages.length });

  const prompt = buildChangeOutfitPrompt(input);
  const parts: any[] = [];

  // Add original image
  parts.push(createImagePart(input.originalImage));

  // Add outfit images
  for (const outfitImg of input.outfitImages) {
    parts.push(createImagePart(outfitImg));
  }

  // Add prompt
  parts.push({ text: prompt });

  const response = await client.models.generateContent({
    model: IMAGE_GEN_MODEL,
    contents: [{ role: 'user', parts }],
    config: {
      safetySettings,
      responseModalities: ['image', 'text'],
    },
  });

  const images = extractImages(response);

  if (images.length === 0) {
    throw new Error('No images generated');
  }

  return images.map((img, i) => ({
    id: `outfit_${nanoid(8)}`,
    url: `data:${img.mimeType};base64,${img.data}`,
    data: img.data,
  }));
}

// ============================================
// Change Model
// ============================================

export async function changeModel(input: ChangeModelInput): Promise<GeneratedImage[]> {
  const client = getGenAIClient();

  logger.info('Changing model', {
    hasModelRef: !!input.modelReference,
    modelStyle: input.modelStyle,
    modelGender: input.modelGender,
  });

  const prompt = buildChangeModelPrompt(input);
  const parts: any[] = [];

  // Add original image
  parts.push(createImagePart(input.originalImage));

  // Add model reference if provided
  if (input.modelReference) {
    parts.push(createImagePart(input.modelReference));
  }

  // Add prompt
  parts.push({ text: prompt });

  const response = await client.models.generateContent({
    model: IMAGE_GEN_MODEL,
    contents: [{ role: 'user', parts }],
    config: {
      safetySettings,
      responseModalities: ['image', 'text'],
    },
  });

  const images = extractImages(response);

  if (images.length === 0) {
    throw new Error('No images generated');
  }

  return images.map((img, i) => ({
    id: `model_${nanoid(8)}`,
    url: `data:${img.mimeType};base64,${img.data}`,
    data: img.data,
  }));
}

// ============================================
// Replicate Reference
// ============================================

export async function replicateReference(input: ReplicateReferenceInput): Promise<GeneratedImage[]> {
  const client = getGenAIClient();

  logger.info('Replicating reference', {
    elements: input.elementsToReplicate,
  });

  const prompt = buildReplicateReferencePrompt(input);
  const parts: any[] = [];

  // Add product image
  parts.push(createImagePart(input.productImage));

  // Add reference image
  parts.push(createImagePart(input.referenceImage));

  // Add prompt
  parts.push({ text: prompt });

  const response = await client.models.generateContent({
    model: IMAGE_GEN_MODEL,
    contents: [{ role: 'user', parts }],
    config: {
      safetySettings,
      responseModalities: ['image', 'text'],
    },
  });

  const images = extractImages(response);

  if (images.length === 0) {
    throw new Error('No images generated');
  }

  return images.map((img, i) => ({
    id: `rep_${nanoid(8)}`,
    url: `data:${img.mimeType};base64,${img.data}`,
    data: img.data,
  }));
}

// ============================================
// Edit Image
// ============================================

export async function editImage(input: EditImageInput): Promise<GeneratedImage[]> {
  const client = getGenAIClient();

  logger.info('Editing image', {
    instruction: input.instruction,
    region: input.region,
  });

  const prompt = buildEditImagePrompt(input);
  const parts: any[] = [];

  // Add original image
  parts.push(createImagePart(input.image));

  // Add prompt
  parts.push({ text: prompt });

  const response = await client.models.generateContent({
    model: IMAGE_GEN_MODEL,
    contents: [{ role: 'user', parts }],
    config: {
      safetySettings,
      responseModalities: ['image', 'text'],
    },
  });

  const images = extractImages(response);

  if (images.length === 0) {
    throw new Error('No images generated');
  }

  return images.map((img, i) => ({
    id: `edit_${nanoid(8)}`,
    url: `data:${img.mimeType};base64,${img.data}`,
    data: img.data,
  }));
}

// ============================================
// Prompt Builders
// ============================================

function buildModelImagePrompt(input: GenerateModelImageInput): string {
  const parts: string[] = [
    'Generate a professional fashion e-commerce photograph.',
  ];

  // Model style
  if (input.modelStyle && input.modelStyle !== 'auto') {
    const styleMap: Record<string, string> = {
      korean: 'Korean model with soft, natural features and elegant proportions',
      japanese: 'Japanese model with refined, delicate features',
      western: 'Western/European model with strong, defined features',
      chinese: 'Chinese model with graceful, classic features',
    };
    parts.push(`Feature a ${styleMap[input.modelStyle]}.`);
  }

  // Scene
  if (input.sceneType) {
    const sceneMap: Record<string, string> = {
      studio: 'Clean studio background with professional lighting',
      outdoor: 'Natural outdoor setting with soft daylight',
      indoor: 'Stylish indoor environment',
      street: 'Urban street fashion setting',
      custom: 'Use the provided scene reference',
    };
    parts.push(sceneMap[input.sceneType] || '');
  }

  // Outfit instruction
  if (input.outfitInstruct) {
    parts.push(`Outfit details: ${input.outfitInstruct}`);
  }

  // Vibe
  if (input.vibe) {
    parts.push(`Overall mood: ${input.vibe}`);
  }

  parts.push('The first image shows the main product to feature.');

  if (input.modelReference) {
    parts.push('The second image shows the model reference to match.');
  }

  if (input.sceneReference) {
    parts.push('Use the scene/background from the reference image.');
  }

  parts.push('High quality, sharp focus on clothing details, editorial style.');

  return parts.filter(Boolean).join(' ');
}

function buildChangeOutfitPrompt(input: ChangeOutfitInput): string {
  const parts: string[] = [
    'Modify the first image by changing ONLY the clothing.',
    'Keep the exact same model (face, body, pose) and background.',
    'Replace the outfit with the clothing items shown in the following image(s).',
  ];

  if (input.outfitInstruct) {
    parts.push(`Styling details: ${input.outfitInstruct}`);
  }

  if (input.styleNotes) {
    parts.push(`Additional notes: ${input.styleNotes}`);
  }

  parts.push('Ensure the new outfit fits naturally on the model. Maintain the same lighting and image quality.');

  return parts.join(' ');
}

function buildChangeModelPrompt(input: ChangeModelInput): string {
  const parts: string[] = [
    'Modify the first image by changing ONLY the model/person.',
    'Keep the exact same clothing, pose, and background.',
  ];

  if (input.modelReference) {
    parts.push('Replace the model with someone matching the appearance in the second image.');
  } else {
    if (input.modelStyle) {
      const styleMap: Record<string, string> = {
        korean: 'a Korean model with soft, natural features',
        japanese: 'a Japanese model with refined, delicate features',
        western: 'a Western/European model with strong features',
        chinese: 'a Chinese model with graceful features',
        auto: 'an appropriate model',
      };
      parts.push(`Replace with ${styleMap[input.modelStyle]}.`);
    }

    if (input.modelGender) {
      parts.push(`The model should be ${input.modelGender}.`);
    }
  }

  parts.push('Ensure the clothing fits naturally on the new model. Maintain the same lighting and image quality.');

  return parts.join(' ');
}

function buildReplicateReferencePrompt(input: ReplicateReferenceInput): string {
  const parts: string[] = [
    'Create a new fashion photograph using the product from the first image.',
  ];

  const elementDescriptions: Record<string, string> = {
    composition: 'the composition and framing',
    pose: 'the model pose and body language',
    lighting: 'the lighting setup and shadows',
    vibe: 'the overall mood and atmosphere',
    color_tone: 'the color grading and tones',
  };

  if (input.elementsToReplicate && input.elementsToReplicate.length > 0) {
    const elements = input.elementsToReplicate
      .map(e => elementDescriptions[e])
      .filter(Boolean)
      .join(', ');
    parts.push(`Replicate ${elements} from the second (reference) image.`);
  } else {
    parts.push('Replicate the composition, lighting, and mood from the second (reference) image.');
  }

  parts.push('The product from the first image should be the main focus. Create a cohesive, professional result.');

  return parts.join(' ');
}

function buildEditImagePrompt(input: EditImageInput): string {
  const parts: string[] = [
    'Edit this fashion photograph according to the following instruction:',
    input.instruction,
  ];

  if (input.region && input.region !== 'full') {
    const regionMap: Record<string, string> = {
      upper_body: 'Focus the edit on the upper body area only.',
      lower_body: 'Focus the edit on the lower body area only.',
      background: 'Only modify the background, keep the subject unchanged.',
      accessory: 'Only modify the accessories.',
      face: 'Only modify the face/head area.',
    };
    parts.push(regionMap[input.region] || '');
  }

  parts.push('Maintain the overall quality and style of the original image.');

  return parts.join(' ');
}

// ============================================
// Tool Definitions
// ============================================

export const GENERATE_MODEL_IMAGE_TOOL_DEFINITION = {
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
};

export const CHANGE_OUTFIT_TOOL_DEFINITION = {
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
};

export const CHANGE_MODEL_TOOL_DEFINITION = {
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
};

export const REPLICATE_REFERENCE_TOOL_DEFINITION = {
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
};

export const EDIT_IMAGE_TOOL_DEFINITION = {
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
};



