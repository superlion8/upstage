import axios from 'axios';
import * as cheerio from 'cheerio';
import { createLogger } from '../../lib/logger.js';

const logger = createLogger('tools:scrapers');

export interface ScrapeResult {
    links: string[];
    text: string;
    images: string[];
    title: string;
}

/**
 * 抓取网页文字和图片
 */
export async function scrapeWebsite(url: string): Promise<ScrapeResult> {
    logger.info(`Scraping website: ${url}`);
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: 10000
        });

        const $ = cheerio.load(response.data);
        const title = $('title').text();
        const text = $('body').text().replace(/\s+/g, ' ').trim();

        const images: string[] = [];
        $('img').each((_, el) => {
            const src = $(el).attr('src');
            if (src) {
                // 转换为绝对路径 (简单处理)
                try {
                    const absoluteUrl = new URL(src, url).href;
                    if (absoluteUrl.startsWith('http')) {
                        images.push(absoluteUrl);
                    }
                } catch (e) {
                    // ignore
                }
            }
        });

        return {
            title,
            text: text.substring(0, 5000), // 限制文本长度
            images: Array.from(new Set(images)).slice(0, 20), // 限制图片数量
            links: []
        };
    } catch (error) {
        logger.error('Failed to scrape website', { url, error });
        throw new Error(`无法抓取网页: ${url}`);
    }
}

/**
 * 分析社交媒体内容 (Instagram 等)
 * 注意：由于反爬限制，通常需要专门的 API 或代理
 */
export async function analyzeSocial(url: string): Promise<{ images: string[], caption: string }> {
    logger.info(`Analyzing social content: ${url}`);
    // 模拟实现：对于演示，我们可以尝试抓取，或者直接返回一些 Mock 数据
    // 实际生产建议对接专门的 Scraper API
    return {
        images: [],
        caption: "Instagram content analysis is pending specialized API integration."
    };
}

/**
 * 分析视频内容 (UGC 视频)
 */
export async function analyzeVideo(videoUrl: string): Promise<{ prompt: string, style: string }> {
    logger.info(`Analyzing video: ${videoUrl}`);
    // 模拟实现
    return {
        prompt: "A short UGC video showing product details with natural lighting.",
        style: "Candid, lifestyle, home-made"
    };
}

// ============================================
// Tool Definitions
// ============================================

export const WEB_SCRAPER_TOOL_DEFINITION = {
    name: 'web_scraper',
    description: '抓取指定网页的内容，获取标题、文本和图片列表。用于分析品牌官网、商品详情页等。',
    parameters: {
        type: 'object',
        properties: {
            url: { type: 'string', description: '需要抓取的网页 URL' }
        },
        required: ['url']
    }
};

export const SOCIAL_ANALYZER_TOOL_DEFINITION = {
    name: 'social_analyzer',
    description: '分析社交媒体（如 Instagram）的内容链接，提取图片和描述。',
    parameters: {
        type: 'object',
        properties: {
            url: { type: 'string', description: 'INS 内容链接' }
        },
        required: ['url']
    }
};

export const VIDEO_ANALYZER_TOOL_DEFINITION = {
    name: 'video_to_text',
    description: '分析视频文件或 URL，提取视频风格描述和反推提示词。',
    parameters: {
        type: 'object',
        properties: {
            url: { type: 'string', description: '视频文件 URL' }
        },
        required: ['url']
    }
};
