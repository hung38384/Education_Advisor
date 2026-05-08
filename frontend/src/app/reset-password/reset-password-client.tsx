'use client';

import type { FormEvent } from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useResetPassword } from '@/hooks/useAuth';
import { getApiErrorMessage } from '@/lib/api-error';
import { Button, Card, Input } from '@/components/ui';

export default function ResetPasswordClient() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const resetPasswordMutation = useResetPassword();
    const token = searchParams.get('token') || '';
    const [newPassword, setNewPassword] = useState('');
    const [message, setMessage] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setMessage(null);
        setSuccessMessage(null);

        try {
            const result = await resetPasswordMutation.mutateAsync({
                token,
                newPassword,
            });
            setSuccessMessage(result.message);
            setTimeout(() => router.push('/login'), 800);
        } catch (error) {
            setMessage(getApiErrorMessage(error, 'Không thể đặt lại mật khẩu'));
        }
    };

    return (
        <main className="mx-auto mt-10 w-full max-w-[520px] px-4">
            <Card>
                <h1 className="mb-4 text-2xl font-semibold text-slate-900">Đặt lại mật khẩu</h1>

                {!token ? (
                    <p className="text-sm text-slate-700">
                        Thiếu mã đặt lại mật khẩu. Vui lòng quay lại trang{' '}
                        <Link className="underline" href="/forgot-password">quên mật khẩu</Link>.
                    </p>
                ) : (
                    <form onSubmit={handleSubmit} className="grid gap-3">
                        <Input
                            type="password"
                            placeholder="Mật khẩu mới (tối thiểu 8 ký tự)"
                            value={newPassword}
                            onChange={(event) => setNewPassword(event.target.value)}
                            minLength={8}
                            required
                        />
                        <Button type="submit" disabled={resetPasswordMutation.isPending} className="w-full">
                            {resetPasswordMutation.isPending ? 'Đang đặt lại...' : 'Đặt lại mật khẩu'}
                        </Button>
                    </form>
                )}

                {message && <p className="mt-3 text-sm text-red-700">{message}</p>}
                {successMessage && <p className="mt-3 text-sm text-green-700">{successMessage}</p>}

                <p className="mt-4 text-sm text-slate-700">
                    <Link className="underline" href="/login">Quay lại đăng nhập</Link>
                </p>
            </Card>
        </main>
    );
}
