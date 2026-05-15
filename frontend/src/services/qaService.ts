import api from '@/config/axios';
import { API_ROUTES } from '@/config/api-collection';

export type QAMessageRole = 'user' | 'assistant';

export interface QAConversation {
    id: number;
    userId: number;
    title: string;
    createdAt: string;
    updatedAt: string;
    lastMessage: string | null;
    lastMessageAt: string | null;
    messageCount: number;
}

export interface AIServiceMetadata {
    provider?: string;
    model?: string;
    latencyMs?: number;
    toolsUsed?: string[];
    domain?: string;
    mode?: string;
    scoreRecoveryApplied?: boolean;
    unavailableReason?: string;
}

export interface QAMessageMetadata {
    strategy?: string;
    fallbackReason?: string;
    ai?: AIServiceMetadata;
    [key: string]: unknown;
}

export interface QAMessage {
    id: number;
    userId: number;
    conversationId: number;
    role: QAMessageRole;
    message: string;
    metadata: QAMessageMetadata | null;
    createdAt: string;
}

export interface QAConversationsResponse {
    conversations: QAConversation[];
}

export interface QAHistoryResponse {
    conversationId: number | null;
    messages: QAMessage[];
}

export interface CreateQAConversationResponse {
    conversation: QAConversation;
}

export interface DeleteQAConversationResponse {
    message: string;
}

export interface AskQAResponse {
    answer: string;
    conversationId: number;
    userMessage: QAMessage;
    assistantMessage: QAMessage;
}

export interface AskQAInput {
    question: string;
    conversationId?: number;
}

export type AskQuestionResponse = AskQAResponse;

export interface AdvisePayload {
    conversationId?: number;
    universityCode: string;
    universityName?: string | null;
    majorCode: string;
    majorName: string;
    methodTag?: string | null;
    targetYear?: number | null;
}

function buildDeleteConversationPath(conversationId: number): string {
    return API_ROUTES.QA.CONVERSATION_DELETE.replace('{id}', String(conversationId));
}

export const qaService = {
    async listConversations(): Promise<QAConversationsResponse> {
        const response = await api.get<QAConversationsResponse>(API_ROUTES.QA.CONVERSATIONS);
        return response.data;
    },

    async createConversation(title?: string): Promise<CreateQAConversationResponse> {
        const payload = title && title.trim().length > 0
            ? { title: title.trim() }
            : {};
        const response = await api.post<CreateQAConversationResponse>(API_ROUTES.QA.CONVERSATIONS, payload);
        return response.data;
    },

    async deleteConversation(conversationId: number): Promise<DeleteQAConversationResponse> {
        const response = await api.delete<DeleteQAConversationResponse>(buildDeleteConversationPath(conversationId));
        return response.data;
    },

    async listMessages(conversationId?: number): Promise<QAHistoryResponse> {
        const query = typeof conversationId === 'number' && Number.isInteger(conversationId) && conversationId > 0
            ? `?conversationId=${conversationId}`
            : '';
        const response = await api.get<QAHistoryResponse>(`${API_ROUTES.QA.MESSAGES}${query}`);
        return response.data;
    },

    async ask(input: AskQAInput): Promise<AskQAResponse> {
        const response = await api.post<AskQAResponse>(API_ROUTES.QA.ASK, {
            question: input.question,
            ...(typeof input.conversationId === 'number' ? { conversationId: input.conversationId } : {}),
        });
        return response.data;
    },

    async advise(payload: AdvisePayload): Promise<AskQuestionResponse> {
        const response = await api.post<AskQuestionResponse>('/qa/advise', payload);
        return response.data;
    },
};
