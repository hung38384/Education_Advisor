import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { reviewService } from '@/services/reviewService';

export const REVIEW_LATEST_QUERY_KEY = ['review', 'latest'] as const;

export function useLatestReview() {
    return useQuery({
        queryKey: REVIEW_LATEST_QUERY_KEY,
        queryFn: reviewService.getLatest,
    });
}

export function useRunReview() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: () => reviewService.run(),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: REVIEW_LATEST_QUERY_KEY });
        },
    });
}
