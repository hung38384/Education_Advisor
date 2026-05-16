import { CacheMetadata, CacheStatus, CacheStore, buildScopedDigest } from '../cache-store';
import { QAConversation, QAMessage } from '../model/qa.model';
import { ReviewRepository } from '../repository/review.repository';
import { PersonalityRepository } from '../repository/personality.repository';
import { QARepository } from '../repository/qa.repository';
import { StudentProfileRepository } from '../repository/student-profile.repository';
import { AIClientError, QAInferenceClient } from '../clients/ai.client';
import { AdvisorClient, AdvisorClientError, AdvisorInput } from '../clients/advisor.client';

export interface QAHistoryResult {
    conversationId: number | null;
    messages: QAMessage[];
    cache: CacheMetadata;
}

export interface QAConversationsResult {
    conversations: QAConversation[];
    cache: CacheMetadata;
}

export interface CreateConversationResult {
    conversation: QAConversation;
}

export interface AskQuestionResult {
    answer: string;
    conversationId: number;
    userMessage: QAMessage;
    assistantMessage: QAMessage;
    cache: CacheMetadata;
}

export interface AdviseSchoolMajorInput {
    conversationId?: number;
    universityCode: string;
    universityName?: string | null;
    majorCode: string;
    majorName: string;
    methodTag?: string | null;
    targetYear?: number | null;
}

export interface QAServiceCacheConfig {
    answerStore: CacheStore;
    conversationsStore: CacheStore;
    messagesStore: CacheStore;
    answerTtlSeconds: number;
    conversationsTtlSeconds: number;
    messagesTtlSeconds: number;
}

const AI_CONTEXT_HISTORY_LIMIT = 20;
const AI_CONTEXT_MESSAGE_MAX_LENGTH = 3500;
const CONVERSATION_TITLE_MAX_LENGTH = 120;
const DEFAULT_CONVERSATION_TITLE = 'Cuộc trò chuyện mới';
const DEFAULT_QA_ANSWER_CACHE_TTL_SECONDS = 300;
const DEFAULT_QA_CONVERSATIONS_CACHE_TTL_SECONDS = 120;
const DEFAULT_QA_MESSAGES_CACHE_TTL_SECONDS = 120;

interface QAAnswerContext {
    profile: ReturnType<StudentProfileRepository['findByUserId']>;
    personality: ReturnType<PersonalityRepository['findLatestByUserId']>;
    latestReview: ReturnType<ReviewRepository['findLatestByUserId']>;
}

interface ConversationAdvisorContext {
    universityCode: string;
    universityName?: string | null;
    majorCode: string;
    majorName: string;
    methodTag?: string | null;
    targetYear?: number | null;
}

export class QAServiceError extends Error {
    constructor(
        message: string,
        public statusCode: number = 400
    ) {
        super(message);
        this.name = 'QAServiceError';
    }
}

export class QAService {
    constructor(
        private qaRepository: QARepository,
        private profileRepository: StudentProfileRepository,
        private personalityRepository: PersonalityRepository,
        private reviewRepository: ReviewRepository,
        private qaInferenceClient: QAInferenceClient | null = null,
        private advisorClient: AdvisorClient | null = null,
        private cacheConfig?: QAServiceCacheConfig
    ) { }

    async listConversations(userId: number): Promise<QAConversationsResult> {
        const ttlSeconds = this.cacheConfig?.conversationsTtlSeconds ?? DEFAULT_QA_CONVERSATIONS_CACHE_TTL_SECONDS;
        const store = this.cacheConfig?.conversationsStore;

        if (!store || !store.enabled) {
            return {
                conversations: this.qaRepository.listConversationsByUserId(userId, 100),
                cache: this.buildBypassCacheMetadata(ttlSeconds, store),
            };
        }

        const cacheKey = `u:${userId}:conversations`;
        const cached = await store.get<QAConversation[]>(cacheKey);
        if (Array.isArray(cached)) {
            return {
                conversations: cached,
                cache: store.buildMetadata('hit', ttlSeconds, 'web'),
            };
        }

        const conversations = this.qaRepository.listConversationsByUserId(userId, 100);
        await store.set(cacheKey, conversations, ttlSeconds);
        return {
            conversations,
            cache: store.buildMetadata('miss', ttlSeconds, 'web'),
        };
    }

    async createConversation(userId: number, title?: string): Promise<CreateConversationResult> {
        const normalizedTitle = this.normalizeConversationTitle(title);
        const conversation = this.qaRepository.createConversation({
            userId,
            title: normalizedTitle,
        });

        if (!conversation) {
            throw new QAServiceError('Không thể tạo cuộc trò chuyện', 500);
        }

        await this.invalidateConversationReadCaches(userId, conversation.id);
        return { conversation };
    }

    async deleteConversation(userId: number, conversationId: number): Promise<{ message: string }> {
        const existing = this.ensureConversationOwnership(userId, conversationId);
        if (!existing) {
            throw new QAServiceError('Không tìm thấy cuộc trò chuyện', 404);
        }

        const deleted = this.qaRepository.deleteConversation(userId, conversationId);
        if (!deleted) {
            throw new QAServiceError('Không thể xóa cuộc trò chuyện', 500);
        }

        await this.invalidateConversationReadCaches(userId, conversationId);
        return { message: 'Đã xóa cuộc trò chuyện thành công' };
    }

    async listMessages(userId: number, conversationId?: number): Promise<QAHistoryResult> {
        const resolvedConversationId = this.resolveConversationIdForRead(userId, conversationId);
        const ttlSeconds = this.cacheConfig?.messagesTtlSeconds ?? DEFAULT_QA_MESSAGES_CACHE_TTL_SECONDS;
        const store = this.cacheConfig?.messagesStore;

        if (!store || !store.enabled) {
            if (resolvedConversationId === null) {
                return {
                    conversationId: null,
                    messages: [],
                    cache: this.buildBypassCacheMetadata(ttlSeconds, store),
                };
            }

            return {
                conversationId: resolvedConversationId,
                messages: this.qaRepository.listByConversationId(userId, resolvedConversationId, 300),
                cache: this.buildBypassCacheMetadata(ttlSeconds, store),
            };
        }

        const cacheKey = this.buildMessagesCacheKey(userId, resolvedConversationId);
        const cached = await store.get<{ conversationId: number | null; messages: QAMessage[] }>(cacheKey);
        if (
            cached
            && Object.prototype.hasOwnProperty.call(cached, 'conversationId')
            && Array.isArray(cached.messages)
        ) {
            return {
                conversationId: cached.conversationId,
                messages: cached.messages,
                cache: store.buildMetadata('hit', ttlSeconds, 'web'),
            };
        }

        const payload = resolvedConversationId === null
            ? {
                conversationId: null,
                messages: [],
            }
            : {
                conversationId: resolvedConversationId,
                messages: this.qaRepository.listByConversationId(userId, resolvedConversationId, 300),
            };

        await store.set(cacheKey, payload, ttlSeconds);
        return {
            ...payload,
            cache: store.buildMetadata('miss', ttlSeconds, 'web'),
        };
    }

    async ask(userId: number, question: string, conversationId?: number): Promise<AskQuestionResult> {
        const normalizedQuestion = question.trim();
        if (!normalizedQuestion) {
            throw new QAServiceError('Vui lòng nhập câu hỏi', 400);
        }

        if (normalizedQuestion.length > 1000) {
            throw new QAServiceError('Câu hỏi quá dài', 400);
        }

        const resolvedConversationId = this.resolveConversationIdForAsk(userId, conversationId);
        const priorHistory = this.buildHistoryCacheScope(userId, resolvedConversationId);

        const userMessage = this.qaRepository.create({
            userId,
            conversationId: resolvedConversationId,
            role: 'user',
            message: normalizedQuestion,
        });

        if (!userMessage) {
            throw new QAServiceError('Không thể lưu câu hỏi', 500);
        }

        const context = this.buildContext(userId);
        const answerStore = this.cacheConfig?.answerStore;
        const answerTtlSeconds = this.cacheConfig?.answerTtlSeconds ?? DEFAULT_QA_ANSWER_CACHE_TTL_SECONDS;

        let answerCacheStatus: CacheStatus = 'bypass';
        let answerResult: { answer: string; metadata: Record<string, unknown> };

        if (answerStore && answerStore.enabled) {
            const cacheKey = this.buildAnswerCacheKey(userId, normalizedQuestion, context, priorHistory);
            const cached = await answerStore.get<{ answer: unknown; metadata: unknown }>(cacheKey);

            if (cached && typeof cached.answer === 'string') {
                answerResult = {
                    answer: cached.answer,
                    metadata: this.ensureMetadataObject(cached.metadata),
                };
                answerCacheStatus = 'hit';
            } else {
                answerResult = await this.generateAnswer(
                    userId,
                    resolvedConversationId,
                    normalizedQuestion,
                    context
                );
                answerCacheStatus = 'miss';
                await answerStore.set(cacheKey, {
                    answer: answerResult.answer,
                    metadata: answerResult.metadata,
                }, answerTtlSeconds);
            }
        } else {
            answerResult = await this.generateAnswer(
                userId,
                resolvedConversationId,
                normalizedQuestion,
                context
            );
        }

        const assistantMessage = this.qaRepository.create({
            userId,
            conversationId: resolvedConversationId,
            role: 'assistant',
            message: answerResult.answer,
            metadata: answerResult.metadata,
        });

        if (!assistantMessage) {
            throw new QAServiceError('Không thể lưu câu trả lời', 500);
        }

        await this.invalidateConversationReadCaches(userId, resolvedConversationId);

        return {
            answer: answerResult.answer,
            conversationId: resolvedConversationId,
            userMessage,
            assistantMessage,
            cache: answerStore && answerStore.enabled
                ? answerStore.buildMetadata(answerCacheStatus, answerTtlSeconds, 'web')
                : this.buildBypassCacheMetadata(answerTtlSeconds, answerStore),
        };
    }

    async advise(userId: number, input: AdviseSchoolMajorInput): Promise<AskQuestionResult> {
        const universityCode = (input.universityCode || '').trim();
        const majorCode = (input.majorCode || '').trim();
        const majorName = (input.majorName || '').trim();

        if (!universityCode) {
            throw new QAServiceError('Vui lòng cung cấp mã trường', 400);
        }

        if (!majorCode) {
            throw new QAServiceError('Vui lòng cung cấp mã ngành', 400);
        }

        if (!majorName) {
            throw new QAServiceError('Vui lòng cung cấp tên ngành', 400);
        }

        const resolvedConversationId = this.resolveConversationIdForAdvise(userId, input.conversationId);
        const prompt = this.buildAdvisePrompt(majorName, universityCode, input.universityName);

        const userMessage = this.qaRepository.create({
            userId,
            conversationId: resolvedConversationId,
            role: 'user',
            message: prompt,
        });

        if (!userMessage) {
            throw new QAServiceError('Không thể lưu câu hỏi', 500);
        }

        const context = this.buildContext(userId);
        const adviseResult = await this.generateAdvice(
            userId,
            resolvedConversationId,
            prompt,
            input,
            context
        );

        const assistantMessage = this.qaRepository.create({
            userId,
            conversationId: resolvedConversationId,
            role: 'assistant',
            message: adviseResult.answer,
            metadata: adviseResult.metadata,
        });

        if (!assistantMessage) {
            throw new QAServiceError('Không thể lưu câu trả lời', 500);
        }

        await this.invalidateConversationReadCaches(userId, resolvedConversationId);

        const answerTtlSeconds = this.cacheConfig?.answerTtlSeconds ?? DEFAULT_QA_ANSWER_CACHE_TTL_SECONDS;
        return {
            answer: adviseResult.answer,
            conversationId: resolvedConversationId,
            userMessage,
            assistantMessage,
            cache: this.buildBypassCacheMetadata(answerTtlSeconds, this.cacheConfig?.answerStore),
        };
    }

    private buildContext(userId: number): QAAnswerContext {
        return {
            profile: this.profileRepository.findByUserId(userId),
            personality: this.personalityRepository.findLatestByUserId(userId),
            latestReview: this.reviewRepository.findLatestByUserId(userId),
        };
    }

    private normalizeConversationTitle(title?: string): string {
        const normalized = (title || '').trim();
        if (!normalized) {
            return DEFAULT_CONVERSATION_TITLE;
        }

        if (normalized.length > CONVERSATION_TITLE_MAX_LENGTH) {
            throw new QAServiceError('Tiêu đề cuộc trò chuyện quá dài', 400);
        }

        return normalized;
    }

    private ensureConversationOwnership(userId: number, conversationId: number): QAConversation | null {
        if (!Number.isInteger(conversationId) || conversationId <= 0) {
            throw new QAServiceError('Mã cuộc trò chuyện không hợp lệ', 400);
        }

        const conversation = this.qaRepository.findConversationById(userId, conversationId);
        return conversation || null;
    }

    private resolveConversationIdForRead(userId: number, requestedConversationId?: number): number | null {
        if (requestedConversationId !== undefined) {
            const conversation = this.ensureConversationOwnership(userId, requestedConversationId);
            if (!conversation) {
                throw new QAServiceError('Không tìm thấy cuộc trò chuyện', 404);
            }

            return conversation.id;
        }

        const latestConversation = this.qaRepository.findLatestConversationByUserId(userId);
        if (!latestConversation) {
            return null;
        }

        return latestConversation.id;
    }

    private resolveConversationIdForAsk(userId: number, requestedConversationId?: number): number {
        if (requestedConversationId !== undefined) {
            const conversation = this.ensureConversationOwnership(userId, requestedConversationId);
            if (!conversation) {
                throw new QAServiceError('Không tìm thấy cuộc trò chuyện', 404);
            }

            return conversation.id;
        }

        const latestConversation = this.qaRepository.findLatestConversationByUserId(userId);
        if (latestConversation) {
            return latestConversation.id;
        }

        return this.createDefaultConversation(userId);
    }

    private resolveConversationIdForAdvise(userId: number, requestedConversationId?: number): number {
        if (requestedConversationId !== undefined) {
            const conversation = this.ensureConversationOwnership(userId, requestedConversationId);
            if (!conversation) {
                throw new QAServiceError('Không tìm thấy cuộc trò chuyện', 404);
            }

            return conversation.id;
        }

        return this.createDefaultConversation(userId);
    }

    private createDefaultConversation(userId: number): number {
        const created = this.qaRepository.createConversation({
            userId,
            title: DEFAULT_CONVERSATION_TITLE,
        });
        if (!created) {
            throw new QAServiceError('Không thể tạo cuộc trò chuyện', 500);
        }

        return created.id;
    }

    private buildMessagesCacheKey(userId: number, conversationId: number | null): string {
        if (conversationId === null) {
            return `u:${userId}:latest:none:messages`;
        }

        return `u:${userId}:c:${conversationId}:messages`;
    }

    private buildAnswerCacheKey(
        userId: number,
        question: string,
        context: QAAnswerContext,
        priorHistory: Array<Pick<QAMessage, 'role' | 'message'>>
    ): string {
        const digest = buildScopedDigest({
            userId,
            question,
            priorHistory,
            context: {
                profile: context.profile
                    ? {
                        id: context.profile.id,
                        updatedAt: context.profile.updatedAt,
                        targetMajor: context.profile.targetMajor,
                        targetUniversity: context.profile.targetUniversity,
                    }
                    : null,
                personality: context.personality
                    ? {
                        id: context.personality.id,
                        mbtiType: context.personality.mbtiType,
                        createdAt: context.personality.createdAt,
                    }
                    : null,
                review: context.latestReview
                    ? {
                        id: context.latestReview.id,
                        overallScore: context.latestReview.overallScore,
                        createdAt: context.latestReview.createdAt,
                    }
                    : null,
            },
        });

        return `u:${userId}:q:${digest}`;
    }

    private buildHistoryCacheScope(userId: number, conversationId: number): Array<Pick<QAMessage, 'role' | 'message'>> {
        return this.qaRepository
            .listByConversationId(userId, conversationId, AI_CONTEXT_HISTORY_LIMIT)
            .map((item) => ({
                role: item.role,
                message: this.trimForAIContext(item.message),
            }));
    }

    private ensureMetadataObject(value: unknown): Record<string, unknown> {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return {};
        }

        return value as Record<string, unknown>;
    }

    private buildBypassCacheMetadata(ttlSeconds: number, store?: CacheStore): CacheMetadata {
        return {
            layer: 'none',
            status: 'bypass',
            keyVersion: store?.keyVersion ?? 'v1',
            ttlSeconds,
        };
    }

    private async invalidateConversationReadCaches(userId: number, conversationId?: number): Promise<void> {
        const conversationsStore = this.cacheConfig?.conversationsStore;
        if (conversationsStore && conversationsStore.enabled) {
            await conversationsStore.purgePrefix(`u:${userId}:conversations`);
        }

        const messagesStore = this.cacheConfig?.messagesStore;
        if (messagesStore && messagesStore.enabled) {
            await messagesStore.purgePrefix(`u:${userId}:latest:none:messages`);
            if (conversationId && conversationId > 0) {
                await messagesStore.purgePrefix(`u:${userId}:c:${conversationId}:messages`);
            }
        }
    }

    private async generateAnswer(
        userId: number,
        conversationId: number,
        question: string,
        context: QAAnswerContext
    ): Promise<{ answer: string; metadata: Record<string, unknown> }> {
        const advisorContext = this.findConversationAdvisorContext(userId, conversationId);
        if (advisorContext && this.advisorClient) {
            try {
                const advisorResult = await this.advisorClient.advise(
                    this.buildAdvisorPayload(conversationId, question, advisorContext, context)
                );

                return {
                    answer: advisorResult.advice,
                    metadata: {
                        strategy: 'advisor-service',
                        advisorStatus: advisorResult.status,
                        advisorContext,
                        reusedAdvisorContext: true,
                    },
                };
            } catch (error) {
                if (!(error instanceof AdvisorClientError)) {
                    throw error;
                }

                const fallbackReason = this.getAdvisorFallbackReason(error);
                console.warn(`[qa] Advisor service failed for user ${userId}. Fallback reason: ${fallbackReason}`);

                return {
                    answer: 'Hiá»‡n táº¡i há»‡ thá»‘ng tÆ° váº¥n nÃ¢ng cao Ä‘ang báº­n. MÃ¬nh Ä‘Ã£ lÆ°u yÃªu cáº§u cá»§a báº¡n, vui lÃ²ng thá»­ láº¡i sau Ã­t phÃºt.',
                    metadata: {
                        strategy: 'advisor-fallback',
                        fallbackReason,
                        advisorContext,
                        reusedAdvisorContext: true,
                    },
                };
            }
        }

        if (this.qaInferenceClient) {
            try {
                const history = this.qaRepository
                    .listByConversationId(userId, conversationId, AI_CONTEXT_HISTORY_LIMIT)
                    .map((item) => ({
                        role: item.role,
                        message: this.trimForAIContext(item.message),
                    }));

                const aiResult = await this.qaInferenceClient.askQuestion({
                    userId,
                    question,
                    context: {
                        profile: context.profile
                            ? {
                                fullName: context.profile.fullName,
                                city: context.profile.city,
                                targetMajor: context.profile.targetMajor,
                                targetUniversity: context.profile.targetUniversity,
                            }
                            : null,
                        personality: context.personality
                            ? { mbtiType: context.personality.mbtiType }
                            : null,
                        review: context.latestReview
                            ? {
                                overallScore: context.latestReview.overallScore,
                                summary: context.latestReview.summary,
                            }
                            : null,
                        history,
                    },
                });

                return {
                    answer: aiResult.answer,
                    metadata: {
                        strategy: 'ai-service',
                        ai: aiResult.metadata,
                    },
                };
            } catch (error) {
                const fallbackReason = this.getFallbackReason(error);
                console.warn(`[qa] AI service failed for user ${userId}. Fallback reason: ${fallbackReason}`);

                return {
                    answer: this.buildRuleBasedAnswer(question, context),
                    metadata: {
                        strategy: 'rule-based-fallback',
                        fallbackReason,
                    },
                };
            }
        }

        return {
            answer: this.buildRuleBasedAnswer(question, context),
            metadata: {
                strategy: 'rule-based-template',
            },
        };
    }

    private async generateAdvice(
        userId: number,
        conversationId: number,
        prompt: string,
        input: AdviseSchoolMajorInput,
        context: QAAnswerContext
    ): Promise<{ answer: string; metadata: Record<string, unknown> }> {
        if (this.advisorClient) {
            const payload = this.buildAdvisorPayload(conversationId, prompt, input, context);

            try {
                const advisorResult = await this.advisorClient.advise(payload);

                return {
                    answer: advisorResult.advice,
                    metadata: {
                        strategy: 'advisor-service',
                        advisorStatus: advisorResult.status,
                        advisorContext: {
                            universityCode: input.universityCode,
                            universityName: input.universityName ?? null,
                            majorCode: input.majorCode,
                            majorName: input.majorName,
                            methodTag: input.methodTag ?? null,
                            targetYear: input.targetYear ?? null,
                        },
                    },
                };
            } catch (error) {
                if (!(error instanceof AdvisorClientError)) {
                    throw error;
                }

                const fallbackReason = this.getAdvisorFallbackReason(error);
                console.warn(`[qa] Advisor service failed for user ${userId}. Fallback reason: ${fallbackReason}`);

                return {
                    answer: 'Hiện tại hệ thống tư vấn nâng cao đang bận. Mình đã lưu yêu cầu của bạn, vui lòng thử lại sau ít phút.',
                    metadata: {
                        strategy: 'advisor-fallback',
                        fallbackReason,
                    },
                };
            }
        }

        return {
            answer: 'Hiện tại hệ thống tư vấn nâng cao chưa sẵn sàng. Mình đã lưu yêu cầu của bạn, vui lòng thử lại sau.',
            metadata: {
                strategy: 'advisor-fallback',
                fallbackReason: 'advisor-client-disabled',
            },
        };
    }

    private buildAdvisorPayload(
        conversationId: number,
        prompt: string,
        input: AdviseSchoolMajorInput | ConversationAdvisorContext,
        context: QAAnswerContext
    ): AdvisorInput {
        const targetUniversity = (input.universityCode || '').trim();
        const targetMajor = (input.majorCode || '').trim();
        const targetMajorName = (input.majorName || '').trim();
        const payload: AdvisorInput = {
            query: prompt,
            session_id: `${targetUniversity}:${conversationId}`,
            conversation_id: String(conversationId),
            target_university: targetUniversity,
            target_major: targetMajor,
            target_major_name: targetMajorName,
        };

        if (typeof input.targetYear === 'number' && Number.isFinite(input.targetYear)) {
            payload.target_year = String(Math.round(input.targetYear));
        }

        const mbti = (context.personality?.mbtiType || '').trim();
        if (mbti) {
            payload.mbti = mbti;
        }

        if (context.profile) {
            const certificates = context.profile.certificates ?? [];
            const ielts = this.findCertificateScore(certificates, 'IELTS');
            const tsaScore = this.findCertificateScore(certificates, 'TSA');
            const hsaScore = this.findCertificateScore(certificates, 'HSA');

            const academicScores: Record<string, number> = {};
            if (typeof context.profile.grade10 === 'number' && Number.isFinite(context.profile.grade10)) {
                academicScores.grade10 = context.profile.grade10;
            }
            if (typeof context.profile.grade11 === 'number' && Number.isFinite(context.profile.grade11)) {
                academicScores.grade11 = context.profile.grade11;
            }
            if (typeof context.profile.grade12 === 'number' && Number.isFinite(context.profile.grade12)) {
                academicScores.grade12 = context.profile.grade12;
            }

            if (Object.keys(academicScores).length > 0) {
                payload.academic_scores = academicScores;
            }

            if (context.profile.transcript) {
                payload.transcript = context.profile.transcript;
            }
            if (certificates.length > 0) {
                payload.certificates = certificates;
            }
            if (ielts !== null) {
                payload.ielts = ielts;
            }
            if (tsaScore !== null) {
                payload.tsa_score = tsaScore;
            }
            if (hsaScore !== null) {
                payload.hsa_score = hsaScore;
            }

            payload.student_profile = {
                full_name: context.profile.fullName,
                city: context.profile.city,
                school_name: context.profile.schoolName,
                target_major: targetMajor || context.profile.targetMajor,
                target_university: targetUniversity || context.profile.targetUniversity,
                favorite_subjects: context.profile.favoriteSubjects,
                transcript: context.profile.transcript,
                certificates,
            };
        }

        const methodTag = (input.methodTag || '').trim();
        if (methodTag) {
            payload.method_tag = methodTag;
        }

        return payload;
    }

    private findCertificateScore(
        certificates: Array<{ type: string; score: number | null }>,
        type: string
    ): number | null {
        const normalizedType = type.trim().toUpperCase();
        const matched = certificates.find((item) => item.type.trim().toUpperCase() === normalizedType && typeof item.score === 'number');
        return typeof matched?.score === 'number' && Number.isFinite(matched.score) ? matched.score : null;
    }

    private findConversationAdvisorContext(userId: number, conversationId: number): ConversationAdvisorContext | null {
        const messages = this.qaRepository.listByConversationId(userId, conversationId, 100);
        for (const message of [...messages].reverse()) {
            const metadata = message.metadata;
            if (!metadata || typeof metadata !== 'object') {
                continue;
            }

            const rawContext = metadata.advisorContext;
            if (!rawContext || typeof rawContext !== 'object' || Array.isArray(rawContext)) {
                continue;
            }

            const context = rawContext as Record<string, unknown>;
            const universityCode = typeof context.universityCode === 'string' ? context.universityCode.trim() : '';
            const majorCode = typeof context.majorCode === 'string' ? context.majorCode.trim() : '';
            const majorName = typeof context.majorName === 'string' ? context.majorName.trim() : '';
            if (!universityCode || !majorName) {
                continue;
            }

            const targetYear = typeof context.targetYear === 'number' && Number.isFinite(context.targetYear)
                ? Math.round(context.targetYear)
                : null;

            return {
                universityCode,
                universityName: typeof context.universityName === 'string' ? context.universityName : null,
                majorCode,
                majorName,
                methodTag: typeof context.methodTag === 'string' ? context.methodTag : null,
                targetYear,
            };
        }

        return this.inferAdvisorContextFromConversation(messages);
    }

    private inferAdvisorContextFromConversation(messages: QAMessage[]): ConversationAdvisorContext | null {
        const combinedUserText = [...messages]
            .reverse()
            .filter((message) => message.role === 'user')
            .map((message) => message.message)
            .join('\n');

        const universityMatch = combinedUserText.match(/\b([A-Z]{3})\b/);
        const universityCode = universityMatch?.[1]?.trim().toUpperCase() || '';
        const majorMatch = combinedUserText.match(/ngành\s+(.+?)(?:\s+tại\s+|\s+theo\s+|\s+với\s+|\s+năm\s+|\n|$)/i);
        const majorName = majorMatch?.[1]?.trim().replace(/\b[A-Z]{3}\b$/, '').trim() || '';

        if (!universityCode || !majorName) {
            return null;
        }

        const yearMatch = combinedUserText.match(/\b(20\d{2}|19\d{2})\b/);
        const methodTag = /\bD01\b|\bA00\b|\bA01\b|\bD07\b|THPT|tốt nghiệp/i.test(combinedUserText)
            ? 'THPT_QG'
            : null;

        return {
            universityCode,
            universityName: null,
            majorCode: '',
            majorName,
            methodTag,
            targetYear: yearMatch ? Number(yearMatch[1]) : null,
        };
    }

    private buildAdvisePrompt(majorName: string, universityCode: string, universityName?: string | null): string {
        const normalizedUniversityName = (universityName || '').trim();
        const universityText = normalizedUniversityName
            ? `${universityCode} - ${normalizedUniversityName}`
            : universityCode;

        return [
            `Hãy nhận xét mức độ phù hợp của ngành ${majorName} tại ${universityText} với hồ sơ của tôi.`,
            'Phân tích điểm mạnh, rủi ro, phương thức xét tuyển nên ưu tiên và kế hoạch cải thiện.',
        ].join('\n');
    }

    private getAdvisorFallbackReason(error: AdvisorClientError): string {
        if (error.statusCode === 401 || error.statusCode === 403) {
            return 'unauthorized';
        }

        if (error.statusCode === 404) {
            return 'endpoint-not-found';
        }

        if (error.statusCode === 504) {
            return 'timeout';
        }

        return 'advisor-service-error';
    }

    private trimForAIContext(message: string): string {
        const normalized = (message || '').trim();
        if (normalized.length <= AI_CONTEXT_MESSAGE_MAX_LENGTH) {
            return normalized;
        }

        return `${normalized.slice(0, AI_CONTEXT_MESSAGE_MAX_LENGTH)}...`;
    }

    private getFallbackReason(error: unknown): string {
        if (error instanceof AIClientError) {
            if (error.statusCode === 401 || error.statusCode === 403) {
                return 'unauthorized';
            }

            if (error.statusCode === 404) {
                return 'endpoint-not-found';
            }

            if (error.statusCode === 504) {
                return 'timeout';
            }

            return 'ai-service-error';
        }

        return 'unavailable';
    }

    private buildRuleBasedAnswer(question: string, context: QAAnswerContext): string {
        const { profile, personality, latestReview } = context;

        const studentName = profile?.fullName ?? 'bạn';
        const mbtiText = personality ? `MBTI gần nhất của bạn là ${personality.mbtiType}.` : 'Bạn chưa có kết quả MBTI.';
        const targetParts = [profile?.targetMajor, profile?.targetUniversity]
            .map((value) => (value || '').trim())
            .filter((value) => value.length > 0);
        const profileTargetText = targetParts.length > 0
            ? `Mục tiêu hiện tại trong hồ sơ: ${targetParts.join(' - ')}.`
            : 'Bạn chưa cập nhật mục tiêu ngành/trường trong hồ sơ.';
        const reviewText = latestReview
            ? `Kết quả review gần nhất: ${latestReview.summary}`
            : 'Bạn chưa chạy review phù hợp.';

        return [
            `Chào ${studentName},`,
            `Mình đã nhận câu hỏi: "${question}".`,
            mbtiText,
            profileTargetText,
            reviewText,
            'Để bước tiếp theo hiệu quả hơn, bạn nên cập nhật đầy đủ hồ sơ và chạy lại review sau mỗi thay đổi lớn.',
        ].join(' ');
    }
}
