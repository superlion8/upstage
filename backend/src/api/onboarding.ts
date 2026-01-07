import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { runOnboardingWorkflow, OnboardingInput } from '../agent/onboarding-workflow.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('api:onboarding');

export default async function onboardingRoutes(fastify: FastifyInstance) {
    // Handle multipart form data upload
    fastify.post('/onboarding', async (request: FastifyRequest, reply: FastifyReply) => {
        const userId = (request.user as any)?.id || 'demo-user';

        try {
            // Parse multipart form data
            const parts = request.parts();

            let webLink = '';
            let insLink = '';
            let videoUrl = '';
            let productImageData: Buffer | null = null;
            let productImageMimeType = 'image/jpeg';

            for await (const part of parts) {
                if (part.type === 'field') {
                    const value = part.value as string;
                    if (part.fieldname === 'webLink') webLink = value;
                    if (part.fieldname === 'insLink') insLink = value;
                    if (part.fieldname === 'videoUrl') videoUrl = value;
                } else if (part.type === 'file' && part.fieldname === 'productImage') {
                    const chunks: Buffer[] = [];
                    for await (const chunk of part.file) {
                        chunks.push(chunk);
                    }
                    productImageData = Buffer.concat(chunks);
                    productImageMimeType = part.mimetype || 'image/jpeg';
                }
            }

            logger.info('Received onboarding request (multipart)', {
                userId,
                webLink,
                insLink,
                hasProductImage: !!productImageData,
                imageSize: productImageData ? `${Math.round(productImageData.length / 1024)} KB` : 'none'
            });

            if (!productImageData) {
                return reply.status(400).send({
                    success: false,
                    message: 'Missing required field: productImage'
                });
            }

            // Convert to base64 for the workflow (internal use only)
            const base64Data = productImageData.toString('base64');
            const imageId = `product_${Date.now()}`;

            const input: OnboardingInput = {
                userId,
                conversationId: `onboarding_${Date.now()}`,
                webLink,
                insLink,
                videoUrl,
                productImage: {
                    id: imageId,
                    data: base64Data,
                    mimeType: productImageMimeType
                },
            };

            const result = await runOnboardingWorkflow(input);

            return {
                success: true,
                data: result
            };
        } catch (error: any) {
            logger.error('Onboarding workflow failed', { error: error.message });
            return reply.status(500).send({
                success: false,
                message: error.message
            });
        }
    });
}
