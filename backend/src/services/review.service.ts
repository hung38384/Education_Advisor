import { AIAdmissionsClient } from '../clients/ai-admissions.client';
import { AIPredictClient } from '../clients/ai-predict.client';
import { AdmissionCatalogItem, AdmissionCatalogMethod } from '../model/admission.model';
import { ReviewFeaturedMethod, ReviewRecommendation, ReviewResult } from '../model/review.model';
import { PersonalityRepository } from '../repository/personality.repository';
import { ReviewRepository } from '../repository/review.repository';
import { StudentProfileRepository } from '../repository/student-profile.repository';

export interface ReviewResultPayload {
    result: ReviewResult | null;
}

export class ReviewServiceError extends Error {
    constructor(
        message: string,
        public statusCode: number = 400
    ) {
        super(message);
        this.name = 'ReviewServiceError';
    }
}

function clampScore(value: number): number {
    return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeNameForLookup(name: string): string {
    return name.trim().toLowerCase();
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
    const result: string[] = [];
    const seen = new Set<string>();
    for (const value of values) {
        if (typeof value !== 'string') {
            continue;
        }

        const trimmed = value.trim();
        const key = normalizeNameForLookup(trimmed);
        if (!key || seen.has(key)) {
            continue;
        }

        seen.add(key);
        result.push(trimmed);
    }

    return result;
}

interface RankedCandidate {
    item: AdmissionCatalogItem;
    featuredMethod: ReviewFeaturedMethod | null;
    score: number;
    reason: string;
}

export class ReviewService {
    constructor(
        private reviewRepository: ReviewRepository,
        private profileRepository: StudentProfileRepository,
        private personalityRepository: PersonalityRepository,
        private admissionsClient: AIAdmissionsClient,
        private predictClient: AIPredictClient | null = null,
    ) { }

    getLatest(userId: number): ReviewResultPayload {
        const result = this.reviewRepository.findLatestByUserId(userId);
        if (!result) {
            return { result: null };
        }

        return { result };
    }

    async run(userId: number): Promise<ReviewResultPayload> {
        const profile = this.profileRepository.findByUserId(userId);
        if (!profile) {
            throw new ReviewServiceError('Cần cập nhật hồ sơ trước khi chạy đánh giá', 400);
        }

        const personality = this.personalityRepository.findLatestByUserId(userId);
        if (!personality) {
            throw new ReviewServiceError('Cần hoàn thành bài đánh giá tính cách trước khi chạy đánh giá', 400);
        }

        const academicScores: Record<string, number> = {};
        if (typeof profile.grade10 === 'number' && Number.isFinite(profile.grade10)) academicScores.grade10 = profile.grade10;
        if (typeof profile.grade11 === 'number' && Number.isFinite(profile.grade11)) academicScores.grade11 = profile.grade11;
        if (typeof profile.grade12 === 'number' && Number.isFinite(profile.grade12)) academicScores.grade12 = profile.grade12;

        const availableScores = Object.values(academicScores);
        const averageScore = availableScores.length > 0
            ? availableScores.reduce((sum, value) => sum + value, 0) / availableScores.length
            : 6;

        const fallbackTargets = this.buildFallbackTargets(profile.targetMajor, profile.targetUniversity, personality.mbtiType);
        let predictionTargets: string[] = [];
        let recommendationSource = 'profile-fallback';

        if (this.predictClient) {
            try {
                const prediction = await this.predictClient.predict({
                    mbti: personality.mbtiType,
                    academic_scores: academicScores,
                    ielts: this.findCertificateScore(profile.certificates, 'IELTS') ?? undefined,
                });
                predictionTargets = uniqueStrings(prediction.predictions).slice(0, 6);
                if (predictionTargets.length > 0) {
                    recommendationSource = 'predict+profile';
                }
            } catch {
                recommendationSource = 'predict-failed-fallback';
            }
        }

        const targetMajors = uniqueStrings([
            ...predictionTargets,
            profile.targetMajor,
            ...fallbackTargets,
        ]);

        const searchQueries = uniqueStrings([
            ...predictionTargets,
            profile.targetMajor,
            profile.targetUniversity ? `${profile.targetMajor || 'ngành'} ${profile.targetUniversity}` : null,
            ...fallbackTargets,
        ]).slice(0, 8);

        const universityCode = this.toUniversityCode(profile.targetUniversity);
        const fetchedItems = new Map<string, AdmissionCatalogItem>();

        if (searchQueries.length === 0) {
            searchQueries.push('công nghệ thông tin');
        }

        for (const query of searchQueries) {
            const response = await this.admissionsClient.searchAdmissions({
                q: query,
                universityCode: universityCode || undefined,
                page: 1,
                pageSize: 50,
            });

            for (const item of response.items) {
                const key = `${item.universityCode}::${item.majorCode}`;
                if (!fetchedItems.has(key)) {
                    fetchedItems.set(key, item);
                }
            }

            if (fetchedItems.size >= 40) {
                break;
            }
        }

        const ranked = Array.from(fetchedItems.values())
            .map((item) => this.rankCandidate(item, {
                averageScore,
                mbtiType: personality.mbtiType,
                targetUniversity: profile.targetUniversity,
                targetMajor: profile.targetMajor,
                targetMajors,
            }))
            .sort((a, b) => {
                if (b.score !== a.score) {
                    return b.score - a.score;
                }

                const nameCompare = a.item.majorName.localeCompare(b.item.majorName, 'vi');
                if (nameCompare !== 0) {
                    return nameCompare;
                }

                const universityCompare = a.item.universityCode.localeCompare(b.item.universityCode);
                if (universityCompare !== 0) {
                    return universityCompare;
                }

                return a.item.majorCode.localeCompare(b.item.majorCode);
            })
            .slice(0, 15);

        if (ranked.length === 0) {
            throw new ReviewServiceError('Không thể tạo danh sách gợi ý phù hợp', 500);
        }

        const recommendations: ReviewRecommendation[] = ranked.map((candidate) => ({
            name: `${candidate.item.majorName} - ${candidate.item.universityName || candidate.item.universityCode}`,
            score: candidate.score,
            reason: candidate.reason,
            universityCode: candidate.item.universityCode,
            universityName: candidate.item.universityName,
            majorCode: candidate.item.majorCode,
            majorName: candidate.item.majorName,
            featuredMethod: candidate.featuredMethod,
        }));

        const overallScore = clampScore(
            recommendations.reduce((sum, item) => sum + item.score, 0) / recommendations.length
        );

        const best = recommendations[0];
        const summary = `Gợi ý phù hợp nhất: ${best.majorName} tại ${best.universityName || best.universityCode} (${best.score}/100).`;

        const result = this.reviewRepository.create({
            userId,
            overallScore,
            summary,
            recommendations,
            inputSnapshot: {
                profile: {
                    id: profile.id,
                    fullName: profile.fullName,
                    grade10: profile.grade10,
                    grade11: profile.grade11,
                    grade12: profile.grade12,
                    targetMajor: profile.targetMajor,
                    targetUniversity: profile.targetUniversity,
                },
                personality: {
                    id: personality.id,
                    mbtiType: personality.mbtiType,
                    scores: personality.scores,
                },
                recommendationSource,
                predictions: predictionTargets,
                targets: targetMajors,
                queries: searchQueries,
            },
        });

        if (!result) {
            throw new ReviewServiceError('Không thể lưu kết quả đánh giá', 500);
        }

        return { result };
    }

    private toUniversityCode(value: string | null | undefined): string | null {
        if (!value) {
            return null;
        }

        const trimmed = value.trim();
        if (!trimmed || trimmed.includes(' ')) {
            return null;
        }

        return trimmed.toUpperCase();
    }

    private findCertificateScore(
        certificates: Array<{ type: string; score: number | null }> | null | undefined,
        type: string
    ): number | null {
        const normalizedType = type.trim().toUpperCase();
        const matched = (certificates ?? []).find((item) => item.type.trim().toUpperCase() === normalizedType && typeof item.score === 'number');
        return typeof matched?.score === 'number' && Number.isFinite(matched.score) ? matched.score : null;
    }

    private buildFallbackTargets(
        targetMajor: string | null | undefined,
        targetUniversity: string | null | undefined,
        mbtiType: string
    ): string[] {
        const candidates: string[] = [];
        const major = this.normalizeText(targetMajor);
        const university = this.normalizeText(targetUniversity);

        if (major) {
            candidates.push(major);
        }

        if (major && university) {
            candidates.push(`${major} ${university}`);
        } else if (university) {
            candidates.push(`ngành phù hợp tại ${university}`);
        }

        candidates.push(...this.getMbtiFallbackTargets(mbtiType));

        return uniqueStrings(candidates).slice(0, 8);
    }

    private normalizeText(value: string | null | undefined): string | null {
        if (typeof value !== 'string') {
            return null;
        }

        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
    }

    private getMbtiFallbackTargets(mbtiType: string): string[] {
        const upperMbti = mbtiType.toUpperCase();
        const targets: string[] = [];

        if (upperMbti.includes('N') && upperMbti.includes('T')) {
            targets.push('Khoa học máy tính', 'Hệ thống thông tin', 'Kỹ thuật phần mềm');
        }

        if (upperMbti.includes('F')) {
            targets.push('Tâm lý học', 'Giáo dục học', 'Công tác xã hội');
        }

        if (upperMbti.startsWith('E')) {
            targets.push('Marketing', 'Quản trị kinh doanh', 'Truyền thông');
        }

        if (targets.length === 0) {
            targets.push('Hệ thống thông tin', 'Tài chính', 'Ngôn ngữ học');
        }

        return targets;
    }

    private selectFeaturedMethod(methods: AdmissionCatalogMethod[]): ReviewFeaturedMethod | null {
        if (!methods.length) {
            return null;
        }

        const candidates = methods.map((method, index) => {
            const sortedScores = [...method.yearlyScores].sort((a, b) => b.year - a.year);
            const latest = sortedScores[0] || null;
            return {
                method,
                index,
                latestYear: latest?.year ?? null,
                latestScore: latest?.score ?? null,
            };
        });

        const hasAnyLatestScore = candidates.some((candidate) => candidate.latestYear != null && candidate.latestScore != null);
        const picked = hasAnyLatestScore
            ? [...candidates].sort((a, b) => {
                const yearA = a.latestYear ?? -1;
                const yearB = b.latestYear ?? -1;
                if (yearB !== yearA) {
                    return yearB - yearA;
                }

                const scoreA = a.latestScore ?? -1;
                const scoreB = b.latestScore ?? -1;
                if (scoreB !== scoreA) {
                    return scoreB - scoreA;
                }

                return a.index - b.index;
            })[0]
            : candidates[0];

        return {
            methodTag: picked.method.methodTag,
            methodAlias: picked.method.methodAlias,
            latestYear: picked.latestYear,
            latestScore: picked.latestScore,
            shortComment: picked.method.shortComment,
        };
    }

    private rankCandidate(
        item: AdmissionCatalogItem,
        context: {
            averageScore: number;
            mbtiType: string;
            targetUniversity: string | null;
            targetMajor: string | null;
            targetMajors: string[];
        }
    ): RankedCandidate {
        const featuredMethod = this.selectFeaturedMethod(item.methods);
        const majorName = normalizeNameForLookup(item.majorName);

        const majorMatchScore = context.targetMajors.reduce((best, target) => {
            const normalizedTarget = normalizeNameForLookup(target);
            if (!normalizedTarget) return best;
            if (majorName === normalizedTarget) return Math.max(best, 30);
            if (majorName.includes(normalizedTarget) || normalizedTarget.includes(majorName)) return Math.max(best, 22);
            const overlap = normalizedTarget.split(' ').some((token) => token.length > 2 && majorName.includes(token));
            return Math.max(best, overlap ? 14 : 0);
        }, 0);

        const cutoffDistance = this.getCutoffDistance(featuredMethod?.latestScore ?? null, context.averageScore);
        const cutoffDistanceScore = cutoffDistance.score;

        const mbtiBonus = this.getPersonalityBonus(item.majorName, context.mbtiType);

        const targetMajorBonus = context.targetMajor
            && majorName.includes(normalizeNameForLookup(context.targetMajor))
            ? 10
            : 0;

        const universityBonus = context.targetUniversity
            && (normalizeNameForLookup(item.universityName || '').includes(normalizeNameForLookup(context.targetUniversity))
                || item.universityCode.toLowerCase() === context.targetUniversity.toLowerCase())
            ? 8
            : 0;

        const score = clampScore(20 + majorMatchScore + cutoffDistanceScore + mbtiBonus + targetMajorBonus + universityBonus);

        const distanceText = cutoffDistance.distance != null
            ? `chênh lệch điểm chuẩn ~${cutoffDistance.distance.toFixed(1)}`
            : 'chưa có điểm chuẩn gần nhất';

        return {
            item,
            featuredMethod,
            score,
            reason: `Phù hợp theo mục tiêu ngành, ${distanceText}, MBTI ${context.mbtiType} và ưu tiên hồ sơ cá nhân.`,
        };
    }

    private getCutoffDistance(latestScore: number | null, averageScore: number): { score: number; distance: number | null } {
        if (latestScore == null || !Number.isFinite(latestScore) || !Number.isFinite(averageScore)) {
            return { score: 12, distance: null };
        }

        if (latestScore >= 0 && latestScore <= 10) {
            const distance = Math.abs(latestScore - averageScore);
            return { score: Math.max(0, 30 - distance * 8), distance };
        }

        if (latestScore > 10 && latestScore <= 30) {
            const normalizedAverage = averageScore * 3;
            const distance = Math.abs(latestScore - normalizedAverage);
            return { score: Math.max(0, 30 - distance * 8), distance };
        }

        return { score: 12, distance: null };
    }

    private getPersonalityBonus(targetName: string, mbtiType: string): number {
        const normalizedName = normalizeNameForLookup(targetName);
        const upperMbti = mbtiType.toUpperCase();

        let bonus = 0;

        if (upperMbti.includes('N') && upperMbti.includes('T')) {
            if (
                normalizedName.includes('công nghệ')
                || normalizedName.includes('khoa học máy tính')
                || normalizedName.includes('phần mềm')
                || normalizedName.includes('hệ thống thông tin')
                || normalizedName.includes('kỹ thuật')
            ) {
                bonus += 12;
            }
        }

        if (upperMbti.includes('F')) {
            if (
                normalizedName.includes('giáo dục')
                || normalizedName.includes('tâm lý')
                || normalizedName.includes('xã hội')
            ) {
                bonus += 10;
            }
        }

        if (upperMbti.startsWith('E')) {
            if (
                normalizedName.includes('marketing')
                || normalizedName.includes('kinh doanh')
                || normalizedName.includes('truyền thông')
            ) {
                bonus += 8;
            }
        }

        return bonus;
    }
}
