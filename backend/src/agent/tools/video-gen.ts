import { OpenAI } from 'openai';
import { config } from '../../config/index.js';
import { createLogger } from '../../lib/logger.js';

const logger = createLogger('tools:video-gen');

// Initialize OpenAI client for Sora
const soraClient = config.ai.sora.apiKey ? new OpenAI({
    apiKey: config.ai.sora.apiKey,
}) : null;

export interface SoraVideoResult {
    id: string;
    status: string;
    url?: string;
    error?: string;
}

/**
 * 调用 Sora 2 API 生成短视频
 */
export async function generateSoraVideo(prompt: string, options?: { preview_image?: string }): Promise<SoraVideoResult> {
    if (!soraClient) {
        logger.warn('SORA_API_KEY is not set. Returning mock video.');
        return mockSoraResult(prompt);
    }

    try {
        logger.info('Requesting Sora 2 video generation', { promptSnippet: prompt.substring(0, 50) });

        // 假设 OpenAI SDK 已更新以支持 v1/videos
        // 由于实际 SDK 可能未更新或 API 处于 Beta，我们使用原生 fetch 演示真实对接
        const response = await fetch('https://api.openai.com/v1/videos', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.ai.sora.apiKey}`
            },
            body: JSON.stringify({
                model: config.ai.sora.model,
                prompt: prompt,
                input_reference: options?.preview_image,
                size: "1024x1792", // 9:16
                seconds: 10
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Sora API Error: ${errorData.error?.message || response.statusText}`);
        }

        const job = await response.json();
        logger.info('Sora 2 job created', { jobId: job.id });

        // 开始轮询 (在实际生产中应该异步处理，这里为了 Workflow 示例做简易轮询)
        return await pollSoraStatus(job.id);

    } catch (error: any) {
        logger.error('Failed to generate Sora video', { error: error.message });
        throw error;
    }
}

/**
 * 轮询 Sora 任务状态
 */
async function pollSoraStatus(jobId: string): Promise<SoraVideoResult> {
    const MAX_POLLS = 60; // 5分钟 (5秒一次)
    const POLL_INTERVAL = 5000;

    for (let i = 0; i < MAX_POLLS; i++) {
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));

        const response = await fetch(`https://api.openai.com/v1/videos/${jobId}`, {
            headers: {
                'Authorization': `Bearer ${config.ai.sora.apiKey}`
            }
        });

        if (!response.ok) continue;

        const data = await response.json();
        logger.debug('Sora job status', { jobId, status: data.status });

        if (data.status === 'completed') {
            return {
                id: jobId,
                status: 'completed',
                url: data.url || data.video?.url
            };
        }

        if (data.status === 'failed') {
            throw new Error(`Sora job failed: ${data.error?.message || 'Unknown error'}`);
        }
    }

    throw new Error('Sora video generation timed out');
}

/**
 * Mock result for demo when API key is missing
 */
function mockSoraResult(prompt: string): SoraVideoResult {
    return {
        id: `mock_sora_${Date.now()}`,
        status: 'completed',
        url: 'https://cdn.openai.com/sora/videos/miko.mp4' // Placeholder demo video
    };
}

// ============================================
// Tool Definition
// ============================================

export const SORA_VIDEO_TOOL_DEFINITION = {
    name: 'generate_sora_video',
    description: '使用 Sora 2 模型生成短视频。需要提供详细的视频描述和可选的参考图。',
    parameters: {
        type: 'object',
        properties: {
            prompt: { type: 'string', description: '视频生成的详细提示词 (英文)' },
            preview_image: { type: 'string', description: '参考图 ID 或 URL' }
        },
        required: ['prompt']
    }
};
