'use client';

import { useMemo, useState } from 'react';
import { Card } from '@/components/ui';
import type { PersonalitySubmission } from '@/services/personalityService';
import { formatSubmissionDate, getSubmissionTitle } from './personality-results';
import PersonalityResultView from './PersonalityResultView';

interface PersonalityHistoryViewProps {
    submissions: PersonalitySubmission[];
    isLoading?: boolean;
    isError?: boolean;
}

export default function PersonalityHistoryView({ submissions, isLoading = false, isError = false }: PersonalityHistoryViewProps) {
    const [selectedSubmissionId, setSelectedSubmissionId] = useState<number | null>(null);
    const selectedSubmission = useMemo(() => {
        if (submissions.length === 0) {
            return null;
        }

        return submissions.find((submission) => submission.id === selectedSubmissionId) ?? submissions[0];
    }, [selectedSubmissionId, submissions]);

    if (isLoading) {
        return (
            <Card>
                <p className="text-sm text-slate-700">Đang tải lịch sử đánh giá tính cách...</p>
            </Card>
        );
    }

    if (isError) {
        return (
            <Card>
                <p className="text-sm text-red-700">Không tải được lịch sử đánh giá tính cách.</p>
            </Card>
        );
    }

    if (submissions.length === 0) {
        return (
            <Card>
                <p className="text-sm text-slate-700">Bạn chưa có kết quả đánh giá tính cách trước đó.</p>
            </Card>
        );
    }

    return (
        <div className="grid gap-4 xl:grid-cols-[minmax(280px,360px)_1fr]">
            <Card className="space-y-3">
                <div>
                    <h2 className="text-lg font-semibold text-slate-900">Lịch sử kết quả</h2>
                    <p className="text-sm text-slate-600">Chọn một lần làm bài để xem lại chi tiết.</p>
                </div>

                <ul className="space-y-2" aria-label="Danh sách kết quả đánh giá tính cách">
                    {submissions.map((submission) => {
                        const isSelected = selectedSubmission?.id === submission.id;

                        return (
                            <li key={submission.id}>
                                <button
                                    type="button"
                                    aria-current={isSelected ? 'true' : undefined}
                                    onClick={() => setSelectedSubmissionId(submission.id)}
                                    className={`w-full rounded-md border p-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 ${
                                        isSelected
                                            ? 'border-slate-900 bg-slate-900 text-white'
                                            : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
                                    }`}
                                >
                                    <span className="block text-sm font-semibold">{getSubmissionTitle(submission)}</span>
                                    <span className={`mt-1 block text-xs ${isSelected ? 'text-slate-200' : 'text-slate-500'}`}>
                                        {formatSubmissionDate(submission.createdAt)}
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </Card>

            <div aria-live="polite">
                {selectedSubmission && <PersonalityResultView submission={selectedSubmission} showActions={false} />}
            </div>
        </div>
    );
}
