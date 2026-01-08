/**
 * Claude Tool Adapters - Analysis Tools
 * Wraps existing Gemini analysis tools for use with Claude Agent SDK
 */

import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { generateOutfitInstruct, type StylistInput } from '../stylist.js';
import { analyzeImage, type AnalyzeImageInput } from '../analyze-image.js';
import { scrapeWebsite, analyzeSocial, analyzeVideo } from '../scrapers.js';
import { createLogger } from '../../../lib/logger.js';

const logger = createLogger('claude-adapters:analysis');

// ============================================
// Stylist Tool
// ============================================

const stylistSchema = {
    product_image: z.string().describe('商品图引用'),
    model_image: z.string().optional().describe('模特参考图引用'),
    scene_image: z.string().optional().describe('场景参考图引用'),
    style_preference: z.string().optional().describe('风格偏好'),
};

export const stylistTool = tool(
    'stylist',
    '时尚搭配师 - 分析商品并生成专业搭配建议（中英双语）',
    stylistSchema,
    async (args) => {
        logger.info('Claude calling stylist');

        try {
            const input: StylistInput = {
                productImage: args.product_image,
                modelImage: args.model_image,
                sceneImage: args.scene_image,
                stylePreference: args.style_preference,
            };

            const result = await generateOutfitInstruct(input);

            return {
                content: [{
                    type: 'text' as const,
                    text: JSON.stringify({
                        success: true,
                        outfit_instruct_zh: result.outfit_instruct_zh,
                        outfit_instruct_en: result.outfit_instruct_en,
                        outfit_instruct: result.outfit_instruct_en,
                        message: '搭配方案已生成',
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

// ============================================
// Analyze Image Tool
// ============================================

const analyzeImageSchema = {
    image_ref: z.string().describe('图片引用'),
    analysis_type: z.enum(['clothing', 'model', 'scene', 'full']).optional().describe('分析类型'),
};

export const analyzeImageTool = tool(
    'analyze_image',
    '分析图片内容，识别服装、模特、场景等元素',
    analyzeImageSchema,
    async (args) => {
        logger.info('Claude calling analyze_image', { type: args.analysis_type });

        try {
            const input: AnalyzeImageInput = {
                imageData: args.image_ref,
                analysisType: args.analysis_type || 'full',
            };

            const result = await analyzeImage(input);

            return {
                content: [{
                    type: 'text' as const,
                    text: JSON.stringify({
                        success: true,
                        analysis: result.analysis,
                        structured: result.structured,
                        message: '图像分析完成',
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

// ============================================
// Scraper Tools
// ============================================

const webScraperSchema = {
    url: z.string().describe('需要抓取的网页 URL'),
};

export const webScraperTool = tool(
    'web_scraper',
    '抓取指定网页的内容，获取标题、文本和图片列表',
    webScraperSchema,
    async (args) => {
        logger.info('Claude calling web_scraper', { url: args.url });

        try {
            const result = await scrapeWebsite(args.url);

            return {
                content: [{
                    type: 'text' as const,
                    text: JSON.stringify({
                        success: true,
                        ...result,
                        message: '网页抓取完成',
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

const socialAnalyzerSchema = {
    url: z.string().describe('社交媒体内容链接'),
};

export const socialAnalyzerTool = tool(
    'social_analyzer',
    '分析社交媒体（如 Instagram）的内容链接，提取图片和描述',
    socialAnalyzerSchema,
    async (args) => {
        logger.info('Claude calling social_analyzer', { url: args.url });

        try {
            const result = await analyzeSocial(args.url);

            return {
                content: [{
                    type: 'text' as const,
                    text: JSON.stringify({
                        success: true,
                        ...result,
                        message: '社交媒体分析完成',
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

const videoAnalyzerSchema = {
    url: z.string().describe('视频文件 URL'),
};

export const videoAnalyzerTool = tool(
    'video_to_text',
    '分析视频文件或 URL，提取视频风格描述和反推提示词',
    videoAnalyzerSchema,
    async (args) => {
        logger.info('Claude calling video_to_text', { url: args.url });

        try {
            const result = await analyzeVideo(args.url);

            return {
                content: [{
                    type: 'text' as const,
                    text: JSON.stringify({
                        success: true,
                        ...result,
                        message: '视频分析完成',
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

// Export all analysis tools
export const analysisTools = [
    stylistTool,
    analyzeImageTool,
    webScraperTool,
    socialAnalyzerTool,
    videoAnalyzerTool,
];
