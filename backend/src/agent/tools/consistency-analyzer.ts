// @ts-nocheck
import { getGenAIClient, safetySettings, createImagePart, extractText } from '../../lib/genai.js';
import { config } from '../../config/index.js';
import { createLogger } from '../../lib/logger.js';

const logger = createLogger('tools:consistency-analyzer');
const ANALYSIS_MODEL = config.ai.models.analysis;

export interface ConsistencyAnalysisInput {
    generated_image: string;
    original_product_image: string;
}

export interface ConsistencyAnalysisOutput {
    score: number;
    reasoning: string;
    suggestions: string;
}

export async function analyzeConsistency(input: ConsistencyAnalysisInput): Promise<ConsistencyAnalysisOutput> {
    const client = getGenAIClient();

    logger.info('Analyzing consistency');

    const parts: any[] = [];

    parts.push(createImagePart(input.original_product_image));
    parts.push({ text: 'Original Product Image' });

    parts.push(createImagePart(input.generated_image));
    parts.push({ text: 'Generated Image' });

    const prompt = `你是一个专业的电商修图师和质检员。
请对比【Original Product Image】和【Generated Image】，评估生成图中商品对原图商品的还原程度（主要关注材质、版型、细节）。
请输出 JSON 格式：
{
  "score": 0-100之间的整数,
  "reasoning": "中文评分理由",
  "suggestions": "中文修改建议"
}`;

    parts.push({ text: prompt });

    const response = await client.models.generateContent({
        model: ANALYSIS_MODEL,
        contents: [{ role: 'user', parts }],
        config: {
            safetySettings,
            responseMimeType: 'application/json',
        },
    });

    const text = extractText(response);
    if (!text) throw new Error('No analysis generated');

    try {
        const json = JSON.parse(text);
        return {
            score: typeof json.score === 'number' ? json.score : 0,
            reasoning: json.reasoning || '',
            suggestions: json.suggestions || '',
        };
    } catch (e) {
        logger.error('Failed to parse JSON', { text });
        throw new Error('Invalid JSON format from consistency analyzer');
    }
}

export const CONSISTENCY_ANALYZER_TOOL_DEFINITION = {
    name: 'analyze_consistency',
    description: '商品还原度分析工具。对比生成图和原商品图，输出材质和版型的还原度评分（0-100）及修改建议。',
    parameters: {
        type: 'object',
        properties: {
            generated_image: { type: 'string', description: '生成的图片引用' },
            original_product_image: { type: 'string', description: '原始商品图片引用' },
        },
        required: ['generated_image', 'original_product_image'],
    },
};
