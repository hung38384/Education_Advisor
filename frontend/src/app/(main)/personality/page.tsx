'use client';

import Link from 'next/link';
import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { Button, Card } from '@/components/ui';
import { usePersonalityQuestions, useSubmitPersonality } from '@/hooks/usePersonality';
import { getApiErrorMessage } from '@/lib/api-error';
import type { PersonalityAnswer, PersonalitySubmission } from '@/services/personalityService';
import {
    canAdvanceFromQuestion,
    canSubmitCurrentStep,
    canSubmitQuiz,
    getNextQuestionIndex,
    getPersonalityQuizMode,
} from './personality-flow';
import { assessmentTests, mapBackendQuestion } from './personality-tests';

export default function PersonalityPage() {
    const questionsQuery = usePersonalityQuestions();
    const submitMutation = useSubmitPersonality();

    const [currentIndex, setCurrentIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<string, PersonalityAnswer>>({});
    const [submittedResult, setSubmittedResult] = useState<PersonalitySubmission | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
    const quizMode = getPersonalityQuizMode({
        questionsCount: questions.length,
        submittedResult,
        latestSubmission: null,
        isLoading: questionsQuery.isLoading,
        isError: questionsQuery.isError,
    });

    const resetTestProgress = () => {
        setCurrentIndex(0);
        setAnswers({});
        setSubmittedResult(null);
        setErrorMessage(null);
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

            {quizMode !== 'result' && (
                <>
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
                                    <p className="text-sm font-medium text-slate-600">
                                        Câu {currentIndex + 1}/{questions.length}
                                    </p>
                                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 md:w-56">
                                        <div className="h-full rounded-full bg-slate-900" style={{ width: `${progressWidth}%` }} />
                                    </div>
                                </div>

                                <div className="rounded-md border border-slate-200 p-4">
                                    <p className="text-base font-semibold text-slate-900">{currentQuestion.prompt}</p>
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
                                </div>

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

                        {errorMessage && <p className="text-sm text-red-700">{errorMessage}</p>}
                    </Card>
                </>
            )}

            {quizMode === 'result' && submittedResult && (
                <Card className="space-y-3 border-slate-900">
                    <h2 className="text-lg font-semibold text-slate-900">Kết quả đánh giá</h2>
                    <p className="text-base font-semibold text-slate-900">Kết quả MBTI: {submittedResult.mbtiType}</p>
                    <div className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                        <p>E {submittedResult.scores.E} - I {submittedResult.scores.I}</p>
                        <p>S {submittedResult.scores.S} - N {submittedResult.scores.N}</p>
                        <p>T {submittedResult.scores.T} - F {submittedResult.scores.F}</p>
                        <p>J {submittedResult.scores.J} - P {submittedResult.scores.P}</p>
                    </div>
                    <p className="text-sm text-slate-600">
                        Kết quả này sẽ được dùng cùng hồ sơ học tập để gợi ý mức độ phù hợp ngành và trường.
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="secondary" onClick={resetTestProgress}>
                            Làm lại bài này
                        </Button>
                        <Link
                            href="/review"
                            className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400"
                        >
                            Sang trang đánh giá phù hợp
                        </Link>
                    </div>
                </Card>
            )}
        </main>
    );
}
