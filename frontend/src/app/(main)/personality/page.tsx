'use client';

import type { FormEvent, KeyboardEvent } from 'react';
import { useMemo, useRef, useState } from 'react';
import { Button, Card } from '@/components/ui';
import {
    useLatestPersonality,
    usePersonalityHistory,
    usePersonalityQuestions,
    useSubmitPersonality,
} from '@/hooks/usePersonality';
import { getApiErrorMessage } from '@/lib/api-error';
import type { PersonalityAnswer, PersonalitySubmission } from '@/services/personalityService';
import {
    canAdvanceFromQuestion,
    canSubmitCurrentStep,
    canSubmitQuiz,
    getNextQuestionIndex,
    getPersonalityQuizMode,
    type PersonalityTab,
} from './personality-flow';
import PersonalityHistoryView from './PersonalityHistoryView';
import PersonalityResultView from './PersonalityResultView';
import { assessmentTests, mapBackendQuestion } from './personality-tests';

const PERSONALITY_TABS: Array<{ id: PersonalityTab; label: string }> = [
    { id: 'quiz', label: 'Làm bài' },
    { id: 'result', label: 'Kết quả' },
    { id: 'history', label: 'Lịch sử' },
];

export default function PersonalityPage() {
    const questionsQuery = usePersonalityQuestions();
    const latestPersonalityQuery = useLatestPersonality();
    const submitMutation = useSubmitPersonality();

    const [activeTab, setActiveTab] = useState<PersonalityTab>('quiz');
    const [currentIndex, setCurrentIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<string, PersonalityAnswer>>({});
    const [submittedResult, setSubmittedResult] = useState<PersonalitySubmission | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const personalityHistoryQuery = usePersonalityHistory(activeTab === 'history');

    const questions = useMemo(
        () => (questionsQuery.data?.questions ?? []).map((question) => mapBackendQuestion(question)),
        [questionsQuery.data?.questions]
    );

    const test = assessmentTests[0];
    const currentQuestion = questions[currentIndex];
    const questionIds = useMemo(() => questions.map((question) => question.id), [questions]);
    const answeredCount = questions.filter((question) => answers[question.id]).length;
    const canSubmit = canSubmitQuiz(answers, questionIds);
    const isLastQuestion = currentIndex === questions.length - 1;
    const canSubmitCurrentQuestion = canSubmitCurrentStep(isLastQuestion, canSubmit);
    const currentQuestionAnswered = currentQuestion ? canAdvanceFromQuestion(answers, currentQuestion.id) : false;
    const progressWidth = questions.length > 0 ? ((currentIndex + 1) / questions.length) * 100 : 0;
    const latestSubmission = latestPersonalityQuery.data?.submission ?? null;
    const resultSubmission = submittedResult ?? latestSubmission;
    const historySubmissions = personalityHistoryQuery.data?.submissions ?? [];
    const quizMode = getPersonalityQuizMode({
        questionsCount: questions.length,
        submittedResult,
        isLoading: questionsQuery.isLoading,
        isError: questionsQuery.isError,
    });

    const resetTestProgress = () => {
        setActiveTab('quiz');
        setCurrentIndex(0);
        setAnswers({});
        setSubmittedResult(null);
        setErrorMessage(null);
    };

    const handleTabChange = (tab: PersonalityTab) => {
        if (tab === 'quiz' && submittedResult) {
            resetTestProgress();
            return;
        }

        setActiveTab(tab);
    };

    const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tabIndex: number) => {
        const lastIndex = PERSONALITY_TABS.length - 1;
        let nextIndex = tabIndex;

        if (event.key === 'ArrowRight') {
            nextIndex = tabIndex === lastIndex ? 0 : tabIndex + 1;
        } else if (event.key === 'ArrowLeft') {
            nextIndex = tabIndex === 0 ? lastIndex : tabIndex - 1;
        } else if (event.key === 'Home') {
            nextIndex = 0;
        } else if (event.key === 'End') {
            nextIndex = lastIndex;
        } else {
            return;
        }

        event.preventDefault();
        handleTabChange(PERSONALITY_TABS[nextIndex].id);
        tabRefs.current[nextIndex]?.focus();
    };

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setErrorMessage(null);

        if (!canSubmitCurrentQuestion) {
            return;
        }

        try {
            const response = await submitMutation.mutateAsync({ answers });
            setSubmittedResult(response.submission);
            setActiveTab('result');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'Không thể nộp bài đánh giá'));
        }
    };

    return (
        <main className="space-y-5">
            <div className="space-y-1">
                <h1 className="text-2xl font-semibold text-slate-900">Đánh giá tính cách</h1>
                <p className="text-sm text-slate-600">
                    Hoàn thành {test.title} bằng câu hỏi từ hệ thống để nhận kết quả MBTI và điểm theo từng cặp tính cách.
                </p>
            </div>

            <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm" role="tablist">
                {PERSONALITY_TABS.map((tab, index) => {
                    const isActive = activeTab === tab.id;

                    return (
                        <button
                            key={tab.id}
                            ref={(element) => {
                                tabRefs.current[index] = element;
                            }}
                            id={`personality-tab-${tab.id}`}
                            type="button"
                            role="tab"
                            aria-controls={`personality-panel-${tab.id}`}
                            aria-selected={isActive}
                            tabIndex={isActive ? 0 : -1}
                            onClick={() => handleTabChange(tab.id)}
                            onKeyDown={(event) => handleTabKeyDown(event, index)}
                            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 ${
                                isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                            }`}
                        >
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {activeTab === 'quiz' && (
                <section
                    id="personality-panel-quiz"
                    role="tabpanel"
                    aria-labelledby="personality-tab-quiz"
                    tabIndex={0}
                    className="space-y-5 focus:outline-none"
                >
                    <Card className="space-y-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1">
                                <h2 className="text-lg font-semibold text-slate-900">{test.title}</h2>
                                <p className="text-sm text-slate-600">{test.description}</p>
                                <p className="text-sm text-slate-700">
                                    Tiến độ: {answeredCount}/{questions.length} câu đã trả lời
                                </p>
                                <p className="text-sm text-slate-700">
                                    Mỗi câu là một bước riêng. Bạn cần chọn đáp án hiện tại để đi tiếp và không thể quay lại câu trước.
                                </p>
                            </div>
                        </div>
                    </Card>

                    <Card className="space-y-4">
                        {quizMode === 'loading' ? (
                            <p className="text-sm text-slate-700">Đang tải câu hỏi MBTI...</p>
                        ) : quizMode === 'error' ? (
                            <p className="text-sm text-red-700">Không tải được câu hỏi MBTI.</p>
                        ) : quizMode === 'empty' ? (
                            <p className="text-sm text-slate-700">Chưa có câu hỏi MBTI từ hệ thống.</p>
                        ) : (
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <p className="text-sm font-medium text-slate-600" aria-live="polite">
                                        Câu {currentIndex + 1}/{questions.length}
                                    </p>
                                    <div
                                        className="h-2 w-full overflow-hidden rounded-full bg-slate-100 md:w-56"
                                        role="progressbar"
                                        aria-label="Tiến độ làm bài"
                                        aria-valuemin={1}
                                        aria-valuemax={questions.length}
                                        aria-valuenow={currentIndex + 1}
                                    >
                                        <div className="h-full rounded-full bg-slate-900" style={{ width: `${progressWidth}%` }} />
                                    </div>
                                </div>

                                <fieldset className="rounded-md border border-slate-200 p-4">
                                    <legend className="text-base font-semibold text-slate-900">{currentQuestion.prompt}</legend>
                                    <div className="mt-4 grid gap-2">
                                        {currentQuestion.choices.map((choice) => (
                                            <label
                                                key={choice.value}
                                                className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-200 p-3 text-sm text-slate-800 hover:bg-slate-50"
                                            >
                                                <input
                                                    type="radio"
                                                    name={currentQuestion.id}
                                                    value={choice.value}
                                                    checked={answers[currentQuestion.id] === choice.value}
                                                    onChange={() =>
                                                        setAnswers((previous) => ({
                                                            ...previous,
                                                            [currentQuestion.id]: choice.value,
                                                        }))
                                                    }
                                                />
                                                <span>
                                                    <strong className="mr-2 text-slate-900">{choice.value}</strong>
                                                    {choice.label}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                </fieldset>

                                <div className="flex justify-end">
                                    {isLastQuestion ? (
                                        <Button type="submit" disabled={submitMutation.isPending || !canSubmitCurrentQuestion}>
                                            {submitMutation.isPending ? 'Đang nộp...' : 'Nộp bài'}
                                        </Button>
                                    ) : (
                                        <Button
                                            type="button"
                                            disabled={!currentQuestionAnswered}
                                            onClick={() =>
                                                setCurrentIndex((index) =>
                                                    getNextQuestionIndex(index, questions.length, currentQuestion.id, answers)
                                                )
                                            }
                                        >
                                            Tiếp theo
                                        </Button>
                                    )}
                                </div>
                            </form>
                        )}

                        {errorMessage && <p className="text-sm text-red-700" role="alert">{errorMessage}</p>}
                    </Card>
                </section>
            )}

            {activeTab === 'result' && (
                <section
                    id="personality-panel-result"
                    role="tabpanel"
                    aria-labelledby="personality-tab-result"
                    tabIndex={0}
                    className="focus:outline-none"
                    aria-live="polite"
                >
                    {resultSubmission ? (
                        <PersonalityResultView submission={resultSubmission} onRetake={resetTestProgress} />
                    ) : latestPersonalityQuery.isLoading ? (
                        <Card>
                            <p className="text-sm text-slate-700">Đang tải kết quả đánh giá mới nhất...</p>
                        </Card>
                    ) : latestPersonalityQuery.isError ? (
                        <Card>
                            <p className="text-sm text-red-700">Không tải được kết quả đánh giá mới nhất.</p>
                        </Card>
                    ) : (
                        <Card className="space-y-3">
                            <h2 className="text-lg font-semibold text-slate-900">Chưa có kết quả đánh giá</h2>
                            <p className="text-sm text-slate-700">
                                Hãy hoàn thành bài MBTI để xem tổng điểm, nhận xét theo 4 nhóm và gợi ý cải thiện.
                            </p>
                            <Button type="button" onClick={() => setActiveTab('quiz')}>
                                Làm bài MBTI
                            </Button>
                        </Card>
                    )}
                </section>
            )}

            {activeTab === 'history' && (
                <section
                    id="personality-panel-history"
                    role="tabpanel"
                    aria-labelledby="personality-tab-history"
                    tabIndex={0}
                    className="focus:outline-none"
                    aria-live="polite"
                >
                    <PersonalityHistoryView
                        submissions={historySubmissions}
                        isLoading={personalityHistoryQuery.isLoading}
                        isError={personalityHistoryQuery.isError}
                    />
                </section>
            )}
        </main>
    );
}
