export const QA_MESSAGE_ROLES = ['user', 'assistant'] as const;
export type QAMessageRole = (typeof QA_MESSAGE_ROLES)[number];

export interface QAMessage {
    id: number;
    userId: number;
    conversationId: number;
    role: QAMessageRole;
    message: string;
    metadata: Record<string, unknown> | null;
    createdAt: string;
}

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
