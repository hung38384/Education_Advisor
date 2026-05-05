import api from '@/config/axios';
import { API_ROUTES } from '@/config/api-collection';

export interface StudentProfile {
    id: number;
    userId: number;
    fullName: string;
    phone: string | null;
    gender: string | null;
    dateOfBirth: string | null;
    city: string | null;
    schoolName: string | null;
    grade10: number | null;
    grade11: number | null;
    grade12: number | null;
    favoriteSubjects: string[];
    targetMajor: string | null;
    targetUniversity: string | null;
    bio: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface UpsertProfilePayload {
    fullName: string;
    phone?: string | null;
    gender?: string | null;
    dateOfBirth?: string | null;
    city?: string | null;
    schoolName?: string | null;
    grade10?: number | null;
    grade11?: number | null;
    grade12?: number | null;
    favoriteSubjects?: string[];
    targetMajor?: string | null;
    targetUniversity?: string | null;
    bio?: string | null;
}

export interface ProfileResponse {
    profile: StudentProfile | null;
}

export const profileService = {
    async getMyProfile(): Promise<ProfileResponse> {
        const response = await api.get<ProfileResponse>(API_ROUTES.PROFILE.ME);
        return response.data;
    },

    async upsertMyProfile(payload: UpsertProfilePayload): Promise<ProfileResponse> {
        const response = await api.put<ProfileResponse>(API_ROUTES.PROFILE.ME, payload);
        return response.data;
    },
};
