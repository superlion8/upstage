/**
 * Agent Memory Management
 * Handles conversation history, image registry, and context optimization (base64 stripping)
 */

import { AgentInput } from './types.js';

export class MemoryManager {
    /**
     * 提取并输出 thinking
     */
    static extractThinking(parts: any[]): string | null {
        const thinkingTexts: string[] = [];

        for (const part of parts) {
            if (part.thought === true && part.text && typeof part.text === 'string') {
                thinkingTexts.push(part.text);
            }
        }

        return thinkingTexts.join('\n').trim() || null;
    }

    /**
     * 将文本拆分为块，用于流式模拟
     */
    static splitIntoChunks(text: string, chunkSize: number): string[] {
        const chunks: string[] = [];
        for (let i = 0; i < text.length; i += chunkSize) {
            chunks.push(text.slice(i, i + chunkSize));
        }
        return chunks;
    }

    /**
     * 构建图片注册表描述文本，用于注入 System Prompt
     */
    static getRegistryPrompt(imageRegistry: string[]): string {
        if (imageRegistry.length === 0) return '';

        return `\n\n## 当前会话图片资产注册表 (Image Registry)\n如果你需要引用图片，请使用以下 ID：\n${imageRegistry.map(item => `- ${item}`).join('\n')}\n\n注意：旧历史中的图片数据已被剥离以节省 token，请优先根据 ID 引用。`;
    }

    /**
     * 过滤工具结果中的 base64 图片数据，避免发送给模型时 token 超限
     */
    static sanitizeToolResult(result: any): any {
        if (!result) return result;

        // 如果有 images 数组，移除 base64 data 字段
        if (result.images && Array.isArray(result.images)) {
            return {
                ...result,
                images: result.images.map((img: any) => ({
                    id: img.id,
                    url: img.url ? `[图片已生成: ${img.id}]` : undefined,
                    // 不包含 data 字段
                })),
                message: result.message || `已生成 ${result.images.length} 张图片`,
            };
        }

        return result;
    }

    /**
     * 构建初始历史消息（不包括当前消息）
     * 实现滑动窗口和 Base64 剥离
     */
    static buildInitialHistory(
        input: AgentInput,
        imageContext: Record<string, string>,
        imageRegistry: string[]
    ): any[] {
        const history: any[] = [];
        const FULL_CONTEXT_WINDOW = 6; // 最近 6 条消息（约 3 轮对话）保留完整数据

        const historyMessages = input.conversationHistory;
        const totalCount = historyMessages.length;

        for (let i = 0; i < totalCount; i++) {
            const msg = historyMessages[i];
            const isWithinWindow = (totalCount - i) <= FULL_CONTEXT_WINDOW;
            const parts: any[] = [];

            // 1. 处理用户上传图片
            if (msg.content.images) {
                for (const img of msg.content.images) {
                    if (img.id && img.data) {
                        imageContext[img.id] = img.data;

                        const desc = `[用户上传] ID: ${img.id}`;
                        if (!imageRegistry.includes(desc)) imageRegistry.push(desc);

                        if (isWithinWindow) {
                            const base64Data = img.data.replace(/^data:image\/\w+;base64,/, '');
                            parts.push({
                                inlineData: {
                                    mimeType: img.mimeType || 'image/jpeg',
                                    data: base64Data,
                                },
                            });
                        } else {
                            parts.push({ text: `[已缓存图片: ${img.id}]` });
                        }
                    }
                }
            }

            // 2. 处理已生成的图片（同步到注册表，用于引用）
            if (msg.content.generatedImages) {
                for (const img of msg.content.generatedImages) {
                    if (img.id && img.url) {
                        if (img.url.startsWith('data:')) {
                            imageContext[img.id] = img.url;
                        }
                        const desc = `[生成结果] ID: ${img.id}`;
                        if (!imageRegistry.includes(desc)) imageRegistry.push(desc);
                    }
                }
            }

            // 3. 处理文本
            if (msg.content.text) {
                parts.push({ text: msg.content.text });
            }

            if (parts.length > 0) {
                history.push({
                    role: msg.role === 'user' ? 'user' : 'model',
                    parts,
                });
            }
        }

        return history;
    }

    /**
     * 构建当前消息的 parts
     */
    static buildCurrentMessageParts(
        input: AgentInput,
        imageContext: Record<string, string>,
        imageRegistry: string[]
    ): any[] {
        const parts: any[] = [];

        if (input.message.images) {
            for (let i = 0; i < input.message.images.length; i++) {
                const img = input.message.images[i];
                const imageId = img.id || `image_${Date.now()}_${i}`;
                imageContext[imageId] = img.data;

                const desc = `[当前上传] ID: ${imageId}`;
                if (!imageRegistry.includes(desc)) imageRegistry.push(desc);

                const base64Data = img.data.replace(/^data:image\/\w+;base64,/, '');

                parts.push({
                    inlineData: {
                        mimeType: img.mimeType || 'image/jpeg',
                        data: base64Data,
                    },
                });
            }
        }

        if (input.message.text) {
            parts.push({ text: input.message.text });
        }

        return parts;
    }
}
