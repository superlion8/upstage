/**
 * Agent Types
 */

export interface AgentInput {
    userId: string;
    conversationId: string;
    message: {
        text?: string;
        images?: Array<{ id: string; data: string; mimeType: string }>;
    };
    conversationHistory: ConversationMessage[];
}

export interface ConversationMessage {
    role: 'user' | 'assistant';
    content: {
        text?: string;
        images?: Array<{ id: string; data: string; mimeType: string }>;
        generatedImages?: Array<{ id: string; url: string }>;
    };
}

export interface StreamEvent {
    type: 'thinking' | 'tool_start' | 'tool_result' | 'text_delta' | 'image' | 'done' | 'error';
    data: any;
}
