import {
    AdmissionCatalogResponse,
    AdmissionCartItem,
    AdmissionCartItemResult,
    AdmissionCartResult,
    AdmissionCartViewItem,
    AdmissionChanceLevel,
    AdmissionFavoriteSnapshot,
    AdmissionMethodType,
    AdmissionProfileSnapshot,
    AdmissionSearchParams,
    CreateAdmissionCartItemInput,
} from '../model/admission.model';
import { StudentProfile } from '../model/student-profile.model';
import { AdmissionCartRepository } from '../repository/admission-cart.repository';
import { StudentProfileRepository } from '../repository/student-profile.repository';
import {
    AIAdmissionsClient,
    AdmissionCatalogResponse as AIAdmissionCatalogResponse,
} from '../clients/ai-admissions.client';
import { CacheMetadata, CacheStore, buildScopedDigest } from '../cache-store';

export class AdmissionServiceError extends Error {
    constructor(
        message: string,
        public statusCode: number = 400
    ) {
        super(message);
        this.name = 'AdmissionServiceError';
    }
}

export interface AdmissionCatalogCacheConfig {
    store: CacheStore;
    ttlSeconds: number;
}

export interface AdmissionCatalogResultWithCache extends AdmissionCatalogResponse {
    cache: CacheMetadata;
}

const DEFAULT_ADMISSION_CATALOG_CACHE_TTL_SECONDS = 300;
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 15;
const MAX_PAGE_SIZE = 50;

function toAverageGrade(profile: StudentProfile | undefined): number | null {
    if (!profile) {
        return null;
    }

    const grades = [profile.grade10, profile.grade11, profile.grade12]
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

    if (grades.length === 0) {
        return null;
    }

    return grades.reduce((sum, value) => sum + value, 0) / grades.length;
}

function clampScore(value: number): number {
    return Math.max(0, Math.min(100, Math.round(value)));
}

function resolveChanceLevel(score: number): AdmissionChanceLevel {
    if (score >= 78) {
        return 'high';
    }

    if (score >= 58) {
        return 'medium';
    }

    return 'challenging';
}

function toMethodType(value: string): AdmissionMethodType {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'thpt' || normalized === 'transcript' || normalized === 'competency' || normalized === 'direct') {
        return normalized;
    }

    return 'direct';
}

function toFiniteNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    return undefined;
}

export class AdmissionService {
    constructor(
        private cartRepository: AdmissionCartRepository,
        private profileRepository: StudentProfileRepository,
        private admissionsClient: AIAdmissionsClient,
        private catalogCacheConfig?: AdmissionCatalogCacheConfig
    ) { }

    async listCatalog(userId: number, params: AdmissionSearchParams = {}): Promise<AdmissionCatalogResultWithCache> {
        const normalized = this.normalizeSearchParams(params);
        const ttlSeconds = this.catalogCacheConfig?.ttlSeconds ?? DEFAULT_ADMISSION_CATALOG_CACHE_TTL_SECONDS;
        const store = this.catalogCacheConfig?.store;

        if (!store || !store.enabled) {
            const aiComputed = await this.admissionsClient.searchAdmissions(normalized);
            const computed = this.normalizeCatalogResponse(aiComputed);
            return {
                ...computed,
                cache: this.buildBypassCacheMetadata(ttlSeconds),
            };
        }

        const cacheKey = this.buildCatalogCacheKey(userId, normalized);
        const cached = await store.get<AdmissionCatalogResponse>(cacheKey);
        if (cached && Array.isArray(cached.items)) {
            return {
                ...cached,
                cache: store.buildMetadata('hit', ttlSeconds, 'web'),
            };
        }

        const aiComputed = await this.admissionsClient.searchAdmissions(normalized);
        const computed = this.normalizeCatalogResponse(aiComputed);
        await store.set(cacheKey, computed, ttlSeconds);

        return {
            ...computed,
            cache: store.buildMetadata('miss', ttlSeconds, 'web'),
        };
    }

    listFavorites(userId: number): AdmissionCartResult {
        const profile = this.profileRepository.findByUserId(userId);
        const items = this.cartRepository
            .listByUserId(userId)
            .map((item) => this.toViewItem(item, profile));

        return {
            profile: this.toProfileSnapshot(profile),
            items,
        };
    }

    addToFavorites(userId: number, input: CreateAdmissionCartItemInput): AdmissionCartItemResult {
        const sanitized = this.sanitizeCreateInput(input);

        const existing = this.cartRepository.findBySelection(
            userId,
            sanitized.schoolId,
            sanitized.majorId,
            sanitized.methodId
        );
        if (existing) {
            throw new AdmissionServiceError('Lựa chọn trường, ngành và phương thức này đã có trong danh sách yêu thích', 409);
        }

        const created = this.cartRepository.create(userId, sanitized);
        if (!created) {
            throw new AdmissionServiceError('Không thể thêm lựa chọn vào danh sách yêu thích xét tuyển', 500);
        }

        const profile = this.profileRepository.findByUserId(userId);
        return {
            item: this.toViewItem(created, profile),
        };
    }

    removeFromFavorites(userId: number, id: number): { message: string } {
        const deleted = this.cartRepository.delete(id, userId);
        if (!deleted) {
            throw new AdmissionServiceError('Không tìm thấy lựa chọn trong danh sách yêu thích xét tuyển', 404);
        }

        return { message: 'Đã xóa lựa chọn khỏi danh sách yêu thích xét tuyển' };
    }

    private normalizeCatalogResponse(response: AIAdmissionCatalogResponse): AdmissionCatalogResponse {
        const normalizedPage = Number.isFinite(response.page) && response.page > 0 ? Math.floor(response.page) : DEFAULT_PAGE;
        const normalizedPageSize = Number.isFinite(response.pageSize) && response.pageSize > 0
            ? Math.min(MAX_PAGE_SIZE, Math.floor(response.pageSize))
            : DEFAULT_PAGE_SIZE;
        const normalizedItems = response.items
            .map((item) => this.normalizeCatalogItem(item))
            .filter((item): item is AdmissionCatalogResponse['items'][number] => item !== null);
        const total = Number.isFinite(response.total) && response.total >= 0 ? Math.floor(response.total) : normalizedItems.length;
        const normalizedTotalPagesFromResponse = Number.isFinite(response.totalPages) && response.totalPages > 0
            ? Math.floor(response.totalPages)
            : null;
        const totalPages = normalizedTotalPagesFromResponse
            ?? (normalizedPageSize > 0 ? Math.max(1, Math.ceil(total / normalizedPageSize)) : 1);

        const filters: AdmissionCatalogResponse['filters'] = {
            years: [],
            methodTags: [],
            universities: [],
        };

        if (response.filters) {
            filters.years = Array.isArray(response.filters.years)
                ? response.filters.years.filter((year): year is number => typeof year === 'number' && Number.isFinite(year)).map((year) => Math.floor(year))
                : [];
            filters.methodTags = Array.isArray(response.filters.methodTags)
                ? response.filters.methodTags.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.trim()).filter(Boolean)
                : [];

            if (Array.isArray(response.filters.universities)) {
                for (const university of response.filters.universities) {
                    const code = typeof university?.code === 'string' ? university.code.trim() : '';
                    if (!code) {
                        continue;
                    }
                    filters.universities.push({
                        code,
                        name: typeof university.name === 'string' ? university.name : (university.name ?? null),
                    });
                }
            }
        }

        return {
            items: normalizedItems,
            page: normalizedPage,
            pageSize: normalizedPageSize,
            total,
            totalPages,
            filters,
        };
    }

    private normalizeCatalogItem(item: unknown): AdmissionCatalogResponse['items'][number] | null {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            return null;
        }

        const record = item as Record<string, unknown>;
        const universityCode = typeof record.universityCode === 'string' ? record.universityCode.trim() : '';
        const majorCode = typeof record.majorCode === 'string' ? record.majorCode.trim() : '';
        const majorName = typeof record.majorName === 'string' ? record.majorName.trim() : '';
        if (!universityCode || !majorCode || !majorName) {
            return null;
        }

        const universityName = typeof record.universityName === 'string' ? record.universityName : null;
        const methods = Array.isArray(record.methods)
            ? record.methods
                .map((method) => this.normalizeMethod(method))
                .filter((method): method is AdmissionCatalogResponse['items'][number]['methods'][number] => method !== null)
            : [];

        return {
            universityCode,
            universityName,
            majorCode,
            majorName,
            methods,
        };
    }

    private normalizeMethod(method: unknown): AdmissionCatalogResponse['items'][number]['methods'][number] | null {
        if (!method || typeof method !== 'object' || Array.isArray(method)) {
            return null;
        }

        const record = method as Record<string, unknown>;
        const methodTag = typeof record.methodTag === 'string' ? record.methodTag.trim() : '';
        if (!methodTag) {
            return null;
        }

        const methodAlias = typeof record.methodAlias === 'string' ? record.methodAlias : null;
        const subjectCombinations = Array.isArray(record.subjectCombinations)
            ? record.subjectCombinations.filter((value): value is string => typeof value === 'string')
            : [];
        const yearlyScores = Array.isArray(record.yearlyScores)
            ? record.yearlyScores
                .map((entry) => {
                    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
                        return null;
                    }

                    const scoreRecord = entry as Record<string, unknown>;
                    const year = typeof scoreRecord.year === 'number' && Number.isFinite(scoreRecord.year)
                        ? Math.floor(scoreRecord.year)
                        : null;
                    const score = typeof scoreRecord.score === 'number' && Number.isFinite(scoreRecord.score)
                        ? scoreRecord.score
                        : null;

                    if (year === null || score === null) {
                        return null;
                    }

                    return { year, score };
                })
                .filter((entry): entry is { year: number; score: number } => entry !== null)
            : [];
        const shortComment = typeof record.shortComment === 'string' ? record.shortComment : '';

        return {
            methodTag,
            methodAlias,
            subjectCombinations,
            yearlyScores,
            shortComment,
        };
    }

    private normalizeSearchParams(params: AdmissionSearchParams): AdmissionSearchParams {
        const page = Number(params.page);
        const pageSize = Number(params.pageSize);
        const year = Number(params.year);
        const minScore = Number(params.minScore);
        const maxScore = Number(params.maxScore);

        const normalized: AdmissionSearchParams = {
            page: Number.isFinite(page) && page > 0 ? Math.floor(page) : DEFAULT_PAGE,
            pageSize: Number.isFinite(pageSize) && pageSize > 0
                ? Math.min(MAX_PAGE_SIZE, Math.floor(pageSize))
                : DEFAULT_PAGE_SIZE,
        };

        const q = (params.q ?? '').trim();
        if (q) {
            normalized.q = q;
        }

        const methodTag = (params.methodTag ?? '').trim();
        if (methodTag) {
            normalized.methodTag = methodTag;
        }

        const universityCode = (params.universityCode ?? '').trim().toUpperCase();
        if (universityCode) {
            normalized.universityCode = universityCode;
        }

        if (Number.isFinite(year) && year > 0) {
            normalized.year = Math.floor(year);
        }

        if (Number.isFinite(minScore)) {
            normalized.minScore = minScore;
        }

        if (Number.isFinite(maxScore)) {
            normalized.maxScore = maxScore;
        }

        return normalized;
    }

    private buildCatalogCacheKey(userId: number, params: AdmissionSearchParams): string {
        const digest = buildScopedDigest({ userId, ...params });
        return `u:${userId}:catalog:${digest}`;
    }

    private buildBypassCacheMetadata(ttlSeconds: number): CacheMetadata {
        return {
            layer: 'none',
            status: 'bypass',
            keyVersion: this.catalogCacheConfig?.store.keyVersion ?? 'v1',
            ttlSeconds,
        };
    }

    private sanitizeCreateInput(input: CreateAdmissionCartItemInput): CreateAdmissionCartItemInput {
        const schoolId = (input.schoolId ?? '').trim();
        const majorId = (input.majorId ?? '').trim();
        const methodId = (input.methodId ?? '').trim();

        if (!schoolId || !majorId || !methodId) {
            throw new AdmissionServiceError('Cần chọn đầy đủ trường, ngành và phương thức xét tuyển', 400);
        }

        const snapshot = this.sanitizeSnapshot(input.snapshot);

        return {
            schoolId,
            majorId,
            methodId,
            snapshot,
        };
    }

    private sanitizeSnapshot(snapshot: AdmissionFavoriteSnapshot): AdmissionFavoriteSnapshot {
        const schoolName = (snapshot?.schoolName ?? '').trim();
        const majorName = (snapshot?.majorName ?? '').trim();
        const methodName = (snapshot?.methodName ?? '').trim();
        const description = (snapshot?.description ?? '').trim();
        const requiredAverage = toFiniteNumber(snapshot?.requiredAverage);

        if (!schoolName || !majorName || !methodName || !description || requiredAverage === undefined) {
            throw new AdmissionServiceError('Thông tin snapshot xét tuyển không hợp lệ', 400);
        }

        return {
            schoolName,
            majorName,
            methodName,
            description,
            requiredAverage,
        };
    }

    private toProfileSnapshot(profile: StudentProfile | undefined): AdmissionProfileSnapshot {
        return {
            fullName: profile?.fullName ?? null,
            averageGrade: toAverageGrade(profile),
            favoriteSubjects: profile?.favoriteSubjects ?? [],
            targetMajor: profile?.targetMajor ?? null,
            targetUniversity: profile?.targetUniversity ?? null,
        };
    }

    private toViewItem(item: AdmissionCartItem, profile: StudentProfile | undefined): AdmissionCartViewItem {
        const snapshot = item.snapshot;
        const methodName = snapshot?.methodName ?? item.methodId;
        const requiredAverage = snapshot?.requiredAverage ?? 8;
        const methodType = toMethodType(item.methodId);

        const evaluation = this.buildEvaluation(profile, requiredAverage, snapshot?.majorName ?? item.majorId, methodName);
        return {
            id: item.id,
            createdAt: item.createdAt,
            school: {
                id: item.schoolId,
                name: snapshot?.schoolName ?? item.schoolId,
                city: 'Chưa xác định',
            },
            major: {
                id: item.majorId,
                name: snapshot?.majorName ?? item.majorId,
                field: 'social',
            },
            method: {
                id: item.methodId,
                name: methodName,
                type: methodType,
                requiredAverage,
                description: snapshot?.description ?? 'Thông tin phương thức xét tuyển từ snapshot đã lưu.',
            },
            evaluation,
            orientation: `Theo dõi tiến độ học tập để tăng cơ hội cho ${snapshot?.majorName ?? item.majorId}.`,
            studyPlan: [
                'Rà soát điểm số hiện tại và xác định môn cần ưu tiên.',
                'Lập kế hoạch ôn tập theo tuần gắn với phương thức xét tuyển đã chọn.',
                'Chuẩn bị hồ sơ đúng hạn và cập nhật minh chứng học tập cần thiết.',
            ],
        };
    }

    private buildEvaluation(
        profile: StudentProfile | undefined,
        requiredAverage: number,
        majorName: string,
        methodName: string
    ) {
        const averageGrade = toAverageGrade(profile);
        if (!profile || averageGrade === null) {
            return {
                chanceScore: 55,
                chanceLevel: 'medium' as const,
                comment: `Cập nhật điểm trong hồ sơ để ước tính chính xác hơn cho ngành ${majorName}.`,
            };
        }

        const chanceScore = clampScore(((averageGrade - requiredAverage) * 20) + 65);
        const chanceLevel = resolveChanceLevel(chanceScore);
        const comparison = averageGrade - requiredAverage;
        const comparisonText = comparison >= 0
            ? `cao hơn mốc tham chiếu ${comparison.toFixed(2)} điểm`
            : `thấp hơn mốc tham chiếu ${Math.abs(comparison).toFixed(2)} điểm`;

        return {
            chanceScore,
            chanceLevel,
            comment: `Điểm trung bình ${averageGrade.toFixed(2)} ${comparisonText} (${methodName}).`,
        };
    }
}
