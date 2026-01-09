/**
 * Centralized Image Store
 * 
 * All images (uploaded, generated, from history) are registered here.
 * All tools get images from here using any reference format.
 */

import { randomUUID } from 'crypto';

export interface StoredImage {
    id: string;              // Canonical ID (e.g., "img_abc123")
    data: string;            // Base64 data or URL
    type: 'uploaded' | 'generated' | 'reference';
    description?: string;    // Human readable for Claude
    aliases: string[];       // All known references to this image
    createdAt: Date;
}

export class ImageStore {
    private images = new Map<string, StoredImage>();
    private aliasIndex = new Map<string, string>(); // alias -> canonicalId

    /**
     * Register an image with automatic ID generation and alias indexing
     */
    register(options: {
        id?: string;
        data: string;
        type: 'uploaded' | 'generated' | 'reference';
        description?: string;
        aliases?: string[];
    }): string {
        const canonicalId = options.id || `img_${randomUUID().slice(0, 8)}`;

        // Check if already registered
        if (this.images.has(canonicalId)) {
            // Update aliases if new ones provided
            const existing = this.images.get(canonicalId)!;
            if (options.aliases) {
                for (const alias of options.aliases) {
                    if (!existing.aliases.includes(alias)) {
                        existing.aliases.push(alias);
                        this.aliasIndex.set(this.normalizeRef(alias), canonicalId);
                    }
                }
            }
            return canonicalId;
        }

        const allAliases = [canonicalId, ...(options.aliases || [])];

        const stored: StoredImage = {
            id: canonicalId,
            data: options.data,
            type: options.type,
            description: options.description,
            aliases: allAliases,
            createdAt: new Date(),
        };

        this.images.set(canonicalId, stored);

        // Index by all aliases (normalized) for fast lookup
        for (const alias of allAliases) {
            this.aliasIndex.set(this.normalizeRef(alias), canonicalId);
        }

        return canonicalId;
    }

    /**
     * Get image by ANY reference format
     * Returns undefined if not found
     */
    get(ref: string): StoredImage | undefined {
        if (!ref) return undefined;

        // Try direct lookup
        if (this.images.has(ref)) {
            return this.images.get(ref);
        }

        // Try alias lookup with normalization
        const normalized = this.normalizeRef(ref);
        const canonicalId = this.aliasIndex.get(normalized);
        if (canonicalId) {
            return this.images.get(canonicalId);
        }

        // Try variations
        const variations = this.getVariations(ref);
        for (const variant of variations) {
            const id = this.aliasIndex.get(variant);
            if (id) return this.images.get(id);
        }

        return undefined;
    }

    /**
     * Get image data directly (convenience method)
     */
    getData(ref: string): string | undefined {
        return this.get(ref)?.data;
    }

    /**
     * Check if image exists
     */
    has(ref: string): boolean {
        return this.get(ref) !== undefined;
    }

    /**
     * Normalize any reference format to a standard form
     */
    private normalizeRef(ref: string): string {
        if (!ref) return '';

        // Handle /api/chat/assets/gen_xxx.png
        const apiMatch = ref.match(/\/api\/chat\/assets\/([^.]+)/);
        if (apiMatch) return apiMatch[1];

        // Handle full URLs with ID in filename
        const urlMatch = ref.match(/\/([^\/]+)\.(png|jpg|jpeg|webp)$/i);
        if (urlMatch) return urlMatch[1];

        // Handle data URLs - hash them for consistent lookup
        if (ref.startsWith('data:')) {
            return `data_${this.hashString(ref.slice(0, 100))}`;
        }

        return ref;
    }

    /**
     * Generate variations of a reference to try
     */
    private getVariations(ref: string): string[] {
        const variations: string[] = [ref];

        // If it looks like a number, try image_N format
        if (/^\d+$/.test(ref)) {
            variations.push(`image_${ref}`);
        }

        // If it starts with gen_, also try without
        if (ref.startsWith('gen_')) {
            variations.push(ref.slice(4));
        } else {
            variations.push(`gen_${ref}`);
        }

        // If it starts with img_, also try without
        if (ref.startsWith('img_')) {
            variations.push(ref.slice(4));
        }

        return variations;
    }

    /**
     * Simple hash for data URLs
     */
    private hashString(str: string): string {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }

    /**
     * Get prompt for Claude showing available images
     */
    getAvailableImagesPrompt(): string {
        if (this.images.size === 0) {
            return '## Available Images\nNo images currently available.';
        }

        const items = Array.from(this.images.values())
            .map(img => {
                const typeIcon = img.type === 'uploaded' ? '📤' : img.type === 'generated' ? '🎨' : '📎';
                const desc = img.description || img.type;
                return `- ${typeIcon} **${img.id}**: ${desc}`;
            })
            .join('\n');

        return `## Available Images (use these IDs to reference images)\n${items}`;
    }

    /**
     * Get all images as context for tools (backwards compatible)
     */
    getAllContext(): Record<string, string> {
        const context: Record<string, string> = {};

        for (const [id, img] of this.images) {
            context[id] = img.data;
            // Also index by all aliases
            for (const alias of img.aliases) {
                context[alias] = img.data;
                context[this.normalizeRef(alias)] = img.data;
            }
        }

        return context;
    }

    /**
     * Get count of stored images
     */
    get count(): number {
        return this.images.size;
    }

    /**
     * Clear all images (for new conversation)
     */
    clear(): void {
        this.images.clear();
        this.aliasIndex.clear();
    }

    /**
     * Get all image IDs
     */
    getAllIds(): string[] {
        return Array.from(this.images.keys());
    }
}

// Singleton instance for convenience
let globalStore: ImageStore | null = null;

export function getGlobalImageStore(): ImageStore {
    if (!globalStore) {
        globalStore = new ImageStore();
    }
    return globalStore;
}

export function createImageStore(): ImageStore {
    return new ImageStore();
}
