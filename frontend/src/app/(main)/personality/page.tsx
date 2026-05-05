'use client';

import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { Button, Card } from '@/components/ui';
import { useLatestPersonality, usePersonalityQuestions, useSubmitPersonality } from '@/hooks/usePersonality';
import { getApiErrorMessage } from '@/lib/api-error';
import type { PersonalityAnswer } from '@/services/personalityService';

export default function PersonalityPage() {
    const questionsQuery = usePersonalityQuestions();
    const latestQuery = useLatestPersonality();
    const submitMutation = useSubmitPersonality();
    const [answers, setAnswers] = useState<Record<string, PersonalityAnswer>>({});
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const totalQuestions = questionsQuery.data?.questions.length ?? 0;
    const answeredCount = useMemo(() => Object.keys(answers).length, [answers]);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setErrorMessage(null);
        setMessage(null);

        try {
            const result = await submitMutation.mutateAsync({ answers });
            setMessage(`Submitted. Latest MBTI: ${result.submission.mbtiType}`);
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'Unable to submit personality test'));
        }
    };

    return (
        <main className="space-y-5">
            <h1 className="text-2xl font-semibold text-slate-900">Personality Test</h1>

            <Card className="space-y-2">
                <p className="text-sm text-slate-700">Answered: {answeredCount}/{totalQuestions}</p>
                <p className="text-sm text-slate-700">
                    Latest MBTI: <strong>{latestQuery.data?.submission?.mbtiType ?? 'Not available'}</strong>
                </p>
            </Card>

            <Card className="space-y-4">
                <form onSubmit={handleSubmit} className="space-y-4">
                    {questionsQuery.data?.questions.map((question) => (
                        <div key={question.id} className="rounded-md border border-slate-200 p-4">
                            <p className="text-sm font-medium text-slate-900">{question.prompt}</p>
                            <p className="mt-1 text-xs text-slate-500">Dimension: {question.dimension}</p>

                            <div className="mt-3 grid gap-2">
                                <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
                                    <input
                                        type="radio"
                                        name={question.id}
                                        checked={answers[question.id] === 'A'}
                                        onChange={() => setAnswers((prev) => ({ ...prev, [question.id]: 'A' }))}
                                    />
                                    <span>{question.optionA}</span>
                                </label>
                                <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
                                    <input
                                        type="radio"
                                        name={question.id}
                                        checked={answers[question.id] === 'B'}
                                        onChange={() => setAnswers((prev) => ({ ...prev, [question.id]: 'B' }))}
                                    />
                                    <span>{question.optionB}</span>
                                </label>
                            </div>
                        </div>
                    ))}

                    <Button type="submit" disabled={submitMutation.isPending || totalQuestions === 0}>
                        {submitMutation.isPending ? 'Submitting...' : 'Submit personality test'}
                    </Button>
                </form>

                {message && <p className="text-sm text-green-700">{message}</p>}
                {errorMessage && <p className="text-sm text-red-700">{errorMessage}</p>}
            </Card>
        </main>
    );
}
