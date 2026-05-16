export interface AdvisorInput {
    query?: string;
    question?: string;
    context?: Record<string, unknown>;
    session_id?: string;
    conversation_id?: string;
    target_university?: string;
    target_major?: string;
    target_major_name?: string;
    target_year?: string;
    mbti?: string;
    ielts?: number;
    tsa_score?: number;
    hsa_score?: number;
    certificates?: Array<{
        type: string;
        name: string;
        score: number | null;
        issuedAt?: string | null;
        expiresAt?: string | null;
        note?: string | null;
    }>;
    academic_scores?: {
        grade10?: number;
        grade11?: number;
        grade12?: number;
    };
    transcript?: Record<string, number>;
    student_profile?: {
        full_name?: string | null;
        city?: string | null;
        school_name?: string | null;
        target_major?: string | null;
        target_university?: string | null;
        favorite_subjects?: string | string[] | null;
        transcript?: Record<string, number> | null;
        certificates?: Array<{
            type: string;
            name: string;
            score: number | null;
            issuedAt?: string | null;
            expiresAt?: string | null;
            note?: string | null;
        }>;
    };
    method_tag?: string;
}

export interface AdvisorResult {
    status: string;
    advice: string;
}

export interface AdvisorClient {
    advise(input: AdvisorInput): Promise<AdvisorResult>;
}

interface HttpAdvisorClientConfig {
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
const ADVISE_PATH = '/api/v1/advise';

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
                throw new AdvisorClientError('Advisor service returned invalid JSON', 502);
            }
            return {};
        }

        return parsed as Record<string, unknown>;
    } catch (error: unknown) {
        if (error instanceof AdvisorClientError) {
            throw error;
        }
        if (responseOk) {
            throw new AdvisorClientError('Advisor service returned invalid JSON', 502, error);
        }
        return {};
    }
}

export class AdvisorClientError extends Error {
    constructor(
        message: string,
        public statusCode: number = 502,
        public cause?: unknown
    ) {
        super(message);
        this.name = 'AdvisorClientError';
    }
}

export class HttpAdvisorClient implements AdvisorClient {
    private readonly baseUrl: string;

    constructor(private readonly config: HttpAdvisorClientConfig) {
        this.baseUrl = normalizeBaseUrl(config.baseUrl);
    }

    async advise(input: AdvisorInput): Promise<AdvisorResult> {
        if (typeof fetch !== 'function') {
            throw new AdvisorClientError('Fetch API is unavailable in this Node runtime', 500);
        }

        const url = `${this.baseUrl}${ADVISE_PATH}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            Accept: 'application/json',
        };

        if (this.config.apiKey) {
            headers['X-Internal-Api-Key'] = this.config.apiKey;
        }

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(input),
                signal: controller.signal,
            });

            const rawBody = await response.text();
            const parsedBody = parseJsonObject(rawBody, response.ok);
            const message =
                typeof parsedBody.message === 'string'
                    ? parsedBody.message
                    : (typeof parsedBody.detail === 'string' ? parsedBody.detail : undefined);

            if (!response.ok) {
                throw new AdvisorClientError(
                    message || `Advisor service returned HTTP ${response.status}`,
                    response.status
                );
            }

            const advice = typeof parsedBody.advice === 'string' ? parsedBody.advice.trim() : '';
            if (!advice) {
                throw new AdvisorClientError('Advisor service returned empty advice', 502);
            }

            return {
                status: typeof parsedBody.status === 'string' ? parsedBody.status : 'ok',
                advice,
            };
        } catch (error: unknown) {
            if (error instanceof AdvisorClientError) {
                throw error;
            }

            if (error instanceof Error && error.name === 'AbortError') {
                throw new AdvisorClientError(
                    `Advisor service timeout after ${this.config.timeoutMs}ms`,
                    504,
                    error
                );
            }

            throw new AdvisorClientError('Unable to reach advisor service', 502, error);
        } finally {
            clearTimeout(timeoutId);
        }
    }
}

export function createAdvisorClientFromEnv(
    env: AIServiceEnv = process.env as AIServiceEnv
): AdvisorClient {
    const baseUrl = (env.AI_SERVICE_BASE_URL || DEFAULT_BASE_URL).trim();
    const apiKey = (env.AI_SERVICE_API_KEY || '').trim();

    return new HttpAdvisorClient({
        baseUrl,
        timeoutMs: parseTimeoutMs(env.AI_SERVICE_TIMEOUT_MS),
        apiKey: apiKey || undefined,
    });
}
