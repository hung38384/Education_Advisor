import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { profileService, type UpsertProfilePayload } from '@/services/profileService';

export const PROFILE_QUERY_KEY = ['profile', 'me'] as const;

export function useMyProfile() {
    return useQuery({
        queryKey: PROFILE_QUERY_KEY,
        queryFn: profileService.getMyProfile,
    });
}

export function useUpsertMyProfile() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (payload: UpsertProfilePayload) => profileService.upsertMyProfile(payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
        },
    });
}
