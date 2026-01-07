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
 */
export async function runOnboardingWorkflow(input: OnboardingInput): Promise<OnboardingResult> {
    logger.info(`Starting onboarding workflow for user: ${input.userId}`);

    const imageContext: Record<string, string> = {
        [input.productImage.id]: input.productImage.data
    };
    const context = { userId: input.userId, conversationId: input.conversationId, imageContext };

    // 1. 分析网页商品链接
    logger.info('Step 2: Analyzing web link...');
    const webScrape = await executeTool('web_scraper', { url: input.webLink }, context);

    // 使用 VLM 解析网页图片
    const webModelSelection = await performVLMSelection(
        webScrape.images,
        "Find a typical front-facing model wearing clothing. Return only the image URL.",
        "web_model"
    );
    const webProductSelection = await performVLMSelection(
        webScrape.images,
        "Find a professional product-only shot without a model. Return the image URL or 'none' if not found.",
        "web_product"
    );

    // 总结品牌理念
    const brandSummary = await performVLMTextTask(
        `Analyze this webpage content and summarize the brand philosophy and keywords: ${webScrape.text}`
    );

    // 3. 分析 INS 内容链接
    logger.info('Step 3: Analyzing Instagram link...');
    const insScrape = await executeTool('social_analyzer', { url: input.insLink }, context);
    const insSelection = await performVLMSelection(
        insScrape.images || [],
        "Find the most representative lifestyle model shot. Return only the image URL.",
        "ins_lifestyle"
    );

    // 4. 分析短视频
    logger.info('Step 4: Analyzing video...');
    const videoAnalysis = await executeTool('video_to_text', { url: input.videoUrl }, context);

    // 6. 开始生成
    logger.info('Step 6: Generating assets...');

    // 6.1 2张官网风模特图
    const webStyleImages = await executeTool('replicate_reference', {
        product_image: input.productImage.id,
        reference_image: webModelSelection,
        elements_to_replicate: ['composition', 'lighting', 'vibe']
    }, context);

    // 6.2 2张 INS 风模特图
    const insStyleImages = await executeTool('replicate_reference', {
        product_image: input.productImage.id,
        reference_image: insSelection,
        elements_to_replicate: ['composition', 'pose', 'vibe']
    }, context);

    // 6.3 1张无模特商品图 (如果存在)
    let productDisplayImages: any = { images: [] };
    if (webProductSelection && webProductSelection !== 'none') {
        productDisplayImages = await executeTool('replicate_reference', {
            product_image: input.productImage.id,
            reference_image: webProductSelection,
            elements_to_replicate: ['lighting', 'vibe', 'color_tone']
        }, context);
    }

    // 6.4 1条 Sora 2 短视频
    logger.info('Step 6.4: Generating Sora 2 video...');
    const videoResult = await executeTool('generate_sora_video', {
        prompt: videoAnalysis.prompt,
        preview_image: input.productImage.id
    }, context);

    return {
        brandKeywords: brandSummary,
        webAnalysis: {
            modelImageRef: webModelSelection,
            productImageRef: webProductSelection,
        },
        insAnalysis: {
            finalImageRef: insSelection,
        },
        videoAnalysis: {
            videoPrompt: videoAnalysis.prompt,
        },
        generatedAssets: {
            webStyleImages: mapAssets(webStyleImages),
            insStyleImages: mapAssets(insStyleImages),
            productDisplayImages: mapAssets(productDisplayImages),
            videoPlaceholder: videoResult.url ? { id: videoResult.id, url: videoResult.url } : undefined,
        }
    };
}

/**
 * Helper to use Gemini for visual selection
 */
async function performVLMSelection(imageUrls: string[], instruction: string, tag: string): Promise<string> {
    if (imageUrls.length === 0) return 'none';
    if (imageUrls.length === 1) return imageUrls[0];

    try {
        const client = getGenAIClient();
        const model = (client as any).getGenerativeModel({ model: "gemini-1.5-flash-preview-0514" });

        // 我们只取前10张图片进行分析，避免过长
        const imagesToAnalyze = imageUrls.slice(0, 10);

        const prompt = `Given these product image URLs from a fashion brand, ${instruction} 
        Return ONLY the raw URL of the selected image. 
        Images:
        ${imagesToAnalyze.join('\n')}`;

        const result = await model.generateContent(prompt);
        const text = result.response.text().trim();

        // 提取匹配的 URL
        const match = imagesToAnalyze.find(url => text.includes(url));
        logger.info(`VLM Selection for ${tag}: ${match ? 'found match' : 'default to first'}`);
        return match || imageUrls[0];
    } catch (e) {
        logger.error(`VLM Selection failed for ${tag}`, e);
        return imageUrls[0];
    }
}

/**
 * Helper to use Gemini for text analysis
 */
async function performVLMTextTask(prompt: string): Promise<string> {
    const client = getGenAIClient();
    const model = (client as any).getGenerativeModel({ model: "gemini-1.5-flash-preview-0514" });
    const result = await model.generateContent(prompt);
    return result.response.text();
}

/**
 * 将工具返回的 base64 列表转换为前端可用的对象列表
 */
function mapAssets(result: any): any[] {
    if (!result || !result.images) return [];
    return result.images.map((img: any, index: number) => ({
        id: `gen_${Date.now()}_${index}`,
        url: `data:${img.mimeType};base64,${img.data}`
    }));
}
