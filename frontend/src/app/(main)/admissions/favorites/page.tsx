'use client';

import { useState } from 'react';
import { Button, Card } from '@/components/ui';
import { useAdmissionCart, useRemoveAdmissionCartItem } from '@/hooks/useAdmissions';
import { getApiErrorMessage } from '@/lib/api-error';
import type { AdmissionChanceLevel } from '@/services/admissionService';

const CHANCE_LABEL: Record<AdmissionChanceLevel, string> = {
    high: 'Cao',
    medium: 'Trung bình',
    challenging: 'Thử thách',
};

const CHANCE_CLASS: Record<AdmissionChanceLevel, string> = {
    high: 'bg-green-100 text-green-800',
    medium: 'bg-amber-100 text-amber-800',
    challenging: 'bg-rose-100 text-rose-800',
};

export default function AdmissionsFavoritesPage() {
    const cartQuery = useAdmissionCart();
    const removeMutation = useRemoveAdmissionCartItem();
    const [message, setMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const cartProfile = cartQuery.data?.profile;
    const cartItems = cartQuery.data?.items ?? [];

    const handleRemove = async (id: number) => {
        setMessage(null);
        setErrorMessage(null);
        try {
            await removeMutation.mutateAsync(id);
            setMessage('Đã xóa lựa chọn khỏi mục yêu thích.');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'Không thể xóa lựa chọn xét tuyển'));
        }
    };

    return (
        <main className="space-y-5">
            <h1 className="text-2xl font-semibold text-slate-900">Yêu thích xét tuyển</h1>

            <Card className="space-y-3">
                <h2 className="text-lg font-semibold text-slate-900">Thông tin hồ sơ để đánh giá</h2>
                {cartQuery.isLoading ? (
                    <p className="text-sm text-slate-700">Đang tải thông tin hồ sơ...</p>
                ) : (
                    <>
                        <p className="text-sm text-slate-700">
                            Học sinh: <strong>{cartProfile?.fullName ?? 'Chưa cập nhật'}</strong>
                        </p>
                        <p className="text-sm text-slate-700">
                            Điểm trung bình: <strong>{cartProfile?.averageGrade?.toFixed(2) ?? 'Chưa có'}</strong>
                        </p>
                        <p className="text-sm text-slate-700">
                            Môn yêu thích: <strong>{cartProfile?.favoriteSubjects.join(', ') || 'Chưa cập nhật'}</strong>
                        </p>
                        {cartProfile?.averageGrade == null && (
                            <p className="text-sm text-amber-700">
                                Cập nhật điểm lớp 10, 11, 12 trong Hồ sơ cá nhân để ước tính chính xác hơn.
                            </p>
                        )}
                    </>
                )}
            </Card>

            {message && <p className="text-sm text-green-700">{message}</p>}
            {errorMessage && <p className="text-sm text-red-700">{errorMessage}</p>}

            <Card className="space-y-4">
                <h2 className="text-lg font-semibold text-slate-900">Lựa chọn đã thêm và gợi ý</h2>
                {cartQuery.isLoading ? (
                    <p className="text-sm text-slate-700">Đang tải mục yêu thích xét tuyển...</p>
                ) : cartItems.length === 0 ? (
                    <p className="text-sm text-slate-700">Chưa có lựa chọn nào trong mục yêu thích xét tuyển.</p>
                ) : (
                    <div className="space-y-3">
                        {cartItems.map((item) => (
                            <div key={item.id} className="rounded-md border border-slate-200 p-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="space-y-1">
                                        <p className="text-sm font-semibold text-slate-900">
                                            {item.school.name} - {item.major.name}
                                        </p>
                                        <p className="text-xs text-slate-600">Phương thức: {item.method.name}</p>
                                        <p className="text-xs text-slate-600">Đã tạo lúc: {new Date(item.createdAt).toLocaleString('vi-VN')}</p>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        disabled={removeMutation.isPending}
                                        onClick={() => void handleRemove(item.id)}
                                    >
                                        Xóa
                                    </Button>
                                </div>

                                <div className="mt-3 space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span
                                            className={[
                                                'inline-flex rounded-full px-2 py-1 text-xs font-semibold',
                                                CHANCE_CLASS[item.evaluation.chanceLevel],
                                            ].join(' ')}
                                        >
                                            Cơ hội: {CHANCE_LABEL[item.evaluation.chanceLevel]}
                                        </span>
                                        <span className="text-sm font-semibold text-slate-900">
                                            {item.evaluation.chanceScore}/100
                                        </span>
                                    </div>
                                    <p className="text-sm text-slate-700">{item.evaluation.comment}</p>
                                    <p className="text-sm text-slate-700">
                                        <strong>Định hướng học tập:</strong> {item.orientation}
                                    </p>
                                    <div>
                                        <p className="text-sm font-semibold text-slate-900">Kế hoạch học tập</p>
                                        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
                                            {item.studyPlan.map((planItem, index) => (
                                                <li key={`${item.id}-${index}`}>{planItem}</li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Card>
        </main>
    );
}
