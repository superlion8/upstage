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
    static getRegistryPrompt(imageRegistry: { id: string, desc: string }[]): string {
        if (imageRegistry.length === 0) return '';

        const lines = imageRegistry.map((item, index) => {
            const num = index + 1;
            return `[图${num}] ID: ${item.id} (${item.desc})`;
        });

        return `\n\n## 当前会话图片资产注册表 (Image Registry)
如果你需要引用图片，请使用 Registry 中的 ID。
用户提到的“图1”、“图2”通常对应下方列表的顺序：
${lines.map(line => `- ${line}`).join('\n')}

注意：旧历史中的图片数据已被剥离以节省 token，请务必根据 ID 引用。`;
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
        imageRegistry: { id: string, desc: string }[]
    ): any[] {
        const history: any[] = [];
        const FULL_CONTEXT_WINDOW = 6; // 最近 6 条消息（约 3 轮对话）保留完整数据

        const historyMessages = input.conversationHistory;
        const totalCount = historyMessages.length;

        for (let i = 0; i < totalCount; i++) {
            const msg = historyMessages[i];
            const isWithinWindow = (totalCount - i) <= FULL_CONTEXT_WINDOW;
            const parts: any[] = [];

            // 1. 处理上传图片 (images 数组)
            const allImages = [...(msg.content.images || []), ...(msg.content.generatedImages || [])];

            if (allImages.length > 0) {
                for (const img of allImages) {
                    if (img.id) {
                        // 同步到 context，方便工具使用 (如果有 data)
                        if ((img as any).data) {
                            imageContext[img.id] = (img as any).data;
                        } else if ((img as any).url) {
                            imageContext[img.id] = (img as any).url;
                        }

                        // 注册 ID
                        const isGenerated = !!(img as any).url;
                        const desc = isGenerated ? '生成结果' : '用户上传';
                        if (!imageRegistry.find(r => r.id === img.id)) {
                            imageRegistry.push({ id: img.id, desc });
                        }

                        // 如果在窗口内且有 base64 数据，则放入 history.parts 以便模型直观看到
                        const hasData = (img as any).data || ((img as any).url && (img as any).url.startsWith('data:'));
                        if (isWithinWindow && hasData) {
                            const rawData = (img as any).data || (img as any).url;
                            const base64Data = rawData.replace(/^data:image\/\w+;base64,/, '');
                            parts.push({
                                inlineData: {
                                    mimeType: (img as any).mimeType || 'image/jpeg',
                                    data: base64Data,
                                },
                            });
                        }

                        // 始终添加一个文本标记，方便模型在 context 中对齐 ID
                        parts.push({ text: `[图片 ID: ${img.id} (${desc})]` });
                    }
                }
            }

            // 2. 处理文本内容
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
        imageRegistry: { id: string, desc: string }[]
    ): any[] {
        const parts: any[] = [];

        if (input.message.images) {
            for (let i = 0; i < input.message.images.length; i++) {
                const img = input.message.images[i];
                const imageId = img.id || `image_${Date.now()}_${i}`;
                imageContext[imageId] = (img as any).data || (img as any).url;

                if (!imageRegistry.find(r => r.id === imageId)) {
                    imageRegistry.push({ id: imageId, desc: '当前上传' });
                }

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
