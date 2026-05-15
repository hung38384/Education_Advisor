'use client';

import Link from 'next/link';
import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Button, Card, Input, Textarea } from '@/components/ui';
import { useMyProfile, useUpsertMyProfile } from '@/hooks/useProfile';
import { getApiErrorMessage } from '@/lib/api-error';

const REQUIRED_TRANSCRIPT_SUBJECTS = [
    'Toán',
    'Ngữ văn',
    'Ngoại ngữ',
    'Vật lý',
    'Hóa học',
    'Sinh học',
    'Lịch sử',
    'Địa lý',
    'Giáo dục công dân',
] as const;

type TranscriptFormState = Record<string, string>;

interface ProfileFormState {
    fullName: string;
    phone: string;
    gender: string;
    dateOfBirth: string;
    city: string;
    schoolName: string;
    grade10: string;
    grade11: string;
    grade12: string;
    transcript: TranscriptFormState;
    favoriteSubjects: string;
    targetMajor: string;
    targetUniversity: string;
    bio: string;
}

function createEmptyTranscript(): TranscriptFormState {
    return Object.fromEntries(REQUIRED_TRANSCRIPT_SUBJECTS.map((subject) => [subject, '']));
}

const EMPTY_FORM: ProfileFormState = {
    fullName: '',
    phone: '',
    gender: '',
    dateOfBirth: '',
    city: '',
    schoolName: '',
    grade10: '',
    grade11: '',
    grade12: '',
    transcript: createEmptyTranscript(),
    favoriteSubjects: '',
    targetMajor: '',
    targetUniversity: '',
    bio: '',
};

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

function toTranscriptPayload(transcript: TranscriptFormState): Record<string, number> | null {
    const payload: Record<string, number> = {};

    for (const subject of REQUIRED_TRANSCRIPT_SUBJECTS) {
        const parsed = toNullableNumber(transcript[subject] ?? '');
        if (parsed === null) {
            return null;
        }
        payload[subject] = parsed;
    }

    return payload;
}

export default function ProfilePage() {
    const profileQuery = useMyProfile();
    const upsertProfileMutation = useUpsertMyProfile();

    const [form, setForm] = useState<ProfileFormState>(EMPTY_FORM);
    const [message, setMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const hasHydratedForm = useRef(false);
    const transcriptFieldsetRef = useRef<HTMLFieldSetElement>(null);

    useEffect(() => {
        if (hasHydratedForm.current || !profileQuery.isSuccess) {
            return;
        }

        const profile = profileQuery.data.profile;
        if (profile) {
            setForm({
                fullName: profile.fullName ?? '',
                phone: profile.phone ?? '',
                gender: profile.gender ?? '',
                dateOfBirth: profile.dateOfBirth ?? '',
                city: profile.city ?? '',
                schoolName: profile.schoolName ?? '',
                grade10: profile.grade10 == null ? '' : String(profile.grade10),
                grade11: profile.grade11 == null ? '' : String(profile.grade11),
                grade12: profile.grade12 == null ? '' : String(profile.grade12),
                transcript: Object.fromEntries(
                    REQUIRED_TRANSCRIPT_SUBJECTS.map((subject) => [
                        subject,
                        profile.transcript?.[subject] == null ? '' : String(profile.transcript[subject]),
                    ])
                ),
                favoriteSubjects: (profile.favoriteSubjects ?? []).join(', '),
                targetMajor: profile.targetMajor ?? '',
                targetUniversity: profile.targetUniversity ?? '',
                bio: profile.bio ?? '',
            });
        }

        hasHydratedForm.current = true;
    }, [profileQuery.data, profileQuery.isSuccess]);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setMessage(null);
        setErrorMessage(null);

        const transcript = toTranscriptPayload(form.transcript);
        if (!transcript) {
            setErrorMessage('Vui lòng nhập điểm tất cả các môn học');
            transcriptFieldsetRef.current?.focus();
            return;
        }

        try {
            await upsertProfileMutation.mutateAsync({
                fullName: form.fullName,
                phone: form.phone || null,
                gender: form.gender || null,
                dateOfBirth: form.dateOfBirth || null,
                city: form.city || null,
                schoolName: form.schoolName || null,
                grade10: toNullableNumber(form.grade10),
                grade11: toNullableNumber(form.grade11),
                grade12: toNullableNumber(form.grade12),
                transcript,
                favoriteSubjects: form.favoriteSubjects
                    .split(',')
                    .map((item) => item.trim())
                    .filter(Boolean),
                targetMajor: form.targetMajor || null,
                targetUniversity: form.targetUniversity || null,
                bio: form.bio || null,
            });
            setMessage('Đã lưu hồ sơ cá nhân.');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'Không thể lưu hồ sơ'));
        }
    };

    const transcriptErrorMessage = errorMessage === 'Vui lòng nhập điểm tất cả các môn học' ? errorMessage : null;

    return (
        <main className="space-y-5">
            <div className="space-y-1">
                <h1 className="text-2xl font-semibold text-slate-900">Hồ sơ cá nhân</h1>
                <p className="text-sm text-slate-600">
                    Cập nhật thông tin học tập để hệ thống gợi ý trường, ngành và kế hoạch phù hợp hơn.
                </p>
            </div>

            <Card className="space-y-4">
                <div className="flex flex-wrap gap-2">
                    <Link
                        href="/forgot-password"
                        className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-100"
                    >
                        Quên mật khẩu
                    </Link>
                    <Link
                        href="/change-password"
                        className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-100"
                    >
                        Đổi mật khẩu
                    </Link>
                </div>

                {profileQuery.isLoading ? (
                    <p className="text-sm text-slate-700">Đang tải hồ sơ cá nhân...</p>
                ) : profileQuery.isError ? (
                    <p className="text-sm text-red-700">Không tải được hồ sơ cá nhân.</p>
                ) : (
                    <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
                        <label className="grid gap-1 text-sm font-medium text-slate-700">
                            Họ và tên
                            <Input
                                type="text"
                                value={form.fullName}
                                onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))}
                                required
                            />
                        </label>
                        <label className="grid gap-1 text-sm font-medium text-slate-700">
                            Số điện thoại
                            <Input
                                type="tel"
                                value={form.phone}
                                onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                            />
                        </label>
                        <label className="grid gap-1 text-sm font-medium text-slate-700">
                            Giới tính
                            <Input
                                type="text"
                                value={form.gender}
                                onChange={(event) => setForm((prev) => ({ ...prev, gender: event.target.value }))}
                            />
                        </label>
                        <label className="grid gap-1 text-sm font-medium text-slate-700">
                            Ngày sinh
                            <Input
                                type="date"
                                value={form.dateOfBirth}
                                onChange={(event) => setForm((prev) => ({ ...prev, dateOfBirth: event.target.value }))}
                            />
                        </label>
                        <label className="grid gap-1 text-sm font-medium text-slate-700">
                            Thành phố
                            <Input
                                type="text"
                                value={form.city}
                                onChange={(event) => setForm((prev) => ({ ...prev, city: event.target.value }))}
                            />
                        </label>
                        <label className="grid gap-1 text-sm font-medium text-slate-700">
                            Trường THPT
                            <Input
                                type="text"
                                value={form.schoolName}
                                onChange={(event) => setForm((prev) => ({ ...prev, schoolName: event.target.value }))}
                            />
                        </label>
                        <label className="grid gap-1 text-sm font-medium text-slate-700">
                            Môn học yêu thích
                            <Input
                                type="text"
                                value={form.favoriteSubjects}
                                onChange={(event) => setForm((prev) => ({ ...prev, favoriteSubjects: event.target.value }))}
                            />
                        </label>
                        <label className="grid gap-1 text-sm font-medium text-slate-700">
                            Ngành mục tiêu
                            <Input
                                type="text"
                                value={form.targetMajor}
                                onChange={(event) => setForm((prev) => ({ ...prev, targetMajor: event.target.value }))}
                            />
                        </label>
                        <label className="grid gap-1 text-sm font-medium text-slate-700">
                            Trường đại học mục tiêu
                            <Input
                                type="text"
                                value={form.targetUniversity}
                                onChange={(event) => setForm((prev) => ({ ...prev, targetUniversity: event.target.value }))}
                            />
                        </label>
                        <div className="grid gap-3 md:col-span-2 md:grid-cols-3">
                            <label className="grid gap-1 text-sm font-medium text-slate-700">
                                Điểm lớp 10
                                <Input
                                    type="number"
                                    min={0}
                                    max={10}
                                    step="0.1"
                                    value={form.grade10}
                                    onChange={(event) => setForm((prev) => ({ ...prev, grade10: event.target.value }))}
                                />
                            </label>
                            <label className="grid gap-1 text-sm font-medium text-slate-700">
                                Điểm lớp 11
                                <Input
                                    type="number"
                                    min={0}
                                    max={10}
                                    step="0.1"
                                    value={form.grade11}
                                    onChange={(event) => setForm((prev) => ({ ...prev, grade11: event.target.value }))}
                                />
                            </label>
                            <label className="grid gap-1 text-sm font-medium text-slate-700">
                                Điểm lớp 12
                                <Input
                                    type="number"
                                    min={0}
                                    max={10}
                                    step="0.1"
                                    value={form.grade12}
                                    onChange={(event) => setForm((prev) => ({ ...prev, grade12: event.target.value }))}
                                />
                            </label>
                        </div>
                        <fieldset
                            ref={transcriptFieldsetRef}
                            className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 md:col-span-2 md:grid-cols-3"
                            aria-describedby={transcriptErrorMessage ? 'transcript-help transcript-error' : 'transcript-help'}
                            aria-invalid={transcriptErrorMessage ? true : undefined}
                            tabIndex={-1}
                        >
                            <legend className="text-base font-semibold text-slate-900 md:col-span-3">Điểm tất cả các môn học</legend>
                            <p id="transcript-help" className="text-sm text-slate-600 md:col-span-3">
                                Nhập đủ điểm từng môn bắt buộc theo thang 0-10 để hệ thống tư vấn chính xác hơn.
                            </p>
                            {transcriptErrorMessage && (
                                <p id="transcript-error" className="text-sm text-red-700 md:col-span-3" role="alert">
                                    {transcriptErrorMessage}
                                </p>
                            )}
                            {REQUIRED_TRANSCRIPT_SUBJECTS.map((subject) => (
                                <label key={subject} className="grid gap-1 text-sm font-medium text-slate-700">
                                    {subject} <span className="text-red-700">(bắt buộc)</span>
                                    <Input
                                        type="number"
                                        min={0}
                                        max={10}
                                        step="0.1"
                                        value={form.transcript[subject] ?? ''}
                                        onChange={(event) => setForm((prev) => ({
                                            ...prev,
                                            transcript: {
                                                ...prev.transcript,
                                                [subject]: event.target.value,
                                            },
                                        }))}
                                        required
                                    />
                                </label>
                            ))}
                        </fieldset>
                        <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
                            Ghi chú cá nhân
                            <Textarea
                                rows={4}
                                value={form.bio}
                                onChange={(event) => setForm((prev) => ({ ...prev, bio: event.target.value }))}
                            />
                        </label>

                        <div className="md:col-span-2">
                            <Button type="submit" disabled={upsertProfileMutation.isPending}>
                                {upsertProfileMutation.isPending ? 'Đang lưu...' : 'Lưu hồ sơ'}
                            </Button>
                        </div>
                    </form>
                )}

                {message && <p className="text-sm text-green-700" role="status">{message}</p>}
                {errorMessage && !transcriptErrorMessage && <p className="text-sm text-red-700" role="alert">{errorMessage}</p>}
            </Card>
        </main>
    );
}
