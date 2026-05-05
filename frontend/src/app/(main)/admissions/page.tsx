'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button, Card } from '@/components/ui';
import { useAddAdmissionCartItem, useAdmissionCart, useAdmissionCatalog } from '@/hooks/useAdmissions';
import { getApiErrorMessage } from '@/lib/api-error';
import type { AdmissionMethodType } from '@/services/admissionService';

const METHOD_LABEL: Record<AdmissionMethodType, string> = {
    thpt: 'THPT',
    transcript: 'Transcript',
    competency: 'Competency',
    direct: 'Direct',
};

export default function AdmissionsPage() {
    const catalogQuery = useAdmissionCatalog();
    const cartQuery = useAdmissionCart();
    const addMutation = useAddAdmissionCartItem();

    const [message, setMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const handleAdd = async (schoolId: string, majorId: string, methodId: string) => {
        setMessage(null);
        setErrorMessage(null);
        try {
            const result = await addMutation.mutateAsync({ schoolId, majorId, methodId });
            setMessage(`Added to cart: ${result.item.school.name} - ${result.item.major.name}.`);
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'Unable to add this option to cart'));
        }
    };

    const cartProfile = cartQuery.data?.profile;
    const cartItemsCount = cartQuery.data?.items.length ?? 0;
    const schools = catalogQuery.data?.schools ?? [];

    return (
        <main className="space-y-5">
            <h1 className="text-2xl font-semibold text-slate-900">Admissions Planner</h1>

            <Card className="space-y-3">
                <h2 className="text-lg font-semibold text-slate-900">Your profile snapshot</h2>
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
                                Update Grade 10/11/12 in Profile to get a more accurate admission estimate.
                            </p>
                        )}
                    </>
                )}
            </Card>

            <Card className="space-y-2">
                <h2 className="text-lg font-semibold text-slate-900">Admissions cart</h2>
                <p className="text-sm text-slate-700">
                    You currently have <strong>{cartItemsCount}</strong> option(s) in cart.
                </p>
                <p className="text-sm text-slate-700">
                    Open detailed list with admission estimate, study orientation and learning plan at{' '}
                    <Link className="underline" href="/admissions/cart">Admissions Cart</Link>.
                </p>
            </Card>

            <Card className="space-y-4">
                <h2 className="text-lg font-semibold text-slate-900">School, major and admission methods</h2>
                {catalogQuery.isLoading ? (
                    <p className="text-sm text-slate-700">Loading admissions catalog...</p>
                ) : schools.length === 0 ? (
                    <p className="text-sm text-slate-700">No admissions catalog data.</p>
                ) : (
                    <div className="space-y-4">
                        {schools.map((school) => (
                            <div key={school.id} className="rounded-md border border-slate-200 p-4">
                                <h3 className="text-base font-semibold text-slate-900">
                                    {school.name} <span className="text-sm font-normal text-slate-500">({school.city})</span>
                                </h3>
                                <div className="mt-3 space-y-3">
                                    {school.majors.map((major) => (
                                        <div key={major.id} className="rounded-md border border-slate-100 bg-slate-50 p-3">
                                            <p className="text-sm font-semibold text-slate-900">{major.name}</p>
                                            <p className="text-xs text-slate-600">Field: {major.field}</p>
                                            <div className="mt-3 grid gap-2 md:grid-cols-2">
                                                {major.admissionMethods.map((method) => (
                                                    <div key={method.id} className="rounded-md border border-slate-200 bg-white p-3">
                                                        <p className="text-sm font-semibold text-slate-900">{method.name}</p>
                                                        <p className="text-xs text-slate-600">
                                                            Type: {METHOD_LABEL[method.type]} | Ref avg: {method.requiredAverage.toFixed(1)}
                                                        </p>
                                                        <p className="mt-1 text-sm text-slate-700">{method.description}</p>
                                                        <Button
                                                            type="button"
                                                            className="mt-3 w-full sm:w-fit"
                                                            disabled={addMutation.isPending}
                                                            onClick={() => void handleAdd(school.id, major.id, method.id)}
                                                        >
                                                            {addMutation.isPending ? 'Adding...' : 'Add to cart'}
                                                        </Button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            {message && <p className="text-sm text-green-700">{message}</p>}
            {errorMessage && <p className="text-sm text-red-700">{errorMessage}</p>}
        </main>
    );
}
