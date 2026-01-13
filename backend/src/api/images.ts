// @ts-nocheck
/**
 * Image Upload API
 * Multipart file upload for chat images
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createLogger } from '../lib/logger.js';
import fs from 'fs/promises';
import path from 'path';
import { nanoid } from 'nanoid';

const logger = createLogger('api:images');

// ============================================
// Constants
// ============================================

const MAX_FILES = 10;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per file

// ============================================
// Routes
// ============================================

export async function imageUploadRoutes(fastify: FastifyInstance) {

    /**
     * Upload images (multipart/form-data)
     * POST /api/images/upload
     * 
     * Request: multipart/form-data with field "files" containing multiple images
     * Response: { success: true, urls: string[] }
     */
    fastify.post('/upload', {
        preHandler: [fastify.authenticate],
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const userId = request.user.id;
        const uploadedUrls: string[] = [];

        try {
            // Get uploads directory
            const uploadsDir = process.env.NODE_ENV === 'production'
                ? '/app/uploads'
                : path.join(process.cwd(), 'public/uploads');
            const uploadDir = path.join(uploadsDir, 'images');

            // Ensure directory exists
            await fs.mkdir(uploadDir, { recursive: true });

            // Process multipart files
            const parts = request.parts();
            let fileCount = 0;

            for await (const part of parts) {
                if (part.type === 'file') {
                    if (fileCount >= MAX_FILES) {
                        logger.warn('Too many files', { userId, maxFiles: MAX_FILES });
                        break;
                    }

                    // Validate file type
                    const mimeType = part.mimetype;
                    if (!mimeType.startsWith('image/')) {
                        logger.warn('Invalid file type', { userId, mimeType });
                        continue;
                    }

                    // Read file buffer
                    const chunks: Buffer[] = [];
                    let size = 0;
                    for await (const chunk of part.file) {
                        size += chunk.length;
                        if (size > MAX_FILE_SIZE) {
                            logger.warn('File too large', { userId, size, maxSize: MAX_FILE_SIZE });
                            break;
                        }
                        chunks.push(chunk);
                    }

                    if (size > MAX_FILE_SIZE) {
                        continue; // Skip oversized file
                    }

                    const buffer = Buffer.concat(chunks);

                    // Generate unique filename
                    const extension = mimeType.split('/')[1] || 'jpg';
                    const filename = `${nanoid()}.${extension}`;
                    const filePath = path.join(uploadDir, filename);

                    // Save file
                    await fs.writeFile(filePath, buffer);

                    // Generate URL
                    const url = `/api/chat/assets/${filename}`;
                    uploadedUrls.push(url);

                    logger.info('Image uploaded', { userId, filename, size });
                    fileCount++;
                }
            }

            if (uploadedUrls.length === 0) {
                return reply.status(400).send({
                    success: false,
                    error: 'No valid images uploaded',
                });
            }

            return reply.send({
                success: true,
                urls: uploadedUrls,
            });

        } catch (error: any) {
            logger.error('Image upload failed', { userId, error: error.message });
            return reply.status(500).send({
                success: false,
                error: 'Upload failed',
            });
        }
    });
}
