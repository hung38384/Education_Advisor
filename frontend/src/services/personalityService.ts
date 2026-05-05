import api from '@/config/axios';
import { API_ROUTES } from '@/config/api-collection';

export type PersonalityAnswer = 'A' | 'B';

export interface PersonalityQuestion {
    id: string;
    prompt: string;
    dimension: 'E/I' | 'S/N' | 'T/F' | 'J/P';
    optionA: string;
    optionB: string;
}

export interface PersonalityScores {
    E: number;
    I: number;
    S: number;
    N: number;
    T: number;
    F: number;
    J: number;
    P: number;
}

export interface PersonalitySubmission {
    id: number;
    userId: number;
    answers: Record<string, PersonalityAnswer>;
    mbtiType: string;
    scores: PersonalityScores;
    createdAt: string;
}

export interface QuestionsResponse {
    questions: PersonalityQuestion[];
}

export interface SubmitPersonalityPayload {
    answers: Record<string, PersonalityAnswer>;
}

export interface SubmitPersonalityResponse {
    submission: PersonalitySubmission;
}

export interface LatestPersonalityResponse {
    submission: PersonalitySubmission | null;
}

export const personalityService = {
    async getQuestions(): Promise<QuestionsResponse> {
        const response = await api.get<QuestionsResponse>(API_ROUTES.PERSONALITY.QUESTIONS);
        return response.data;
    },

    async submit(payload: SubmitPersonalityPayload): Promise<SubmitPersonalityResponse> {
        const response = await api.post<SubmitPersonalityResponse>(API_ROUTES.PERSONALITY.SUBMIT, payload);
        return response.data;
    },

    async getLatest(): Promise<LatestPersonalityResponse> {
        const response = await api.get<LatestPersonalityResponse>(API_ROUTES.PERSONALITY.LATEST);
        return response.data;
    },
};
