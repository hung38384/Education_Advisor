export interface PredictFastInput {
    mbti: string;
    academic_scores: Record<string, number>;
    ielts?: number;
}

export interface PredictFastResult {
    predictions: string[];
}

export interface AIPredictClient {
    predict(input: PredictFastInput): Promise<PredictFastResult>;
}

interface HttpAIPredictClientConfig {
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
const PREDICT_PATH = '/api/v1/predict-fast';

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
                throw new AIPredictClientError('Predict service returned invalid JSON', 502);
            }
            return {};
        }

        return parsed as Record<string, unknown>;
    } catch (error: unknown) {
        if (error instanceof AIPredictClientError) {
            throw error;
        }
        if (responseOk) {
            throw new AIPredictClientError('Predict service returned invalid JSON', 502, error);
        }
        return {};
    }
}

function normalizePredictions(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .filter((entry) => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
}

export class AIPredictClientError extends Error {
    constructor(
        message: string,
        public statusCode: number = 502,
        public cause?: unknown
    ) {
        super(message);
        this.name = 'AIPredictClientError';
    }
}

export class HttpAIPredictClient implements AIPredictClient {
    private readonly baseUrl: string;

    constructor(private readonly config: HttpAIPredictClientConfig) {
        this.baseUrl = normalizeBaseUrl(config.baseUrl);
    }

    async predict(input: PredictFastInput): Promise<PredictFastResult> {
        if (typeof fetch !== 'function') {
            throw new AIPredictClientError('Fetch API is unavailable in this Node runtime', 500);
        }

        const url = `${this.baseUrl}${PREDICT_PATH}`;
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
                throw new AIPredictClientError(
                    message || `Predict service returned HTTP ${response.status}`,
                    response.status
                );
            }

            return {
                predictions: normalizePredictions(parsedBody.predictions),
            };
        } catch (error: unknown) {
            if (error instanceof AIPredictClientError) {
                throw error;
            }

            if (error instanceof Error && error.name === 'AbortError') {
                throw new AIPredictClientError(
                    `Predict service timeout after ${this.config.timeoutMs}ms`,
                    504,
                    error
                );
            }

            throw new AIPredictClientError('Unable to reach predict service', 502, error);
        } finally {
            clearTimeout(timeoutId);
        }
    }
}

export function createAIPredictClientFromEnv(
    env: AIServiceEnv = process.env as AIServiceEnv
): AIPredictClient {
    const baseUrl = (env.AI_SERVICE_BASE_URL || DEFAULT_BASE_URL).trim();
    const apiKey = (env.AI_SERVICE_API_KEY || '').trim();

    return new HttpAIPredictClient({
        baseUrl,
        timeoutMs: parseTimeoutMs(env.AI_SERVICE_TIMEOUT_MS),
        apiKey: apiKey || undefined,
    });
}
