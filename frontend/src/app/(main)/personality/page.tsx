'use client';

import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { Button, Card } from '@/components/ui';
import { useLatestPersonality, usePersonalityQuestions, useSubmitPersonality } from '@/hooks/usePersonality';
import { getApiErrorMessage } from '@/lib/api-error';
import {
    ASSESSMENT_TESTS,
    LOCAL_TEST_QUESTIONS,
    type AssessmentQuestion,
    type AssessmentResult,
    type AssessmentTestId,
    scoreAssessment,
    toMbtiAssessmentQuestions,
    toMbtiPayload,
} from './personality-tests';

export default function PersonalityPage() {
    const questionsQuery = usePersonalityQuestions();
    const latestQuery = useLatestPersonality();
    const submitMutation = useSubmitPersonality();

    const [selectedTestId, setSelectedTestId] = useState<AssessmentTestId | null>(null);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [result, setResult] = useState<AssessmentResult | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const mbtiQuestions = useMemo(
        () => toMbtiAssessmentQuestions(questionsQuery.data?.questions ?? []),
        [questionsQuery.data?.questions]
    );

    const activeQuestions = useMemo<AssessmentQuestion[]>(() => {
        if (!selectedTestId) {
            return [];
        }

        if (selectedTestId === 'mbti') {
            return mbtiQuestions;
        }

        return LOCAL_TEST_QUESTIONS[selectedTestId];
    }, [mbtiQuestions, selectedTestId]);

    const selectedTest = selectedTestId
        ? ASSESSMENT_TESTS.find((test) => test.id === selectedTestId) ?? null
        : null;
    const currentQuestion = activeQuestions[currentIndex];
    const answeredCount = activeQuestions.filter((question) => answers[question.id]).length;
    const allAnswered = activeQuestions.length > 0 && answeredCount === activeQuestions.length;
    const isFirstQuestion = currentIndex === 0;
    const isLastQuestion = currentIndex === activeQuestions.length - 1;

    const resetTestProgress = () => {
        setCurrentIndex(0);
        setAnswers({});
        setResult(null);
        setErrorMessage(null);
    };

    const handleSelectTest = (testId: AssessmentTestId) => {
        setSelectedTestId(testId);
        resetTestProgress();
    };

    const handleBackToSelection = () => {
        setSelectedTestId(null);
        resetTestProgress();
    };

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setErrorMessage(null);
        setResult(null);

        if (!selectedTestId) {
            setErrorMessage('Vui lòng chọn bài kiểm tra trước khi làm bài.');
            return;
        }

        if (!allAnswered) {
            setErrorMessage('Vui lòng trả lời tất cả câu hỏi trước khi nộp bài.');
            return;
        }

        try {
            if (selectedTestId === 'mbti') {
                const response = await submitMutation.mutateAsync({ answers: toMbtiPayload(answers) });
                setResult(scoreAssessment(selectedTestId, activeQuestions, answers, response.submission.mbtiType));
                return;
            }

            setResult(scoreAssessment(selectedTestId, activeQuestions, answers));
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'Không thể nộp bài đánh giá'));
        }
    };

    return (
        <main className="space-y-5">
            <div className="space-y-1">
                <h1 className="text-2xl font-semibold text-slate-900">Đánh giá tính cách</h1>
                <p className="text-sm text-slate-600">
                    Chọn bài kiểm tra trước, sau đó hệ thống sẽ hiển thị từng câu hỏi để bạn làm bài.
                </p>
            </div>

            {!selectedTest && !result && (
                <Card className="space-y-4">
                    <div className="space-y-1">
                        <h2 className="text-lg font-semibold text-slate-900">Chọn bài kiểm tra</h2>
                        <p className="text-sm text-slate-600">
                            Nội dung câu hỏi chỉ hiển thị sau khi bạn chọn MBTI, EQ hoặc DISC.
                        </p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                        {ASSESSMENT_TESTS.map((test) => (
                            <button
                                key={test.id}
                                type="button"
                                className="rounded-lg border border-slate-200 bg-white p-4 text-left text-slate-900 transition-colors hover:border-slate-900 hover:bg-slate-50"
                                onClick={() => handleSelectTest(test.id)}
                            >
                                <span className="text-lg font-semibold">{test.name}</span>
                                <span className="mt-2 block text-sm text-slate-600">{test.description}</span>
                                <span className="mt-3 inline-flex text-sm font-medium text-slate-900">Bắt đầu làm bài</span>
                            </button>
                        ))}
                    </div>
                </Card>
            )}

            {selectedTest && !result && (
                <>
                    <Card className="space-y-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <h2 className="text-lg font-semibold text-slate-900">Bài kiểm tra đang làm: {selectedTest.name}</h2>
                                {selectedTestId === 'mbti' && (
                                    <p className="mt-1 text-sm text-slate-700">
                                        Kết quả MBTI gần nhất: <strong>{latestQuery.data?.submission?.mbtiType ?? 'Chưa có'}</strong>
                                    </p>
                                )}
                                <p className="mt-1 text-sm text-slate-700">
                                    Đã trả lời: {answeredCount}/{activeQuestions.length}
                                </p>
                                {selectedTestId !== 'mbti' && (
                                    <p className="mt-1 text-sm text-amber-700">
                                        EQ và DISC được chấm trực tiếp trên giao diện trong phiên bản này.
                                    </p>
                                )}
                            </div>
                            <Button type="button" variant="secondary" onClick={handleBackToSelection}>
                                Đổi bài kiểm tra
                            </Button>
                        </div>
                    </Card>

                    <Card className="space-y-4">
                        {selectedTestId === 'mbti' && questionsQuery.isLoading ? (
                            <p className="text-sm text-slate-700">Đang tải câu hỏi MBTI...</p>
                        ) : selectedTestId === 'mbti' && questionsQuery.isError ? (
                            <p className="text-sm text-red-700">Không tải được câu hỏi MBTI.</p>
                        ) : !currentQuestion ? (
                            <p className="text-sm text-slate-700">Chưa có câu hỏi cho bài kiểm tra này.</p>
                        ) : (
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <p className="text-sm font-medium text-slate-600">
                                        Câu {currentIndex + 1}/{activeQuestions.length}
                                    </p>
                                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 md:w-56">
                                        <div
                                            className="h-full rounded-full bg-slate-900"
                                            style={{ width: `${((currentIndex + 1) / activeQuestions.length) * 100}%` }}
                                        />
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
                                                <span>{choice.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex flex-wrap justify-between gap-2">
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        disabled={isFirstQuestion}
                                        onClick={() => setCurrentIndex((index) => Math.max(index - 1, 0))}
                                    >
                                        Trước
                                    </Button>
                                    {isLastQuestion ? (
                                        <Button type="submit" disabled={submitMutation.isPending || !allAnswered}>
                                            {submitMutation.isPending ? 'Đang nộp...' : 'Nộp bài'}
                                        </Button>
                                    ) : (
                                        <Button
                                            type="button"
                                            disabled={!answers[currentQuestion.id]}
                                            onClick={() => setCurrentIndex((index) => Math.min(index + 1, activeQuestions.length - 1))}
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

            {result && selectedTest && (
                <Card className="space-y-3 border-slate-900">
                    <h2 className="text-lg font-semibold text-slate-900">Kết quả đánh giá</h2>
                    <p className="text-sm text-slate-600">Bài kiểm tra: {selectedTest.name}</p>
                    <p className="text-base font-semibold text-slate-900">{result.title}</p>
                    <div>
                        <p className="text-sm font-semibold text-slate-900">Nhận xét tính cách</p>
                        <p className="mt-1 text-sm text-slate-700">{result.summary}</p>
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-slate-900">Gợi ý học tập</p>
                        <p className="mt-1 text-sm text-slate-700">{result.recommendation}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="secondary" onClick={resetTestProgress}>
                            Làm lại bài này
                        </Button>
                        <Button type="button" variant="secondary" onClick={handleBackToSelection}>
                            Chọn bài kiểm tra khác
                        </Button>
                    </div>
                </Card>
            )}
        </main>
    );
}
