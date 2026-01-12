// @ts-nocheck
import { getGenAIClient, safetySettings, createImagePart, extractImages } from '../../lib/genai.js';
import { config } from '../../config/index.js';
import { createLogger } from '../../lib/logger.js';
import { nanoid } from 'nanoid';
import { GeneratedImage } from '../types.js';

const logger = createLogger('tools:visual-generator');
const IMAGE_GEN_MODEL = config.ai.models.imageGen;

export interface VisualGenerationInput {
    prompt: string;
    image_references?: string[];
    count?: number;
}

/**
 * 通用图像生成工具
 * 支持文生图、图生图
 */
export async function generateVisualContent(input: VisualGenerationInput): Promise<GeneratedImage[]> {
    const client = getGenAIClient();
    const count = input.count || 1;

    logger.info('Generating visual content', {
        promptLength: input.prompt.length,
        hasImageRefs: input.image_references?.length || 0,
        count,
    });

    const parts: any[] = [];

    // 添加参考图 (如果有)
    if (input.image_references && input.image_references.length > 0) {
        for (const ref of input.image_references) {
            if (ref) {
                // createImagePart handles the base64 string or url internally
                parts.push(createImagePart(ref));
            }
        }
    }

    // 添加 Prompt
    parts.push({ text: input.prompt });

    const allImages: GeneratedImage[] = [];

    // 串行生成以避免内存/API限制
    for (let i = 0; i < count; i++) {
        try {
            logger.info(`Generating image ${i + 1}/${count}...`);
            const response = await client.models.generateContent({
                model: IMAGE_GEN_MODEL,
                contents: [{ role: 'user', parts }],
                config: {
                    safetySettings,
                    responseModalities: ['image', 'text'],
                },
            });

            const images = extractImages(response);
            logger.info(`Image ${i + 1} generated, got ${images.length} images`);

            for (const img of images) {
                allImages.push({
                    id: `gen_${nanoid(8)}`,
                    url: `data:${img.mimeType};base64,${img.data}`,
                    data: img.data,
                });
            }
        } catch (e: any) {
            logger.error(`Failed to generate image ${i + 1}`, { error: e.message });
        }
    }

    if (allImages.length === 0) {
        throw new Error('No images generated');
    }

    return allImages;
}

export const VISUAL_GENERATOR_TOOL_DEFINITION = {
    name: 'generate_image',
    description: '通用图像生成工具。根据文本提示词和可选的参考图生成图像。适用于生成模特图、换装、换模特、编辑图片等所有生成类任务。',
    parameters: {
        type: 'object',
        properties: {
            prompt: {
                type: 'string',
                description: '详细的图像生成提示词 (英文)',
            },
            image_references: {
                type: 'array',
                items: { type: 'string' },
                description: '参考图片引用列表 (可选)',
            },
            count: {
                type: 'number',
                description: '生成数量，默认 1',
            },
        },
        required: ['prompt'],
    },
};
