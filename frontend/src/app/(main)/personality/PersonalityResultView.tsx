'use client';

import Link from 'next/link';
import { Button, Card } from '@/components/ui';
import type { PersonalitySubmission } from '@/services/personalityService';
import {
    buildDimensionResults,
    formatSubmissionDate,
    DISPLAY_MAX_SCORE,
    getMbtiInsight,
    getTotalDisplayScore,
} from './personality-results';

interface PersonalityResultViewProps {
    submission: PersonalitySubmission;
    onRetake?: () => void;
    showActions?: boolean;
}

function InsightList({ title, items }: { title: string; items: string[] }) {
    return (
        <section className="rounded-md border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">
                {items.map((item) => (
                    <li key={item}>{item}</li>
                ))}
            </ul>
        </section>
    );
}

export default function PersonalityResultView({ submission, onRetake, showActions = true }: PersonalityResultViewProps) {
    const totalScore = getTotalDisplayScore(submission.scores);
    const dimensionResults = buildDimensionResults(submission.scores);
    const insight = getMbtiInsight(submission.mbtiType);

    return (
        <Card className="space-y-5 border-slate-900">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                    <p className="text-sm font-medium text-slate-500">Kết quả đánh giá tính cách</p>
                    <div className="space-y-1">
                        <h2 className="text-2xl font-semibold text-slate-900">
                            {submission.mbtiType} · {insight.title}
                        </h2>
                        <p className="text-sm text-slate-600">Ngày làm bài: {formatSubmissionDate(submission.createdAt)}</p>
                    </div>
                </div>
                <div className="rounded-lg bg-slate-900 px-5 py-4 text-center text-white">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-300">Tổng điểm</p>
                    <p className="mt-1 text-2xl font-semibold">{totalScore}/{DISPLAY_MAX_SCORE}</p>
                    <p className="text-sm text-slate-200">điểm</p>
                </div>
            </div>

            <p className="text-sm leading-6 text-slate-700">{insight.summary}</p>

            <section className="space-y-3">
                <h3 className="text-base font-semibold text-slate-900">Nhận xét theo 4 nhóm tính cách</h3>
                <div className="grid gap-3 lg:grid-cols-2">
                    {dimensionResults.map((dimension) => (
                        <article key={dimension.key} className="rounded-md border border-slate-200 p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-sm font-semibold text-slate-900">{dimension.title}</p>
                                    <p className="mt-1 text-sm text-slate-600">
                                        {dimension.firstLetter} {dimension.firstScore} - {dimension.secondLetter}{' '}
                                        {dimension.secondScore}
                                    </p>
                                </div>
                                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                                    {dimension.scoreText}
                                </span>
                            </div>
                            <p className="mt-3 text-sm font-medium text-slate-900">
                                Nghiêng về {dimension.dominantLabel} ({dimension.dominantLetter})
                            </p>
                            <p className="mt-2 text-sm leading-6 text-slate-700">{dimension.evaluation}</p>
                        </article>
                    ))}
                </div>
            </section>

            <div className="grid gap-3 lg:grid-cols-3">
                <InsightList title="Điểm mạnh" items={insight.strengths} />
                <InsightList title="Điểm yếu cần lưu ý" items={insight.weaknesses} />
                <InsightList title="Hướng khắc phục" items={insight.improvements} />
            </div>

            <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">
                Kết quả mới nhất vẫn được hệ thống dùng cùng hồ sơ học tập để gợi ý mức độ phù hợp ngành và trường.
            </p>

            {showActions && (
                <div className="flex flex-wrap gap-2">
                    {onRetake && (
                        <Button type="button" variant="secondary" onClick={onRetake}>
                            Làm lại bài này
                        </Button>
                    )}
                    <Link
                        href="/review"
                        className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400"
                    >
                        Sang trang đánh giá phù hợp
                    </Link>
                </div>
            )}
        </Card>
    );
}
