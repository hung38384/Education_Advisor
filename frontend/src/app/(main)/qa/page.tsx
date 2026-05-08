'use client';

import type { FormEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Textarea } from '@/components/ui';
import {
    useAskQuestion,
    useCreateConversation,
    useDeleteConversation,
    useQaConversations,
    useQaMessages,
} from '@/hooks/useQa';
import type { QAConversation, QAMessageMetadata } from '@/services/qaService';
import { getApiErrorMessage } from '@/lib/api-error';

function truncatePreview(message: string | null, maxLength: number = 56): string {
    const normalized = (message || '').trim();
    if (!normalized) {
        return 'Chưa có tin nhắn';
    }

    if (normalized.length <= maxLength) {
        return normalized;
    }

    return `${normalized.slice(0, maxLength)}...`;
}

function asNonEmptyString(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
}

function formatLatencyLabel(latencyMs: unknown): string | null {
    if (typeof latencyMs !== 'number' || !Number.isFinite(latencyMs) || latencyMs < 0) {
        return null;
    }

    return `${Math.round(latencyMs)} mili giây`;
}

function getMessageRoleLabel(role: string): string {
    return role === 'assistant' ? 'Trợ lý' : 'Bạn';
}

function getToolsUsed(metadata: QAMessageMetadata | null): string[] {
    const tools = metadata?.ai?.toolsUsed;
    if (!Array.isArray(tools)) {
        return [];
    }

    return tools
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
}

export default function QAPage() {
    const conversationsQuery = useQaConversations();
    const createConversationMutation = useCreateConversation();
    const deleteConversationMutation = useDeleteConversation();
    const askMutation = useAskQuestion();

    const [selectedConversationId, setSelectedConversationId] = useState<number | undefined>(undefined);
    const [question, setQuestion] = useState('');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const bottomRef = useRef<HTMLDivElement | null>(null);

    const conversations = useMemo(
        () => conversationsQuery.data?.conversations ?? [],
        [conversationsQuery.data?.conversations]
    );

    useEffect(() => {
        if (conversations.length === 0) {
            setSelectedConversationId(undefined);
            return;
        }

        if (
            selectedConversationId === undefined ||
            !conversations.some((item) => item.id === selectedConversationId)
        ) {
            setSelectedConversationId(conversations[0].id);
        }
    }, [conversations, selectedConversationId]);

    const messagesQuery = useQaMessages(selectedConversationId);
    const messages = messagesQuery.data?.messages ?? [];
    const activeConversation = useMemo<QAConversation | undefined>(
        () => conversations.find((item) => item.id === selectedConversationId),
        [conversations, selectedConversationId]
    );

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages.length]);

    const handleCreateConversation = async () => {
        setErrorMessage(null);

        try {
            const result = await createConversationMutation.mutateAsync(undefined);
            setSelectedConversationId(result.conversation.id);
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'Không tạo được cuộc trò chuyện mới'));
        }
    };

    const handleDeleteConversation = async (conversationId: number) => {
        setErrorMessage(null);

        const fallbackConversation = conversations.find((item) => item.id !== conversationId);
        if (selectedConversationId === conversationId) {
            setSelectedConversationId(fallbackConversation?.id);
        }

        try {
            await deleteConversationMutation.mutateAsync(conversationId);
        } catch (error) {
            if (selectedConversationId === conversationId) {
                setSelectedConversationId(conversationId);
            }
            setErrorMessage(getApiErrorMessage(error, 'Không xóa được cuộc trò chuyện'));
        }
    };

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setErrorMessage(null);

        const normalizedQuestion = question.trim();
        if (!normalizedQuestion) {
            return;
        }

        try {
            let conversationId = selectedConversationId;
            if (conversationId === undefined) {
                const created = await createConversationMutation.mutateAsync(undefined);
                conversationId = created.conversation.id;
                setSelectedConversationId(conversationId);
            }

            const result = await askMutation.mutateAsync({
                question: normalizedQuestion,
                conversationId,
            });
            setQuestion('');
            setSelectedConversationId(result.conversationId);
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'Không gửi được câu hỏi'));
        }
    };

    const isBusy =
        askMutation.isPending ||
        createConversationMutation.isPending ||
        deleteConversationMutation.isPending;

    return (
        <main className="space-y-5">
            <h1 className="text-2xl font-semibold text-slate-900">Trợ lý AI</h1>

            <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
                <Card className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                            Cuộc trò chuyện
                        </h2>
                        <Button
                            type="button"
                            variant="secondary"
                            className="px-3 py-1.5 text-xs"
                            onClick={handleCreateConversation}
                            disabled={isBusy}
                        >
                            + Mới
                        </Button>
                    </div>

                    <div className="max-h-[540px] space-y-2 overflow-y-auto">
                        {conversationsQuery.isLoading ? (
                            <p className="text-sm text-slate-600">Đang tải danh sách...</p>
                        ) : conversations.length === 0 ? (
                            <p className="text-sm text-slate-600">Chưa có cuộc trò chuyện nào.</p>
                        ) : (
                            conversations.map((conversation) => {
                                const isSelected = selectedConversationId === conversation.id;
                                return (
                                    <div
                                        key={conversation.id}
                                        className={[
                                            'flex items-start justify-between gap-2 rounded-md border p-2',
                                            isSelected
                                                ? 'border-slate-900 bg-slate-900 text-white'
                                                : 'border-slate-200 bg-white text-slate-900',
                                        ].join(' ')}
                                    >
                                        <button
                                            type="button"
                                            className="flex-1 text-left"
                                            onClick={() => setSelectedConversationId(conversation.id)}
                                        >
                                            <p className="truncate text-sm font-medium">{conversation.title}</p>
                                            <p
                                                className={[
                                                    'mt-1 text-xs',
                                                    isSelected ? 'text-slate-200' : 'text-slate-500',
                                                ].join(' ')}
                                            >
                                                {truncatePreview(conversation.lastMessage)}
                                            </p>
                                        </button>
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            className="px-2 py-1 text-xs"
                                            onClick={() => handleDeleteConversation(conversation.id)}
                                            disabled={isBusy}
                                        >
                                            Xóa
                                        </Button>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </Card>

                <Card className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                            {activeConversation?.title || 'Chưa chọn cuộc trò chuyện'}
                        </h2>
                        {activeConversation && (
                            <Button
                                type="button"
                                variant="secondary"
                                className="px-3 py-1.5 text-xs"
                                onClick={() => handleDeleteConversation(activeConversation.id)}
                                disabled={isBusy}
                            >
                                Xóa cuộc trò chuyện
                            </Button>
                        )}
                    </div>

                    <div className="max-h-[420px] space-y-3 overflow-y-auto rounded-md border border-slate-200 p-3">
                        {!activeConversation ? (
                            <p className="text-sm text-slate-700">Hãy tạo cuộc trò chuyện mới để bắt đầu.</p>
                        ) : messagesQuery.isLoading ? (
                            <p className="text-sm text-slate-700">Đang tải nội dung...</p>
                        ) : messages.length === 0 ? (
                            <p className="text-sm text-slate-700">Cuộc trò chuyện này chưa có tin nhắn.</p>
                        ) : (
                            messages.map((item) => {
                                const toolsUsed = getToolsUsed(item.metadata);
                                const strategy = asNonEmptyString(item.metadata?.strategy);
                                const provider = asNonEmptyString(item.metadata?.ai?.provider);
                                const model = asNonEmptyString(item.metadata?.ai?.model);
                                const fallbackReason = asNonEmptyString(item.metadata?.fallbackReason);
                                const mode = asNonEmptyString(item.metadata?.ai?.mode);
                                const unavailableReason = asNonEmptyString(item.metadata?.ai?.unavailableReason);
                                const latencyLabel = formatLatencyLabel(item.metadata?.ai?.latencyMs);
                                const scoreRecoveryApplied = item.metadata?.ai?.scoreRecoveryApplied === true;

                                const hasMetadataDetails =
                                    Boolean(strategy) ||
                                    Boolean(provider) ||
                                    Boolean(model) ||
                                    Boolean(latencyLabel) ||
                                    toolsUsed.length > 0 ||
                                    Boolean(fallbackReason) ||
                                    Boolean(mode) ||
                                    Boolean(unavailableReason) ||
                                    scoreRecoveryApplied;

                                return (
                                    <div
                                        key={item.id}
                                        className={[
                                            'rounded-md p-3 text-sm',
                                            item.role === 'assistant'
                                                ? 'bg-slate-100 text-slate-900'
                                                : 'bg-slate-900 text-white',
                                        ].join(' ')}
                                    >
                                        <p className="mb-1 text-xs uppercase tracking-wide opacity-80">{getMessageRoleLabel(item.role)}</p>
                                        <p className="whitespace-pre-wrap break-words">{item.message}</p>

                                        {item.role === 'assistant' && hasMetadataDetails && (
                                            <div className="mt-2 space-y-1 border-t border-slate-300 pt-2 text-xs text-slate-700">
                                                <div className="flex flex-wrap gap-2">
                                                    {strategy && (
                                                        <span className="rounded bg-slate-200 px-2 py-0.5">
                                                            Chiến lược: {strategy}
                                                        </span>
                                                    )}
                                                    {provider && (
                                                        <span className="rounded bg-slate-200 px-2 py-0.5">
                                                            Nhà cung cấp: {provider}
                                                        </span>
                                                    )}
                                                    {model && (
                                                        <span className="rounded bg-slate-200 px-2 py-0.5">
                                                            Mô hình: {model}
                                                        </span>
                                                    )}
                                                    {latencyLabel && (
                                                        <span className="rounded bg-slate-200 px-2 py-0.5">
                                                            Độ trễ: {latencyLabel}
                                                        </span>
                                                    )}
                                                </div>

                                                {toolsUsed.length > 0 && (
                                                    <p>
                                                        <span className="font-medium">Công cụ:</span>{' '}
                                                        {toolsUsed.join(', ')}
                                                    </p>
                                                )}

                                                {fallbackReason && (
                                                    <p>
                                                        <span className="font-medium">Lý do dùng phương án dự phòng:</span>{' '}
                                                        {fallbackReason}
                                                    </p>
                                                )}

                                                {mode && (
                                                    <p>
                                                        <span className="font-medium">Chế độ:</span>{' '}
                                                        {mode}
                                                    </p>
                                                )}

                                                {unavailableReason && (
                                                    <p>
                                                        <span className="font-medium">Lý do không khả dụng:</span>{' '}
                                                        {unavailableReason}
                                                    </p>
                                                )}

                                                {scoreRecoveryApplied && (
                                                    <p>
                                                        <span className="font-medium">Khôi phục điểm:</span>{' '}
                                                        Đã áp dụng
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                        <div ref={bottomRef} />
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-3">
                        <Textarea
                            rows={4}
                            placeholder="Nhập câu hỏi về đề án tuyển sinh..."
                            value={question}
                            onChange={(event) => setQuestion(event.target.value)}
                            required
                        />
                        <Button type="submit" disabled={isBusy}>
                            {askMutation.isPending ? 'Đang gửi...' : 'Gửi câu hỏi'}
                        </Button>
                    </form>

                    {errorMessage && <p className="text-sm text-red-700">{errorMessage}</p>}
                </Card>
            </div>
        </main>
    );
}
