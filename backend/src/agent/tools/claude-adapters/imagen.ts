/**
 * Claude Tool Adapters - Image Generation Tools
 * Wraps existing Gemini Imagen tools for use with Claude Agent SDK
 */

import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import {
    generateModelImage,
    changeOutfit,
    changeModel,
    replicateReference,
    editImage,
    type GenerateModelImageInput,
    type ChangeOutfitInput,
    type ChangeModelInput,
    type ReplicateReferenceInput,
    type EditImageInput,
} from '../generate-image.js';
import { createLogger } from '../../../lib/logger.js';

const logger = createLogger('claude-adapters:imagen');

// ============================================
// Schema Definitions
// ============================================

const generateModelImageSchema = {
    product_image: z.string().describe('商品图引用 (ID 或 Base64)'),
    model_reference: z.string().optional().describe('模特参考图引用 (可选)'),
    model_style: z.enum(['korean', 'japanese', 'western', 'chinese', 'auto']).optional().describe('模特风格'),
    scene_type: z.enum(['studio', 'outdoor', 'indoor', 'street', 'custom']).optional().describe('场景类型'),
    scene_reference: z.string().optional().describe('场景参考图引用'),
    outfit_instruct: z.string().optional().describe('搭配描述'),
    vibe: z.string().optional().describe('氛围描述'),
    count: z.number().optional().describe('生成数量，默认 2'),
};

const changeOutfitSchema = {
    original_image: z.string().describe('原图引用'),
    outfit_images: z.array(z.string()).describe('新服装图片引用列表'),
    outfit_instruct: z.string().optional().describe('搭配描述'),
    style_notes: z.string().optional().describe('风格说明'),
};

const changeModelSchema = {
    original_image: z.string().describe('原图引用'),
    model_reference: z.string().optional().describe('模特参考图引用'),
    model_style: z.enum(['korean', 'japanese', 'western', 'chinese', 'auto']).optional().describe('模特风格'),
    model_gender: z.enum(['female', 'male']).optional().describe('模特性别'),
};

const replicateReferenceSchema = {
    product_image: z.string().describe('商品图引用'),
    reference_image: z.string().describe('参考图引用'),
    elements_to_replicate: z.array(z.enum(['composition', 'pose', 'lighting', 'vibe', 'color_tone'])).optional().describe('要复刻的元素'),
};

const editImageSchema = {
    image_ref: z.string().describe('要编辑的图片引用'),
    edit_instruction: z.string().describe('编辑指令'),
    edit_region: z.enum(['full', 'upper_body', 'lower_body', 'background', 'accessory', 'face']).optional().describe('编辑区域'),
};

// ============================================
// Tool Definitions
// ============================================

/**
 * Generate Model Image Tool
 * Wraps Gemini Imagen for generating model photos wearing products
 */
export const generateModelImageTool = tool(
    'generate_model_image',
    '根据商品图生成模特穿着图。可以指定模特风格、场景类型等。',
    generateModelImageSchema,
    async (args) => {
        logger.info('Claude calling generate_model_image', { productImage: args.product_image?.substring(0, 50) });

        try {
            const input: GenerateModelImageInput = {
                productImage: args.product_image,
                modelReference: args.model_reference,
                modelStyle: args.model_style,
                sceneType: args.scene_type,
                sceneReference: args.scene_reference,
                outfitInstruct: args.outfit_instruct,
                vibe: args.vibe,
                count: args.count,
            };

            const images = await generateModelImage(input);

            return {
                content: [{
                    type: 'text' as const,
                    text: JSON.stringify({
                        success: true,
                        images: images.map(img => ({ id: img.id, url: img.url })),
                        message: `成功生成 ${images.length} 张模特图`,
                    }),
                }],
            };
        } catch (error: any) {
            logger.error('generate_model_image failed', { error: error.message });
            return {
                content: [{
                    type: 'text' as const,
                    text: JSON.stringify({ success: false, error: error.message }),
                }],
                isError: true,
            };
        }
    }
);

/**
 * Change Outfit Tool
 */
export const changeOutfitTool = tool(
    'change_outfit',
    '保持原图的模特和场景不变，替换服装搭配。',
    changeOutfitSchema,
    async (args) => {
        logger.info('Claude calling change_outfit');

        try {
            const input: ChangeOutfitInput = {
                originalImage: args.original_image,
                outfitImages: args.outfit_images,
                outfitInstruct: args.outfit_instruct,
                styleNotes: args.style_notes,
            };

            const images = await changeOutfit(input);

            return {
                content: [{
                    type: 'text' as const,
                    text: JSON.stringify({
                        success: true,
                        images: images.map(img => ({ id: img.id, url: img.url })),
                        message: '换搭配完成',
                    }),
                }],
            };
        } catch (error: any) {
            return {
                content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: error.message }) }],
                isError: true,
            };
        }
    }
);

/**
 * Change Model Tool
 */
export const changeModelTool = tool(
    'change_model',
    '保持原图的服装和场景不变，替换模特。',
    changeModelSchema,
    async (args) => {
        logger.info('Claude calling change_model');

        try {
            const input: ChangeModelInput = {
                originalImage: args.original_image,
                modelReference: args.model_reference,
                modelStyle: args.model_style,
                modelGender: args.model_gender,
            };

            const images = await changeModel(input);

            return {
                content: [{
                    type: 'text' as const,
                    text: JSON.stringify({
                        success: true,
                        images: images.map(img => ({ id: img.id, url: img.url })),
                        message: '换模特完成',
                    }),
                }],
            };
        } catch (error: any) {
            return {
                content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: error.message }) }],
                isError: true,
            };
        }
    }
);

/**
 * Replicate Reference Tool
 */
export const replicateReferenceTool = tool(
    'replicate_reference',
    '参考目标图的构图、氛围、姿势等元素，用指定商品生成类似风格的图片。',
    replicateReferenceSchema,
    async (args) => {
        logger.info('Claude calling replicate_reference');

        try {
            const input: ReplicateReferenceInput = {
                productImage: args.product_image,
                referenceImage: args.reference_image,
                elementsToReplicate: args.elements_to_replicate,
            };

            const images = await replicateReference(input);

            return {
                content: [{
                    type: 'text' as const,
                    text: JSON.stringify({
                        success: true,
                        images: images.map(img => ({ id: img.id, url: img.url })),
                        message: '参考图复刻完成',
                    }),
                }],
            };
        } catch (error: any) {
            return {
                content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: error.message }) }],
                isError: true,
            };
        }
    }
);

/**
 * Edit Image Tool
 */
export const editImageTool = tool(
    'edit_image',
    '对图片进行局部编辑，如修改服装细节、调整背景等。',
    editImageSchema,
    async (args) => {
        logger.info('Claude calling edit_image', { instruction: args.edit_instruction });

        try {
            const input: EditImageInput = {
                image: args.image_ref,
                instruction: args.edit_instruction,
                region: args.edit_region,
            };

            const images = await editImage(input);

            return {
                content: [{
                    type: 'text' as const,
                    text: JSON.stringify({
                        success: true,
                        images: images.map(img => ({ id: img.id, url: img.url })),
                        message: '图片编辑完成',
                    }),
                }],
            };
        } catch (error: any) {
            return {
                content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: error.message }) }],
                isError: true,
            };
        }
    }
);

// Export all image generation tools
export const imagenTools = [
    generateModelImageTool,
    changeOutfitTool,
    changeModelTool,
    replicateReferenceTool,
    editImageTool,
];
