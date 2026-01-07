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
 * Simplified version with robust error handling
 */
export async function runOnboardingWorkflow(input: OnboardingInput): Promise<OnboardingResult> {
    logger.info(`Starting onboarding workflow for user: ${input.userId}`);

    const imageContext: Record<string, string> = {
        [input.productImage.id]: input.productImage.data
    };
    const context = { userId: input.userId, conversationId: input.conversationId, imageContext };

    // Default results in case of failures
    let brandSummary = "时尚品牌";
    let webModelSelection = "";
    let insSelection = "";
    let videoPrompt = "A model walking in stylish clothing.";

    // Step 1: Analyze web link
    try {
        logger.info('Step 1: Analyzing web link...', { url: input.webLink });
        const webScrape = await executeTool('web_scraper', { url: input.webLink }, context);

        logger.info('Web scrape result', {
            imageCount: webScrape.images?.length || 0,
            textLength: webScrape.text?.length || 0,
            title: webScrape.title
        });

        if (webScrape.images && webScrape.images.length > 0) {
            webModelSelection = webScrape.images[0]; // Use first image as reference
            logger.info('Selected web model image', { url: webModelSelection });
        }

        // Summarize brand
        if (webScrape.text) {
            brandSummary = await performVLMTextTask(
                `Summarize this brand's style in 3-5 keywords (comma separated): ${webScrape.text.substring(0, 2000)}`
            );
            logger.info('Brand summary generated', { brandSummary });
        }
    } catch (e) {
        logger.error('Step 1 failed, using defaults', e);
    }

    // Step 2: Analyze Instagram (skip for now - returns empty)
    try {
        logger.info('Step 2: Analyzing Instagram link...');
        const insScrape = await executeTool('social_analyzer', { url: input.insLink }, context);
        if (insScrape.images && insScrape.images.length > 0) {
            insSelection = insScrape.images[0];
        }
    } catch (e) {
        logger.error('Step 2 failed, using defaults', e);
    }

    // Step 3: Analyze video
    try {
        logger.info('Step 3: Analyzing video...');
        const videoResult = await executeTool('video_to_text', { url: input.videoUrl }, context);
        videoPrompt = videoResult.prompt || videoPrompt;
    } catch (e) {
        logger.error('Step 3 failed, using defaults', e);
    }

    // Step 4: Generate assets using the product image directly
    logger.info('Step 4: Generating assets...');

    let webStyleImages: any = { images: [] };
    let insStyleImages: any = { images: [] };
    let productDisplayImages: any = { images: [] };

    try {
        // Generate model images using the product image
        webStyleImages = await executeTool('generate_model_image', {
            product_image: input.productImage.id,
            model_style: 'professional ecommerce model, studio lighting, white background',
            count: 2
        }, context);
    } catch (e) {
        logger.error('Failed to generate web style images', e);
    }

    try {
        insStyleImages = await executeTool('generate_model_image', {
            product_image: input.productImage.id,
            model_style: 'lifestyle model, natural lighting, urban street background, Instagram aesthetic',
            count: 2
        }, context);
    } catch (e) {
        logger.error('Failed to generate ins style images', e);
    }

    try {
        productDisplayImages = await executeTool('generate_model_image', {
            product_image: input.productImage.id,
            model_style: 'product only, no model, minimalist studio setup, professional lighting',
            count: 1
        }, context);
    } catch (e) {
        logger.error('Failed to generate product display images', e);
    }

    return {
        brandKeywords: brandSummary,
        webAnalysis: {
            modelImageRef: webModelSelection,
            productImageRef: webModelSelection,
        },
        insAnalysis: {
            finalImageRef: insSelection,
        },
        videoAnalysis: {
            videoPrompt: videoPrompt,
        },
        generatedAssets: {
            webStyleImages: mapAssets(webStyleImages),
            insStyleImages: mapAssets(insStyleImages),
            productDisplayImages: mapAssets(productDisplayImages),
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
