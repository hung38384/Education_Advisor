export const ADMISSION_METHOD_TYPES = ['thpt', 'transcript', 'competency', 'direct'] as const;
export type AdmissionMethodType = (typeof ADMISSION_METHOD_TYPES)[number];

export const ADMISSION_CHANCE_LEVELS = ['high', 'medium', 'challenging'] as const;
export type AdmissionChanceLevel = (typeof ADMISSION_CHANCE_LEVELS)[number];

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

export interface AdmissionFavoriteSnapshot {
    schoolName: string;
    majorName: string;
    methodName: string;
    requiredAverage: number;
    description: string;
}

export interface AdmissionCartItem {
    id: number;
    userId: number;
    schoolId: string;
    majorId: string;
    methodId: string;
    snapshot: AdmissionFavoriteSnapshot | null;
    createdAt: string;
}

export interface CreateAdmissionCartItemInput {
    schoolId: string;
    majorId: string;
    methodId: string;
    snapshot: AdmissionFavoriteSnapshot;
}

export interface AdmissionProfileSnapshot {
    fullName: string | null;
    averageGrade: number | null;
    favoriteSubjects: string[];
    targetMajor: string | null;
    targetUniversity: string | null;
}

export interface AdmissionEvaluation {
    chanceScore: number;
    chanceLevel: AdmissionChanceLevel;
    comment: string;
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
    evaluation: AdmissionEvaluation;
    orientation: string;
    studyPlan: string[];
}

export interface AdmissionCartResult {
    profile: AdmissionProfileSnapshot;
    items: AdmissionCartViewItem[];
}

export interface AdmissionCartItemResult {
    item: AdmissionCartViewItem;
}
