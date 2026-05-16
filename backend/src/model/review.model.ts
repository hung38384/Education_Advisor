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
