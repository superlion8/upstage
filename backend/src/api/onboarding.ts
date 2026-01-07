import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { runOnboardingWorkflow, OnboardingInput } from '../agent/onboarding-workflow.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('api:onboarding');

export default async function onboardingRoutes(fastify: FastifyInstance) {
    fastify.post('/onboarding', async (request: FastifyRequest, reply: FastifyReply) => {
        const { webLink, insLink, videoUrl, productImage, conversationId } = request.body as any;
        const userId = (request.user as any)?.id || 'demo-user';

        logger.info('Received onboarding request', { userId, webLink, insLink });

        try {
            const input: OnboardingInput = {
                userId,
                conversationId: conversationId || `onboarding_${Date.now()}`,
                webLink,
                insLink,
                videoUrl,
                productImage,
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
