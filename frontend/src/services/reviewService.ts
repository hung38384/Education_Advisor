import api from '@/config/axios';
import { API_ROUTES } from '@/config/api-collection';

export interface ReviewFeaturedMethod {
    methodTag: string;
    methodAlias: string | null;
    latestYear: number | null;
    latestScore: number | null;
    shortComment: string;
}

export interface ReviewRecommendation {
    name: string;
    score: number;
    reason: string;
    universityCode: string;
    universityName: string | null;
    majorCode: string;
    majorName: string;
    featuredMethod: ReviewFeaturedMethod | null;
}

export interface ReviewResult {
    id: number;
    userId: number;
    overallScore: number;
    summary: string;
    recommendations: ReviewRecommendation[];
    inputSnapshot: Record<string, unknown>;
    createdAt: string;
}

export interface ReviewResponse {
    result: ReviewResult | null;
}

export const reviewService = {
    async run(): Promise<ReviewResponse> {
        const response = await api.post<ReviewResponse>(API_ROUTES.REVIEW.RUN);
        return response.data;
    },

    async getLatest(): Promise<ReviewResponse> {
        const response = await api.get<ReviewResponse>(API_ROUTES.REVIEW.LATEST);
        return response.data;
    },
};
