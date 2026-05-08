'use client';

import { Card } from '@/components/ui';
import { useLatestReview } from '@/hooks/useReview';
import { useLatestPersonality } from '@/hooks/usePersonality';
import { useMyProfile } from '@/hooks/useProfile';

export default function DashboardPage() {
    const profileQuery = useMyProfile();
    const personalityQuery = useLatestPersonality();
    const reviewQuery = useLatestReview();

    const fullName = profileQuery.data?.profile?.fullName ?? 'Chưa cập nhật';
    const mbti = personalityQuery.data?.submission?.mbtiType ?? 'Chưa có';
    const targetMajor = profileQuery.data?.profile?.targetMajor ?? 'Chưa cập nhật';
    const reviewSummary = reviewQuery.data?.result?.summary ?? 'Chạy đánh giá để xem gợi ý.';

    return (
        <main className="space-y-5">
            <h1 className="text-2xl font-semibold text-slate-900">Trang chủ</h1>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Card>
                    <p className="text-sm text-slate-500">Hồ sơ học sinh</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">{fullName}</p>
                </Card>
                <Card>
                    <p className="text-sm text-slate-500">MBTI gần nhất</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">{mbti}</p>
                </Card>
                <Card>
                    <p className="text-sm text-slate-500">Ngành mục tiêu</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">{targetMajor}</p>
                </Card>
                <Card>
                    <p className="text-sm text-slate-500">Điểm đánh giá</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">
                        {reviewQuery.data?.result?.overallScore ?? '--'}
                    </p>
                </Card>
            </div>

            <Card className="space-y-2">
                <h2 className="text-lg font-semibold text-slate-900">Gợi ý mới nhất</h2>
                <p className="text-sm text-slate-700">{reviewSummary}</p>
            </Card>
        </main>
    );
}
