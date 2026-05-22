import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AskQAInput, qaService } from '@/services/qaService';

export const QA_CONVERSATIONS_QUERY_KEY = ['qa', 'conversations'] as const;
export const QA_MESSAGES_QUERY_KEY = (conversationId?: number) =>
    ['qa', 'messages', conversationId ?? 'none'] as const;

export function useQaConversations() {
    return useQuery({
        queryKey: QA_CONVERSATIONS_QUERY_KEY,
        queryFn: qaService.listConversations,
    });
}

export function useQaMessages(conversationId?: number) {
    return useQuery({
        queryKey: QA_MESSAGES_QUERY_KEY(conversationId),
        queryFn: () => qaService.listMessages(conversationId),
        enabled: typeof conversationId === 'number' && conversationId > 0,
    });
}

export function useCreateConversation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (title?: string) => qaService.createConversation(title),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: QA_CONVERSATIONS_QUERY_KEY });
        },
    });
}

export function useDeleteConversation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (conversationId: number) => qaService.deleteConversation(conversationId),
        onSuccess: (_, conversationId) => {
            queryClient.invalidateQueries({ queryKey: QA_CONVERSATIONS_QUERY_KEY });
            queryClient.invalidateQueries({ queryKey: QA_MESSAGES_QUERY_KEY(conversationId) });
        },
    });
}

export function useAskQuestion() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (input: AskQAInput) => qaService.ask(input),
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: QA_CONVERSATIONS_QUERY_KEY });
            queryClient.invalidateQueries({ queryKey: QA_MESSAGES_QUERY_KEY(result.conversationId) });
        },
    });
}

export function useAdviseQa() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: qaService.advise,
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: QA_CONVERSATIONS_QUERY_KEY });
            queryClient.invalidateQueries({ queryKey: QA_MESSAGES_QUERY_KEY(data.conversationId) });
        },
    });
}
