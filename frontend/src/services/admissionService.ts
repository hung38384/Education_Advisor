import api from '@/config/axios';
import { API_ROUTES } from '@/config/api-collection';
import { replacePathParams } from '@/lib/utils';

export type AdmissionMethodType = 'thpt' | 'transcript' | 'competency' | 'direct';
export type AdmissionChanceLevel = 'high' | 'medium' | 'challenging';
export type AdmissionMajorField = 'engineering' | 'business' | 'health' | 'social';

export interface AdmissionSearchParams {
    q?: string;
    year?: number;
    methodTag?: string;
    universityCode?: string;
    minScore?: number;
    maxScore?: number;
    page?: number;
    pageSize?: number;
}

export interface AdmissionCatalogMethod {
    methodTag: string;
    methodAlias: string | null;
    subjectCombinations: string[];
    yearlyScores: Array<{ year: number; score: number }>;
    shortComment: string;
}

export interface AdmissionCatalogItem {
    universityCode: string;
    universityName: string | null;
    majorCode: string;
    majorName: string;
    methods: AdmissionCatalogMethod[];
}

export interface AdmissionCatalogResponse {
    items: AdmissionCatalogItem[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    filters: {
        years: number[];
        methodTags: string[];
        universities: Array<{ code: string; name?: string | null }>;
    };
}

export interface AdmissionProfileSnapshot {
    fullName: string | null;
    averageGrade: number | null;
    favoriteSubjects: string[];
    targetMajor: string | null;
    targetUniversity: string | null;
}

export interface AdmissionCartViewItem {
    id: number;
    createdAt: string;
    school: {
        id: string;
        name: string;
        city: string;
    };
    major: {
        id: string;
        name: string;
        field: AdmissionMajorField;
    };
    method: {
        id: string;
        name: string;
        type: AdmissionMethodType;
        requiredAverage: number;
        description: string;
    };
    evaluation: {
        chanceScore: number;
        chanceLevel: AdmissionChanceLevel;
        comment: string;
    };
    orientation: string;
    studyPlan: string[];
}

export interface AdmissionCartResponse {
    profile: AdmissionProfileSnapshot;
    items: AdmissionCartViewItem[];
}

export interface CreateAdmissionCartPayload {
    schoolId: string;
    majorId: string;
    methodId: string;
    snapshot: {
        schoolName: string;
        majorName: string;
        methodName: string;
        requiredAverage: number;
        description: string;
    };
}

export interface AdmissionCartItemResponse {
    item: AdmissionCartViewItem;
}

export const admissionService = {
    async listCatalog(params: AdmissionSearchParams): Promise<AdmissionCatalogResponse> {
        const response = await api.get<AdmissionCatalogResponse>(API_ROUTES.ADMISSIONS.CATALOG, { params });
        return response.data;
    },

    async listCart(): Promise<AdmissionCartResponse> {
        const response = await api.get<AdmissionCartResponse>(API_ROUTES.ADMISSIONS.FAVORITES_LIST);
        return response.data;
    },

    async addToCart(payload: CreateAdmissionCartPayload): Promise<AdmissionCartItemResponse> {
        const response = await api.post<AdmissionCartItemResponse>(API_ROUTES.ADMISSIONS.FAVORITES_CREATE, payload);
        return response.data;
    },

    async removeFromCart(id: number): Promise<{ message: string }> {
        const route = replacePathParams(API_ROUTES.ADMISSIONS.FAVORITES_DELETE, { id });
        const response = await api.delete<{ message: string }>(route);
        return response.data;
    },
};
