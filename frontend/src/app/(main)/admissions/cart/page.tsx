'use client';

import { useState } from 'react';
import { Button, Card } from '@/components/ui';
import { useAdmissionCart, useRemoveAdmissionCartItem } from '@/hooks/useAdmissions';
import { getApiErrorMessage } from '@/lib/api-error';
import type { AdmissionChanceLevel } from '@/services/admissionService';

const CHANCE_LABEL: Record<AdmissionChanceLevel, string> = {
    high: 'High',
    medium: 'Medium',
    challenging: 'Challenging',
};

const CHANCE_CLASS: Record<AdmissionChanceLevel, string> = {
    high: 'bg-green-100 text-green-800',
    medium: 'bg-amber-100 text-amber-800',
    challenging: 'bg-rose-100 text-rose-800',
};

export default function AdmissionsCartPage() {
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
            const result = await removeMutation.mutateAsync(id);
            setMessage(result.message);
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'Unable to remove admissions cart item'));
        }
    };

    return (
        <main className="space-y-5">
            <h1 className="text-2xl font-semibold text-slate-900">Admissions Cart</h1>

            <Card className="space-y-3">
                <h2 className="text-lg font-semibold text-slate-900">Profile context for evaluation</h2>
                {cartQuery.isLoading ? (
                    <p className="text-sm text-slate-700">Loading profile context...</p>
                ) : (
                    <>
                        <p className="text-sm text-slate-700">
                            Student: <strong>{cartProfile?.fullName ?? 'Not set'}</strong>
                        </p>
                        <p className="text-sm text-slate-700">
                            Average grade: <strong>{cartProfile?.averageGrade?.toFixed(2) ?? 'Not available'}</strong>
                        </p>
                        <p className="text-sm text-slate-700">
                            Favorite subjects: <strong>{cartProfile?.favoriteSubjects.join(', ') || 'Not set'}</strong>
                        </p>
                        {cartProfile?.averageGrade == null && (
                            <p className="text-sm text-amber-700">
                                Update Grade 10/11/12 in Profile to improve estimate accuracy.
                            </p>
                        )}
                    </>
                )}
            </Card>

            {message && <p className="text-sm text-green-700">{message}</p>}
            {errorMessage && <p className="text-sm text-red-700">{errorMessage}</p>}

            <Card className="space-y-4">
                <h2 className="text-lg font-semibold text-slate-900">Added options with guidance</h2>
                {cartQuery.isLoading ? (
                    <p className="text-sm text-slate-700">Loading admissions cart...</p>
                ) : cartItems.length === 0 ? (
                    <p className="text-sm text-slate-700">No items in admissions cart yet.</p>
                ) : (
                    <div className="space-y-3">
                        {cartItems.map((item) => (
                            <div key={item.id} className="rounded-md border border-slate-200 p-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="space-y-1">
                                        <p className="text-sm font-semibold text-slate-900">
                                            {item.school.name} - {item.major.name}
                                        </p>
                                        <p className="text-xs text-slate-600">Method: {item.method.name}</p>
                                        <p className="text-xs text-slate-600">Created at: {new Date(item.createdAt).toLocaleString()}</p>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        disabled={removeMutation.isPending}
                                        onClick={() => void handleRemove(item.id)}
                                    >
                                        Remove
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
                                            Chance: {CHANCE_LABEL[item.evaluation.chanceLevel]}
                                        </span>
                                        <span className="text-sm font-semibold text-slate-900">
                                            {item.evaluation.chanceScore}/100
                                        </span>
                                    </div>
                                    <p className="text-sm text-slate-700">{item.evaluation.comment}</p>
                                    <p className="text-sm text-slate-700">
                                        <strong>Study orientation:</strong> {item.orientation}
                                    </p>
                                    <div>
                                        <p className="text-sm font-semibold text-slate-900">Study plan</p>
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
