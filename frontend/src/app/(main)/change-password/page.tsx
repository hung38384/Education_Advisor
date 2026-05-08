'use client';

import type { FormEvent } from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Input } from '@/components/ui';
import { useChangePassword } from '@/hooks/useAuth';
import { getApiErrorMessage } from '@/lib/api-error';

export default function ChangePasswordPage() {
    const router = useRouter();
    const changePasswordMutation = useChangePassword();
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [message, setMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setMessage(null);
        setErrorMessage(null);

        try {
            const result = await changePasswordMutation.mutateAsync({
                oldPassword,
                newPassword,
            });
            setMessage(result.message);
            setOldPassword('');
            setNewPassword('');
            setTimeout(() => router.push('/profile'), 800);
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'Không thể đổi mật khẩu'));
        }
    };

    return (
        <main className="mx-auto mt-6 w-full max-w-[560px] px-4">
            <Card className="space-y-4">
                <h1 className="text-2xl font-semibold text-slate-900">Đổi mật khẩu</h1>
                <form onSubmit={handleSubmit} className="grid gap-3">
                    <Input
                        type="password"
                        placeholder="Mật khẩu hiện tại"
                        value={oldPassword}
                        onChange={(event) => setOldPassword(event.target.value)}
                        minLength={8}
                        required
                    />
                    <Input
                        type="password"
                        placeholder="Mật khẩu mới (tối thiểu 8 ký tự)"
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                        minLength={8}
                        required
                    />
                    <Button type="submit" disabled={changePasswordMutation.isPending}>
                        {changePasswordMutation.isPending ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
                    </Button>
                </form>

                {message && <p className="text-sm text-green-700">{message}</p>}
                {errorMessage && <p className="text-sm text-red-700">{errorMessage}</p>}
            </Card>
        </main>
    );
}
