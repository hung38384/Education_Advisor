import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { personalityService, type SubmitPersonalityPayload } from '@/services/personalityService';

export const PERSONALITY_QUESTIONS_QUERY_KEY = ['personality', 'questions'] as const;
export const PERSONALITY_LATEST_QUERY_KEY = ['personality', 'latest'] as const;

export function usePersonalityQuestions() {
    return useQuery({
        queryKey: PERSONALITY_QUESTIONS_QUERY_KEY,
        queryFn: personalityService.getQuestions,
    });
}

export function useLatestPersonality() {
    return useQuery({
        queryKey: PERSONALITY_LATEST_QUERY_KEY,
        queryFn: personalityService.getLatest,
    });
}

export function useSubmitPersonality() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (payload: SubmitPersonalityPayload) => personalityService.submit(payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: PERSONALITY_LATEST_QUERY_KEY });
        },
    });
}
