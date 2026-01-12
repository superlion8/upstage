// @ts-nocheck
import { getGenAIClient, safetySettings, createImagePart, extractText } from '../../lib/genai.js';
import { config } from '../../config/index.js';
import { createLogger } from '../../lib/logger.js';

const logger = createLogger('tools:photographer');
const PHOTOGRAPHER_MODEL = config.ai.models.thinking; // use flash-preview

export interface PhotographerInput {
    product_image: string;
    model_image: string;
    scene_image: string;
}

export interface PhotographerOutput {
    Model_Pose: string;
    Composition: string;
    Camera_Setting: string;
}

export async function generatePhotographyInstructions(input: PhotographerInput): Promise<PhotographerOutput> {
    const client = getGenAIClient();

    logger.info('Generating photography instructions');

    const parts: any[] = [];

    // Input images
    parts.push(createImagePart(input.product_image));
    parts.push({ text: 'Product Image' });

    parts.push(createImagePart(input.model_image));
    parts.push({ text: 'Model Image' });

    parts.push(createImagePart(input.scene_image));
    parts.push({ text: 'Scene/Background Image' });

    // System Prompt
    const prompt = `你是一个专门拍摄电商商品商业拍摄的职业摄影师，请你基于你要拍摄的商品[product]、展示这个商品的模特[model]和他所处的背景环境[scene]，输出一个合适的拍摄指令。
请你严格用英文按照下面这个格式来写，不需要输出其他额外的东西：
{
"Model_Pose": "",
"Composition":"",
"Camera Setting":""
}`;

    parts.push({ text: prompt });

    try {
        const response = await client.models.generateContent({
            model: PHOTOGRAPHER_MODEL,
            contents: [{ role: 'user', parts }],
            config: {
                safetySettings,
                responseMimeType: 'application/json', // Enforce JSON
            },
        });

        const text = extractText(response);
        if (!text) throw new Error('No text generated');

        // Parse JSON
        try {
            const json = JSON.parse(text);
            return {
                Model_Pose: json.Model_Pose || '',
                Composition: json.Composition || '',
                Camera_Setting: json['Camera Setting'] || json.Camera_Setting || '',
            };
        } catch (e) {
            logger.error('Failed to parse JSON', { text });
            throw new Error('Invalid JSON format from photographer');
        }

    } catch (error: any) {
        logger.error('Photographer tool failed', { error: error.message });
        throw error;
    }
}

export const PHOTOGRAPHER_TOOL_DEFINITION = {
    name: 'photographer',
    description: '职业摄影师工具。根据商品、模特和场景图片，生成专业的拍摄指令（姿势、构图、相机设置）。',
    parameters: {
        type: 'object',
        properties: {
            product_image: { type: 'string', description: '商品图片引用' },
            model_image: { type: 'string', description: '模特图片引用' },
            scene_image: { type: 'string', description: '场景图片引用' },
        },
        required: ['product_image', 'model_image', 'scene_image'],
    },
};
