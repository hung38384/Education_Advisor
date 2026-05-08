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
            <h1 className="text-2xl font-semibold text-slate-900">Đánh giá độ phù hợp</h1>

            <Card className="space-y-3">
                <p className="text-sm text-slate-700">
                    Chạy đánh giá để tạo điểm số và xếp hạng gợi ý dựa trên hồ sơ và tính cách của bạn.
                </p>
                <Button
                    type="button"
                    disabled={runMutation.isPending}
                    onClick={async () => {
                        setErrorMessage(null);
                        try {
                            await runMutation.mutateAsync();
                        } catch (error) {
                            setErrorMessage(getApiErrorMessage(error, 'Không thể chạy đánh giá'));
                        }
                    }}
                >
                    {runMutation.isPending ? 'Đang chạy...' : 'Chạy đánh giá'}
                </Button>
                {errorMessage && <p className="text-sm text-red-700">{errorMessage}</p>}
            </Card>

            <Card className="space-y-3">
                <h2 className="text-lg font-semibold text-slate-900">Kết quả mới nhất</h2>
                {!result ? (
                    <p className="text-sm text-slate-700">Chưa có kết quả.</p>
                ) : (
                    <>
                        <p className="text-sm text-slate-700">
                            Điểm tổng quan: <strong>{result.overallScore}</strong>
                        </p>
                        <p className="text-sm text-slate-700">{result.summary}</p>
                        <div className="space-y-2">
                            {result.recommendations.map((item) => (
                                <div key={`${item.name}-${item.score}`} className="rounded-md border border-slate-200 p-3">
                                    <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                                    <p className="text-xs text-slate-600">Điểm: {item.score}</p>
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
