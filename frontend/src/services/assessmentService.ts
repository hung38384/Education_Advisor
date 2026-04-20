import api from '@/config/axios';
import { API_ROUTES } from '@/config/api-collection';

export interface AssessmentRecommendation {
    name: string;
    score: number;
    reason: string;
}

export interface AssessmentResult {
    id: number;
    userId: number;
    overallScore: number;
    summary: string;
    recommendations: AssessmentRecommendation[];
    inputSnapshot: Record<string, unknown>;
    createdAt: string;
}

export interface AssessmentResponse {
    result: AssessmentResult | null;
}

export const assessmentService = {
    async run(): Promise<AssessmentResponse> {
        const response = await api.post<AssessmentResponse>(API_ROUTES.ASSESSMENT.RUN);
        return response.data;
    },

    async getLatest(): Promise<AssessmentResponse> {
        const response = await api.get<AssessmentResponse>(API_ROUTES.ASSESSMENT.LATEST);
        return response.data;
    },
};
