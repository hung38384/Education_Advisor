'use client';

import { Button, Card } from '@/components/ui';
import { useLatestReview, useRunReview } from '@/hooks/useReview';
import { getApiErrorMessage } from '@/lib/api-error';
import { useState } from 'react';

export default function ReviewPage() {
    const latestQuery = useLatestReview();
    const runMutation = useRunReview();
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const result = latestQuery.data?.result ?? null;

    return (
        <main className="space-y-5">
            <h1 className="text-2xl font-semibold text-slate-900">Fit Review</h1>

            <Card className="space-y-3">
                <p className="text-sm text-slate-700">
                    Run review to generate score and recommendation ranking based on your profile and personality.
                </p>
                <Button
                    type="button"
                    disabled={runMutation.isPending}
                    onClick={async () => {
                        setErrorMessage(null);
                        try {
                            await runMutation.mutateAsync();
                        } catch (error) {
                            setErrorMessage(getApiErrorMessage(error, 'Unable to run review'));
                        }
                    }}
                >
                    {runMutation.isPending ? 'Running...' : 'Run review'}
                </Button>
                {errorMessage && <p className="text-sm text-red-700">{errorMessage}</p>}
            </Card>

            <Card className="space-y-3">
                <h2 className="text-lg font-semibold text-slate-900">Latest result</h2>
                {!result ? (
                    <p className="text-sm text-slate-700">No result yet.</p>
                ) : (
                    <>
                        <p className="text-sm text-slate-700">
                            Overall score: <strong>{result.overallScore}</strong>
                        </p>
                        <p className="text-sm text-slate-700">{result.summary}</p>
                        <div className="space-y-2">
                            {result.recommendations.map((item) => (
                                <div key={`${item.name}-${item.score}`} className="rounded-md border border-slate-200 p-3">
                                    <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                                    <p className="text-xs text-slate-600">Score: {item.score}</p>
                                    <p className="text-sm text-slate-700">{item.reason}</p>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </Card>
        </main>
    );
}
