export interface ReviewRecommendation {
    name: string;
    score: number;
    reason: string;
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
