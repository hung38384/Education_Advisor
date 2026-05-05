'use client';

import Link from 'next/link';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { Button, Card, Input, Textarea } from '@/components/ui';
import { useMyProfile, useUpsertMyProfile } from '@/hooks/useProfile';
import { getApiErrorMessage } from '@/lib/api-error';

interface ProfileFormState {
    fullName: string;
    city: string;
    schoolName: string;
    grade10: string;
    grade11: string;
    grade12: string;
    favoriteSubjects: string;
    targetMajor: string;
    targetUniversity: string;
    bio: string;
}

function toNullableNumber(value: string): number | null {
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
        return null;
    }

    return parsed;
}

export default function ProfilePage() {
    const profileQuery = useMyProfile();
    const upsertProfileMutation = useUpsertMyProfile();

    const [form, setForm] = useState<ProfileFormState>({
        fullName: '',
        city: '',
        schoolName: '',
        grade10: '',
        grade11: '',
        grade12: '',
        favoriteSubjects: '',
        targetMajor: '',
        targetUniversity: '',
        bio: '',
    });
    const [message, setMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        const profile = profileQuery.data?.profile;
        if (!profile) {
            return;
        }

        setForm({
            fullName: profile.fullName ?? '',
            city: profile.city ?? '',
            schoolName: profile.schoolName ?? '',
            grade10: profile.grade10 == null ? '' : String(profile.grade10),
            grade11: profile.grade11 == null ? '' : String(profile.grade11),
            grade12: profile.grade12 == null ? '' : String(profile.grade12),
            favoriteSubjects: (profile.favoriteSubjects ?? []).join(', '),
            targetMajor: profile.targetMajor ?? '',
            targetUniversity: profile.targetUniversity ?? '',
            bio: profile.bio ?? '',
        });
    }, [profileQuery.data?.profile]);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setMessage(null);
        setErrorMessage(null);

        try {
            await upsertProfileMutation.mutateAsync({
                fullName: form.fullName,
                city: form.city || null,
                schoolName: form.schoolName || null,
                grade10: toNullableNumber(form.grade10),
                grade11: toNullableNumber(form.grade11),
                grade12: toNullableNumber(form.grade12),
                favoriteSubjects: form.favoriteSubjects
                    .split(',')
                    .map((item) => item.trim())
                    .filter(Boolean),
                targetMajor: form.targetMajor || null,
                targetUniversity: form.targetUniversity || null,
                bio: form.bio || null,
            });
            setMessage('Profile saved successfully.');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'Unable to save profile'));
        }
    };

    return (
        <main className="space-y-5">
            <h1 className="text-2xl font-semibold text-slate-900">Student Profile</h1>

            <Card className="space-y-4">
                <div className="flex flex-wrap gap-2">
                    <Link
                        href="/forgot-password"
                        className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-100"
                    >
                        Forgot Password
                    </Link>
                    <Link
                        href="/change-password"
                        className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-100"
                    >
                        Change Password
                    </Link>
                </div>

                <form onSubmit={handleSubmit} className="grid gap-3 md:grid-cols-2">
                    <Input
                        type="text"
                        placeholder="Full name"
                        value={form.fullName}
                        onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))}
                        required
                    />
                    <Input
                        type="text"
                        placeholder="City"
                        value={form.city}
                        onChange={(event) => setForm((prev) => ({ ...prev, city: event.target.value }))}
                    />
                    <Input
                        type="text"
                        placeholder="School name"
                        value={form.schoolName}
                        onChange={(event) => setForm((prev) => ({ ...prev, schoolName: event.target.value }))}
                    />
                    <Input
                        type="text"
                        placeholder="Favorite subjects (comma separated)"
                        value={form.favoriteSubjects}
                        onChange={(event) => setForm((prev) => ({ ...prev, favoriteSubjects: event.target.value }))}
                    />
                    <Input
                        type="number"
                        min={0}
                        max={10}
                        step="0.1"
                        placeholder="Grade 10"
                        value={form.grade10}
                        onChange={(event) => setForm((prev) => ({ ...prev, grade10: event.target.value }))}
                    />
                    <Input
                        type="number"
                        min={0}
                        max={10}
                        step="0.1"
                        placeholder="Grade 11"
                        value={form.grade11}
                        onChange={(event) => setForm((prev) => ({ ...prev, grade11: event.target.value }))}
                    />
                    <Input
                        type="number"
                        min={0}
                        max={10}
                        step="0.1"
                        placeholder="Grade 12"
                        value={form.grade12}
                        onChange={(event) => setForm((prev) => ({ ...prev, grade12: event.target.value }))}
                    />
                    <Input
                        type="text"
                        placeholder="Target major"
                        value={form.targetMajor}
                        onChange={(event) => setForm((prev) => ({ ...prev, targetMajor: event.target.value }))}
                    />
                    <Input
                        type="text"
                        placeholder="Target university"
                        value={form.targetUniversity}
                        onChange={(event) => setForm((prev) => ({ ...prev, targetUniversity: event.target.value }))}
                    />
                    <div className="md:col-span-2">
                        <Textarea
                            rows={4}
                            placeholder="Short personal note"
                            value={form.bio}
                            onChange={(event) => setForm((prev) => ({ ...prev, bio: event.target.value }))}
                        />
                    </div>

                    <div className="md:col-span-2">
                        <Button type="submit" disabled={upsertProfileMutation.isPending}>
                            {upsertProfileMutation.isPending ? 'Saving...' : 'Save profile'}
                        </Button>
                    </div>
                </form>

                {message && <p className="text-sm text-green-700">{message}</p>}
                {errorMessage && <p className="text-sm text-red-700">{errorMessage}</p>}
            </Card>
        </main>
    );
}
