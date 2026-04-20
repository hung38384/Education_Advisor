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
