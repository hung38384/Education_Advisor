import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ADMISSION_CATALOG_QUERY_KEY } from '@/hooks/useAdmissions';
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
            queryClient.invalidateQueries({ queryKey: ADMISSION_CATALOG_QUERY_KEY });
        },
    });
}
