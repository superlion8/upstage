import { createLogger } from '../lib/logger.js';
import { executeTool } from './tools/index.js';
import { AgentInput } from './types.js';
import { getGenAIClient } from '../lib/genai.js';

const logger = createLogger('onboarding-workflow');

export interface OnboardingInput {
    userId: string;
    conversationId: string;
    webLink: string;
    insLink: string;
    videoUrl: string;
    productImage: { id: string; data: string; mimeType: string };
}

export interface OnboardingResult {
    brandKeywords: string;
    webAnalysis: {
        modelImageRef: string;
        productImageRef: string;
    };
    insAnalysis: {
        finalImageRef: string;
    };
    videoAnalysis: {
        videoPrompt: string;
    };
    generatedAssets: {
        webStyleImages: any[];
        insStyleImages: any[];
        productDisplayImages: any[];
        videoPlaceholder?: any;
    };
}

/**
 * Onboarding Workflow Orchestrator
 * MINIMAL TEST VERSION - skip heavy processing to diagnose crashes
 */
export async function runOnboardingWorkflow(input: OnboardingInput): Promise<OnboardingResult> {
    logger.info(`Starting onboarding workflow for user: ${input.userId}`);
    logger.info(`Product image size: ${input.productImage.data.length} chars`);

    // MINIMAL TEST: Just return mock data to verify connection works
    // TODO: Re-enable full workflow after connection is stable

    const mockWebAsset = {
        id: 'mock_web_1',
        url: '' // Empty - will show placeholder in UI
    };

    const mockInsAsset = {
        id: 'mock_ins_1',
        url: ''
    };

    logger.info('Returning mock data for testing...');

    return {
        brandKeywords: 'Test: 时尚, 前卫, 高端',
        webAnalysis: {
            modelImageRef: 'test_ref',
            productImageRef: 'test_ref',
        },
        insAnalysis: {
            finalImageRef: 'test_ref',
        },
        videoAnalysis: {
            videoPrompt: 'Test video prompt',
        },
        generatedAssets: {
            webStyleImages: [mockWebAsset, mockWebAsset],
            insStyleImages: [mockInsAsset, mockInsAsset],
            productDisplayImages: [mockWebAsset],
        }
    };
}

/**
 * Helper to use Gemini for text analysis
 */
async function performVLMTextTask(prompt: string): Promise<string> {
    try {
        const client = getGenAIClient();
        const result = await client.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt
        });
        return result.text || '';
    } catch (e) {
        logger.error('VLM text task failed', e);
        return '';
    }
}

/**
 * 将工具返回的 base64 列表转换为前端可用的对象列表
 */
function mapAssets(result: any): any[] {
    if (!result || !result.images) return [];
    return result.images.map((img: any, index: number) => ({
        id: `gen_${Date.now()}_${index}`,
        url: `data:${img.mimeType || 'image/png'};base64,${img.data}`
    }));
}
