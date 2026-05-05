import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { assessmentService } from '@/services/assessmentService';

export const ASSESSMENT_LATEST_QUERY_KEY = ['assessment', 'latest'] as const;

export function useLatestAssessment() {
    return useQuery({
        queryKey: ASSESSMENT_LATEST_QUERY_KEY,
        queryFn: assessmentService.getLatest,
    });
}

export function useRunAssessment() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: () => assessmentService.run(),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ASSESSMENT_LATEST_QUERY_KEY });
        },
    });
}
