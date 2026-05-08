import { QAConversation, QAMessage } from '../model/qa.model';
import { ReviewRepository } from '../repository/review.repository';
import { PersonalityRepository } from '../repository/personality.repository';
import { QARepository } from '../repository/qa.repository';
import { StudentProfileRepository } from '../repository/student-profile.repository';
import { AIClientError, QAInferenceClient } from '../clients/ai.client';

export interface QAHistoryResult {
    conversationId: number | null;
    messages: QAMessage[];
}

export interface QAConversationsResult {
    conversations: QAConversation[];
}

export interface CreateConversationResult {
    conversation: QAConversation;
}

export interface AskQuestionResult {
    answer: string;
    conversationId: number;
    userMessage: QAMessage;
    assistantMessage: QAMessage;
}

const AI_CONTEXT_HISTORY_LIMIT = 20;
const AI_CONTEXT_MESSAGE_MAX_LENGTH = 3500;
const CONVERSATION_TITLE_MAX_LENGTH = 120;
const DEFAULT_CONVERSATION_TITLE = 'Cuộc trò chuyện mới';

interface QAAnswerContext {
    profile: ReturnType<StudentProfileRepository['findByUserId']>;
    personality: ReturnType<PersonalityRepository['findLatestByUserId']>;
    latestReview: ReturnType<ReviewRepository['findLatestByUserId']>;
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
        private qaInferenceClient: QAInferenceClient | null = null
    ) { }

    listConversations(userId: number): QAConversationsResult {
        return {
            conversations: this.qaRepository.listConversationsByUserId(userId, 100),
        };
    }

    createConversation(userId: number, title?: string): CreateConversationResult {
        const normalizedTitle = this.normalizeConversationTitle(title);
        const conversation = this.qaRepository.createConversation({
            userId,
            title: normalizedTitle,
        });

        if (!conversation) {
            throw new QAServiceError('Không thể tạo cuộc trò chuyện', 500);
        }

        return { conversation };
    }

    deleteConversation(userId: number, conversationId: number): { message: string } {
        const existing = this.ensureConversationOwnership(userId, conversationId);
        if (!existing) {
            throw new QAServiceError('Không tìm thấy cuộc trò chuyện', 404);
        }

        const deleted = this.qaRepository.deleteConversation(userId, conversationId);
        if (!deleted) {
            throw new QAServiceError('Không thể xóa cuộc trò chuyện', 500);
        }

        return { message: 'Đã xóa cuộc trò chuyện thành công' };
    }

    listMessages(userId: number, conversationId?: number): QAHistoryResult {
        const resolvedConversationId = this.resolveConversationIdForRead(userId, conversationId);
        if (resolvedConversationId === null) {
            return {
                conversationId: null,
                messages: [],
            };
        }

        return {
            conversationId: resolvedConversationId,
            messages: this.qaRepository.listByConversationId(userId, resolvedConversationId, 300),
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
        const answerResult = await this.generateAnswer(
            userId,
            resolvedConversationId,
            normalizedQuestion,
            context
        );

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

        return {
            answer: answerResult.answer,
            conversationId: resolvedConversationId,
            userMessage,
            assistantMessage,
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

        const created = this.qaRepository.createConversation({
            userId,
            title: DEFAULT_CONVERSATION_TITLE,
        });
        if (!created) {
            throw new QAServiceError('Không thể tạo cuộc trò chuyện', 500);
        }

        return created.id;
    }

    private async generateAnswer(
        userId: number,
        conversationId: number,
        question: string,
        context: QAAnswerContext
    ): Promise<{ answer: string; metadata: Record<string, unknown> }> {
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
