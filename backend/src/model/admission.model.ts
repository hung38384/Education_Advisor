export const ADMISSION_METHOD_TYPES = ['thpt', 'transcript', 'competency', 'direct'] as const;
export type AdmissionMethodType = (typeof ADMISSION_METHOD_TYPES)[number];

export const ADMISSION_CHANCE_LEVELS = ['high', 'medium', 'challenging'] as const;
export type AdmissionChanceLevel = (typeof ADMISSION_CHANCE_LEVELS)[number];

export type AdmissionMajorField = 'engineering' | 'business' | 'health' | 'social';

export interface AdmissionMethod {
    id: string;
    name: string;
    type: AdmissionMethodType;
    requiredAverage: number;
    difficulty: number;
    description: string;
}

export interface AdmissionMajor {
    id: string;
    name: string;
    field: AdmissionMajorField;
    admissionMethods: AdmissionMethod[];
}

export interface AdmissionSchool {
    id: string;
    name: string;
    city: string;
    majors: AdmissionMajor[];
}

export interface AdmissionCatalogResult {
    schools: AdmissionSchool[];
}

export interface AdmissionCartItem {
    id: number;
    userId: number;
    schoolId: string;
    majorId: string;
    methodId: string;
    createdAt: string;
}

export interface CreateAdmissionCartItemInput {
    schoolId: string;
    majorId: string;
    methodId: string;
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
