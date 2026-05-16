'use client';

import { Button, Card } from '@/components/ui';
import { useLatestReview, useRunReview } from '@/hooks/useReview';
import { useAdviseQa } from '@/hooks/useQa';
import { getApiErrorMessage } from '@/lib/api-error';
import type { ReviewRecommendation } from '@/services/reviewService';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function ReviewPage() {
    const router = useRouter();
    const latestQuery = useLatestReview();
    const runMutation = useRunReview();
    const adviseMutation = useAdviseQa();
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [adviseErrorMessage, setAdviseErrorMessage] = useState<string | null>(null);

    const result = latestQuery.data?.result ?? null;

    const handleAdvise = async (item: ReviewRecommendation) => {
        setAdviseErrorMessage(null);

        try {
            const data = await adviseMutation.mutateAsync({
                universityCode: item.universityCode,
                universityName: item.universityName,
                majorCode: item.majorCode,
                majorName: item.majorName,
                methodTag: item.featuredMethod?.methodTag ?? null,
                targetYear: item.featuredMethod?.latestYear ?? null,
            });

            router.push(`/qa?conversationId=${data.conversationId}`);
        } catch (error) {
            setAdviseErrorMessage(getApiErrorMessage(error, 'Không thể tạo nhận xét cho gợi ý này'));
        }
    };

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
                {latestQuery.isLoading ? (
                    <p className="text-sm text-slate-700">Đang tải kết quả...</p>
                ) : latestQuery.isError ? (
                    <p className="text-sm text-red-700">Không thể tải kết quả đánh giá.</p>
                ) : !result ? (
                    <p className="text-sm text-slate-700">Chưa có kết quả.</p>
                ) : (
                    <>
                        <p className="text-sm text-slate-700">
                            Điểm tổng quan: <strong>{result.overallScore}</strong>
                        </p>
                        <p className="text-sm text-slate-700">{result.summary}</p>
                        {adviseErrorMessage && <p className="text-sm text-red-700">{adviseErrorMessage}</p>}
                        <div className="grid gap-3 xl:grid-cols-2">
                            {result.recommendations.slice(0, 15).map((item) => {
                                const universityLabel = item.universityName || item.universityCode;
                                const method = item.featuredMethod;

                                return (
                                    <div
                                        key={`${item.universityCode}:${item.majorCode}`}
                                        className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md"
                                    >
                                        <div className="space-y-1">
                                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                                {item.universityCode} - {universityLabel}
                                            </p>
                                            <h3 className="text-base font-semibold text-slate-950">
                                                {item.majorCode} - {item.majorName}
                                            </h3>
                                            <p className="text-sm font-medium text-emerald-700">
                                                Điểm phù hợp: {item.score}/100
                                            </p>
                                        </div>

                                        <p className="text-sm leading-6 text-slate-700">{item.reason}</p>

                                        {method && (
                                            <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                                                <p className="font-medium text-slate-900">
                                                    Phương thức nổi bật: {method.methodAlias || method.methodTag}
                                                </p>
                                                <p className="mt-1 text-xs text-slate-600">
                                                    {method.latestYear ? `Năm ${method.latestYear}` : 'Chưa rõ năm'}
                                                    {typeof method.latestScore === 'number'
                                                        ? ` · Điểm gần nhất ${method.latestScore}`
                                                        : ''}
                                                </p>
                                                <p className="mt-2">{method.shortComment}</p>
                                            </div>
                                        )}

                                        <Button
                                            type="button"
                                            className="w-full justify-center"
                                            disabled={adviseMutation.isPending}
                                            onClick={() => handleAdvise(item)}
                                        >
                                            {adviseMutation.isPending ? 'Đang tạo nhận xét...' : 'Nhận xét'}
                                        </Button>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </Card>
        </main>
    );
}
