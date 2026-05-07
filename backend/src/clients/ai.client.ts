export interface AIConversationMessage {
    role: 'user' | 'assistant';
    message: string;
}

export interface AIQuestionContext {
    profile: {
        fullName: string;
        city: string | null;
        targetMajor: string | null;
        targetUniversity: string | null;
    } | null;
    personality: {
        mbtiType: string;
    } | null;
    review: {
        overallScore: number;
        summary: string;
    } | null;
    history: AIConversationMessage[];
}

export interface AskAIQuestionInput {
    userId: number;
    question: string;
    context: AIQuestionContext;
}

export interface AskAIQuestionResult {
    answer: string;
    metadata: Record<string, unknown> | null;
}

export interface QAInferenceClient {
    askQuestion(input: AskAIQuestionInput): Promise<AskAIQuestionResult>;
}

export class AIClientError extends Error {
    constructor(
        message: string,
        public statusCode: number = 502,
        public cause?: unknown
    ) {
        super(message);
        this.name = 'AIClientError';
    }
}

interface HttpQAInferenceClientConfig {
    baseUrl: string;
    endpointPath: string;
    timeoutMs: number;
    apiKey?: string;
}

interface AIServiceEnv {
    AI_SERVICE_BASE_URL?: string;
    AI_SERVICE_API_KEY?: string;
    AI_SERVICE_TIMEOUT_MS?: string;
    AI_SERVICE_QA_ENDPOINT_PATH?: string;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_BASE_URL = 'http://localhost:8000';
const DEFAULT_QA_ENDPOINT_PATH = '/api/ai/qa/ask';

function normalizeBaseUrl(baseUrl: string): string {
    return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

function normalizeEndpointPath(endpointPath: string): string {
    if (!endpointPath) {
        return DEFAULT_QA_ENDPOINT_PATH;
    }

    return endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
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

function parseJsonObject(rawBody: string): Record<string, unknown> {
    if (!rawBody || rawBody.trim().length === 0) {
        return {};
    }

    try {
        const parsed = JSON.parse(rawBody);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return {};
        }

        return parsed as Record<string, unknown>;
    } catch {
        return {};
    }
}

function parseMetadata(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    return value as Record<string, unknown>;
}

export class HttpQAInferenceClient implements QAInferenceClient {
    private readonly baseUrl: string;
    private readonly endpointPath: string;

    constructor(private config: HttpQAInferenceClientConfig) {
        this.baseUrl = normalizeBaseUrl(config.baseUrl);
        this.endpointPath = normalizeEndpointPath(config.endpointPath);
    }

    async askQuestion(input: AskAIQuestionInput): Promise<AskAIQuestionResult> {
        if (typeof fetch !== 'function') {
            throw new AIClientError('Fetch API is unavailable in this Node runtime', 500);
        }

        const url = `${this.baseUrl}${this.endpointPath}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
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
            const parsedBody = parseJsonObject(rawBody);
            const message =
                typeof parsedBody.message === 'string'
                    ? parsedBody.message
                    : (typeof parsedBody.detail === 'string' ? parsedBody.detail : undefined);

            if (!response.ok) {
                throw new AIClientError(
                    message || `AI service returned HTTP ${response.status}`,
                    response.status
                );
            }

            const answer = typeof parsedBody.answer === 'string'
                ? parsedBody.answer.trim()
                : '';
            if (!answer) {
                throw new AIClientError('AI service returned an empty answer', 502);
            }

            return {
                answer,
                metadata: parseMetadata(parsedBody.metadata),
            };
        } catch (error: unknown) {
            if (error instanceof AIClientError) {
                throw error;
            }

            if (error instanceof Error && error.name === 'AbortError') {
                throw new AIClientError(`AI service timeout after ${this.config.timeoutMs}ms`, 504, error);
            }

            throw new AIClientError('Unable to reach AI service', 502, error);
        } finally {
            clearTimeout(timeoutId);
        }
    }
}

export function createQAInferenceClientFromEnv(
    env: AIServiceEnv = process.env as AIServiceEnv
): QAInferenceClient {
    const baseUrl = (env.AI_SERVICE_BASE_URL || DEFAULT_BASE_URL).trim();

    const apiKey = (env.AI_SERVICE_API_KEY || '').trim();

    return new HttpQAInferenceClient({
        baseUrl,
        endpointPath: (env.AI_SERVICE_QA_ENDPOINT_PATH || DEFAULT_QA_ENDPOINT_PATH).trim(),
        timeoutMs: parseTimeoutMs(env.AI_SERVICE_TIMEOUT_MS),
        apiKey: apiKey || undefined,
    });
}
