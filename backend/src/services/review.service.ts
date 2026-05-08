import { ReviewRecommendation, ReviewResult } from '../model/review.model';
import { ReviewRepository } from '../repository/review.repository';
import { PersonalityRepository } from '../repository/personality.repository';
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

interface RecommendationInput {
    name: string;
    priority: number;
}

export class ReviewService {
    constructor(
        private reviewRepository: ReviewRepository,
        private profileRepository: StudentProfileRepository,
        private personalityRepository: PersonalityRepository
    ) { }

    getLatest(userId: number): ReviewResultPayload {
        const result = this.reviewRepository.findLatestByUserId(userId);
        if (!result) {
            return { result: null };
        }

        return { result };
    }

    run(userId: number): ReviewResultPayload {
        const profile = this.profileRepository.findByUserId(userId);
        if (!profile) {
            throw new ReviewServiceError('Cần cập nhật hồ sơ trước khi chạy đánh giá', 400);
        }

        const personality = this.personalityRepository.findLatestByUserId(userId);
        if (!personality) {
            throw new ReviewServiceError('Cần hoàn thành bài đánh giá tính cách trước khi chạy đánh giá', 400);
        }

        const recommendationTargets = this.buildFallbackTargets(profile.targetMajor, profile.targetUniversity, personality.mbtiType);
        const recommendationInputs: RecommendationInput[] = recommendationTargets.map((name, index) => ({
                name,
                priority: index + 1,
            }));

        const availableScores = [profile.grade10, profile.grade11, profile.grade12]
            .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
        const averageScore = availableScores.length > 0
            ? availableScores.reduce((sum, value) => sum + value, 0) / availableScores.length
            : 6;

        const academicBase = (averageScore / 10) * 70;
        const recommendations: ReviewRecommendation[] = recommendationInputs.map((item) => {
            const personalityBonus = this.getPersonalityBonus(item.name, personality.mbtiType);
            const priorityBonus = Math.max(0, 15 - (item.priority - 1) * 3);
            const score = clampScore(academicBase + personalityBonus + priorityBonus);

            return {
                name: item.name,
                score,
                reason: `Điểm học tập nền tảng ${averageScore.toFixed(1)}, MBTI ${personality.mbtiType} và mức ưu tiên mục tiêu ${item.priority}.`,
            };
        })
            .sort((first, second) => second.score - first.score)
            .slice(0, 5);

        if (recommendations.length === 0) {
            throw new ReviewServiceError('Không thể tạo danh sách gợi ý phù hợp', 500);
        }

        const overallScore = clampScore(
            recommendations.reduce((sum, item) => sum + item.score, 0) / recommendations.length
        );

        const summary = `Gợi ý phù hợp nhất: ${recommendations[0].name} (${recommendations[0].score}/100).`;

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
                recommendationSource: 'profile-fallback',
                targets: recommendationTargets,
            },
        });

        if (!result) {
            throw new ReviewServiceError('Không thể lưu kết quả đánh giá', 500);
        }

        return { result };
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
            candidates.push(`${major} tại ${university}`);
        } else if (university) {
            candidates.push(`Các chương trình tại ${university}`);
        }

        candidates.push(...this.getMbtiFallbackTargets(mbtiType));
        candidates.push('Lộ trình khám phá nghề nghiệp');

        const deduped: string[] = [];
        const seen = new Set<string>();
        for (const candidate of candidates) {
            const normalized = normalizeNameForLookup(candidate);
            if (!normalized || seen.has(normalized)) {
                continue;
            }
            seen.add(normalized);
            deduped.push(candidate.trim());
        }

        return deduped.slice(0, 8);
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
            targets.push('Kỹ thuật phần mềm', 'Khoa học dữ liệu', 'Kỹ thuật máy tính');
        }

        if (upperMbti.includes('F')) {
            targets.push('Tâm lý học', 'Giáo dục học', 'Công tác xã hội');
        }

        if (upperMbti.startsWith('E')) {
            targets.push('Tiếp thị', 'Quản trị kinh doanh', 'Truyền thông');
        }

        if (targets.length === 0) {
            targets.push('Hệ thống thông tin', 'Tài chính', 'Ngôn ngữ học');
        }

        return targets;
    }

    private getPersonalityBonus(targetName: string, mbtiType: string): number {
        const normalizedName = normalizeNameForLookup(targetName);
        const upperMbti = mbtiType.toUpperCase();

        let bonus = 5;

        if (upperMbti.includes('N') && upperMbti.includes('T')) {
            if (
                normalizedName.includes('it')
                || normalizedName.includes('software')
                || normalizedName.includes('engineer')
                || normalizedName.includes('cong nghe')
                || normalizedName.includes('ky thuat')
            ) {
                bonus += 12;
            }
        }

        if (upperMbti.includes('F')) {
            if (
                normalizedName.includes('law')
                || normalizedName.includes('giao duc')
                || normalizedName.includes('su pham')
                || normalizedName.includes('tam ly')
                || normalizedName.includes('social')
            ) {
                bonus += 10;
            }
        }

        if (upperMbti.startsWith('E')) {
            if (
                normalizedName.includes('marketing')
                || normalizedName.includes('kinh doanh')
                || normalizedName.includes('management')
                || normalizedName.includes('truyen thong')
            ) {
                bonus += 8;
            }
        }

        return bonus;
    }
}
