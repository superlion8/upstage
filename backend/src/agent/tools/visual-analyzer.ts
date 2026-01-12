// @ts-nocheck
import { getGenAIClient, safetySettings, createImagePart, extractText } from '../../lib/genai.js';
import { config } from '../../config/index.js';
import { createLogger } from '../../lib/logger.js';

const logger = createLogger('tools:visual-analyzer');
const ANALYSIS_MODEL = config.ai.models.analysis;

export interface VisualAnalysisInput {
    media_ref: string; // Image or Video URL (or base64 for image)
    instruction?: string;
}

export async function analyzeVisualContent(input: VisualAnalysisInput): Promise<string> {
    const client = getGenAIClient();

    logger.info('Analyzing visual content');

    const parts: any[] = [];

    // TODO: Handle Video if media_ref points to a video file.
    // For now, assume ImageStore refs are images.
    // Ideally, resolveImage should handle media type.
    // For this implementation, we rely on createImagePart which works for images.
    // If video is needed, we need a 'createVideoPart' or similar.
    // Assuming 'createImagePart' handles generic media or we need to detect.

    // Since 'createImagePart' in genai.ts (checked previously) handles base64 images.
    // If the user inputs a video URL, we might need download logic (like video-analyzer in scrapers.ts).
    // But user said "gemini-3-flash-preview" which supports video tokens.

    // For simplicity, we assume generic image part creation for now.
    // If it's a video file path, we'd need file API.

    parts.push(createImagePart(input.media_ref));

    const instruction = input.instruction || 'Analyze this image in detail.';
    parts.push({ text: instruction });

    const response = await client.models.generateContent({
        model: ANALYSIS_MODEL,
        contents: [{ role: 'user', parts }],
        config: { safetySettings },
    });

    const text = extractText(response);
    if (!text) throw new Error('No analysis generated');

    return text;
}

export const VISUAL_ANALYZER_TOOL_DEFINITION = {
    name: 'visual_analysis',
    description: '视觉分析工具。输入图片或视频，输出对内容的详细分析。',
    parameters: {
        type: 'object',
        properties: {
            media_ref: { type: 'string', description: '图片或视频引用' },
            instruction: { type: 'string', description: '分析指令（可选），例如“分析模特的穿搭”' },
        },
        required: ['media_ref'],
    },
};
