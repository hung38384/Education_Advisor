import {
    AdmissionCatalogItem,
    AdmissionCatalogMethod,
    AdmissionCatalogResponse as AdmissionCatalogResponseModel,
} from '../model/admission.model';

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

export type AdmissionCatalogResponse = AdmissionCatalogResponseModel;

export interface AIAdmissionsClient {
    searchAdmissions(params: AdmissionSearchParams): Promise<AdmissionCatalogResponse>;
}

interface HttpAIAdmissionsClientConfig {
    baseUrl: string;
    timeoutMs: number;
    apiKey?: string;
}

interface AIServiceEnv {
    AI_SERVICE_BASE_URL?: string;
    AI_SERVICE_API_KEY?: string;
    AI_SERVICE_TIMEOUT_MS?: string;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_BASE_URL = 'http://localhost:8000';
const SEARCH_PATH = '/api/v1/admissions/search';

function normalizeBaseUrl(baseUrl: string): string {
    return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

function parseTimeoutMs(value: string | undefined): number {
    if (!value) {
        return DEFAULT_TIMEOUT_MS;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return DEFAULT_TIMEOUT_MS;
    }

    return Math.round(parsed);
}

function parseJsonObject(rawBody: string, responseOk: boolean): Record<string, unknown> {
    if (!rawBody || rawBody.trim().length === 0) {
        return {};
    }

    try {
        const parsed = JSON.parse(rawBody);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            if (responseOk) {
                throw new AIAdmissionsClientError('Admissions service returned invalid JSON', 502);
            }
            return {};
        }

        return parsed as Record<string, unknown>;
    } catch (error: unknown) {
        if (error instanceof AIAdmissionsClientError) {
            throw error;
        }
        if (responseOk) {
            throw new AIAdmissionsClientError('Admissions service returned invalid JSON', 502, error);
        }
        return {};
    }
}

function appendIfPresent(searchParams: URLSearchParams, key: string, value: unknown): void {
    if (value === undefined || value === null) {
        return;
    }

    const text = String(value).trim();
    if (!text) {
        return;
    }

    searchParams.append(key, text);
}

interface PaginationLike {
    page?: unknown;
    pageSize?: unknown;
    totalItems?: unknown;
    totalPages?: unknown;
}

function toPositiveInt(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return null;
    }

    const n = Math.floor(value);
    return n > 0 ? n : null;
}

function toNonNegativeInt(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return null;
    }

    const n = Math.floor(value);
    return n >= 0 ? n : null;
}

function normalizeCatalogMethod(method: unknown): AdmissionCatalogMethod | null {
    if (!method || typeof method !== 'object' || Array.isArray(method)) {
        return null;
    }

    const record = method as Record<string, unknown>;
    const methodTag = typeof record.methodTag === 'string' ? record.methodTag.trim() : '';
    if (!methodTag) {
        return null;
    }

    const methodAlias = typeof record.methodAlias === 'string'
        ? record.methodAlias
        : null;

    const subjectCombinations = Array.isArray(record.subjectCombinations)
        ? record.subjectCombinations
            .filter((value): value is string => typeof value === 'string')
            .map((value) => value.trim())
            .filter(Boolean)
        : [];

    const yearlyScores: AdmissionCatalogMethod['yearlyScores'] = Array.isArray(record.yearlyScores)
        ? record.yearlyScores.flatMap((entry) => {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
                return [];
            }

            const scoreRecord = entry as Record<string, unknown>;
            const year = typeof scoreRecord.year === 'number' ? scoreRecord.year : Number.NaN;
            const score = typeof scoreRecord.score === 'number' ? scoreRecord.score : Number.NaN;
            if (!Number.isFinite(year) || !Number.isFinite(score)) {
                return [];
            }

            return [{
                year: Math.round(year),
                score,
            }];
        })
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

function normalizeCatalogItem(item: unknown): AdmissionCatalogItem | null {
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
            .map((method) => normalizeCatalogMethod(method))
            .filter((method): method is AdmissionCatalogMethod => method !== null)
        : [];

    return {
        universityCode,
        universityName,
        majorCode,
        majorName,
        methods,
    };
}

function normalizeFilters(filters: unknown): AdmissionCatalogResponse['filters'] {
    const empty: AdmissionCatalogResponse['filters'] = {
        years: [],
        methodTags: [],
        universities: [],
    };

    if (!filters || typeof filters !== 'object' || Array.isArray(filters)) {
        return empty;
    }

    const record = filters as Record<string, unknown>;
    const years = Array.isArray(record.years)
        ? record.years.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)).map((year) => Math.floor(year))
        : [];
    const methodTags = Array.isArray(record.methodTags)
        ? record.methodTags.filter((value): value is string => typeof value === 'string').map((tag) => tag.trim()).filter(Boolean)
        : [];
    const universities: AdmissionCatalogResponse['filters']['universities'] = [];
    if (Array.isArray(record.universities)) {
        for (const entry of record.universities) {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
                continue;
            }
            const uniRecord = entry as Record<string, unknown>;
            const rawCode = typeof uniRecord.code === 'string'
                ? uniRecord.code
                : (typeof uniRecord.universityCode === 'string' ? uniRecord.universityCode : '');
            const code = rawCode.trim();
            if (!code) {
                continue;
            }

            const rawName = typeof uniRecord.name === 'string'
                ? uniRecord.name
                : (typeof uniRecord.universityName === 'string' ? uniRecord.universityName : null);

            universities.push({
                code,
                name: rawName,
            });
        }
    }

    return {
        years,
        methodTags,
        universities,
    };
}

function normalizeCatalogResponse(body: Record<string, unknown>): AdmissionCatalogResponse {
    const items = Array.isArray(body.items)
        ? body.items.map((item) => normalizeCatalogItem(item)).filter((item): item is AdmissionCatalogItem => item !== null)
        : [];

    const pagination = body.pagination && typeof body.pagination === 'object' && !Array.isArray(body.pagination)
        ? body.pagination as PaginationLike
        : undefined;

    const total =
        toNonNegativeInt(pagination?.totalItems) ??
        toNonNegativeInt(body.total) ??
        items.length;

    const page =
        toPositiveInt(pagination?.page) ??
        toPositiveInt(body.page) ??
        1;

    const pageSize =
        toPositiveInt(pagination?.pageSize) ??
        toPositiveInt(body.pageSize) ??
        (items.length > 0 ? items.length : 1);

    const totalPages =
        toPositiveInt(pagination?.totalPages) ??
        toPositiveInt(body.totalPages) ??
        Math.max(1, Math.ceil(total / pageSize));

    return {
        items,
        total,
        page,
        pageSize,
        totalPages,
        filters: normalizeFilters(body.filters),
    };
}

export class AIAdmissionsClientError extends Error {
    constructor(
        message: string,
        public statusCode: number = 502,
        public cause?: unknown
    ) {
        super(message);
        this.name = 'AIAdmissionsClientError';
    }
}

export class HttpAIAdmissionsClient implements AIAdmissionsClient {
    private readonly baseUrl: string;

    constructor(private readonly config: HttpAIAdmissionsClientConfig) {
        this.baseUrl = normalizeBaseUrl(config.baseUrl);
    }

    async searchAdmissions(params: AdmissionSearchParams): Promise<AdmissionCatalogResponse> {
        if (typeof fetch !== 'function') {
            throw new AIAdmissionsClientError('Fetch API is unavailable in this Node runtime', 500);
        }

        const query = new URLSearchParams();
        appendIfPresent(query, 'q', params.q);
        appendIfPresent(query, 'year', params.year);
        appendIfPresent(query, 'methodTag', params.methodTag);
        appendIfPresent(query, 'universityCode', params.universityCode);
        appendIfPresent(query, 'minScore', params.minScore);
        appendIfPresent(query, 'maxScore', params.maxScore);
        appendIfPresent(query, 'page', params.page);
        appendIfPresent(query, 'pageSize', params.pageSize);

        const url = `${this.baseUrl}${SEARCH_PATH}${query.size ? `?${query.toString()}` : ''}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

        const headers: Record<string, string> = {
            Accept: 'application/json',
        };

        if (this.config.apiKey) {
            headers['X-Internal-Api-Key'] = this.config.apiKey;
        }

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers,
                signal: controller.signal,
            });

            const rawBody = await response.text();
            const parsedBody = parseJsonObject(rawBody, response.ok);
            const message =
                typeof parsedBody.message === 'string'
                    ? parsedBody.message
                    : (typeof parsedBody.detail === 'string' ? parsedBody.detail : undefined);

            if (!response.ok) {
                throw new AIAdmissionsClientError(
                    message || `Admissions service returned HTTP ${response.status}`,
                    response.status
                );
            }

            return normalizeCatalogResponse(parsedBody);
        } catch (error: unknown) {
            if (error instanceof AIAdmissionsClientError) {
                throw error;
            }

            if (error instanceof Error && error.name === 'AbortError') {
                throw new AIAdmissionsClientError(
                    `Admissions service timeout after ${this.config.timeoutMs}ms`,
                    504,
                    error
                );
            }

            throw new AIAdmissionsClientError('Unable to reach admissions service', 502, error);
        } finally {
            clearTimeout(timeoutId);
        }
    }
}

export function createAIAdmissionsClientFromEnv(
    env: AIServiceEnv = process.env as AIServiceEnv
): AIAdmissionsClient {
    const baseUrl = (env.AI_SERVICE_BASE_URL || DEFAULT_BASE_URL).trim();
    const apiKey = (env.AI_SERVICE_API_KEY || '').trim();

    return new HttpAIAdmissionsClient({
        baseUrl,
        timeoutMs: parseTimeoutMs(env.AI_SERVICE_TIMEOUT_MS),
        apiKey: apiKey || undefined,
    });
}
