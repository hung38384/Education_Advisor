'use client';

import type { FormEvent } from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { useForgotPassword } from '@/hooks/useAuth';
import { getApiErrorMessage } from '@/lib/api-error';
import { Button, Card, Input } from '@/components/ui';

export default function ForgotPasswordPage() {
    const forgotPasswordMutation = useForgotPassword();
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState<string | null>(null);
    const [devResetToken, setDevResetToken] = useState<string | null>(null);
    const [devResetLink, setDevResetLink] = useState<string | null>(null);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setMessage(null);
        setDevResetToken(null);
        setDevResetLink(null);

        try {
            const result = await forgotPasswordMutation.mutateAsync({ email });
            setMessage(result.message);
            setDevResetToken(result.resetToken ?? null);
            setDevResetLink(result.resetLink ?? null);
        } catch (error) {
            setMessage(getApiErrorMessage(error, 'Failed to submit forgot password request'));
        }
    };

    return (
        <main className="mx-auto mt-10 w-full max-w-[520px] px-4">
            <Card>
                <h1 className="mb-4 text-2xl font-semibold text-slate-900">Forgot Password</h1>
                <form onSubmit={handleSubmit} className="grid gap-3">
                    <Input
                        type="email"
                        placeholder="Email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        required
                    />
                    <Button type="submit" disabled={forgotPasswordMutation.isPending} className="w-full">
                        {forgotPasswordMutation.isPending ? 'Sending...' : 'Send reset request'}
                    </Button>
                </form>

                {message && <p className="mt-3 text-sm text-slate-700">{message}</p>}

                {devResetToken && (
                    <Card className="mt-4 border-dashed">
                        <p className="break-all text-sm text-slate-800">
                            <strong>Dev reset token:</strong> <code>{devResetToken}</code>
                        </p>
                        <p className="mt-2 text-sm">
                            <Link className="underline" href={`/reset-password?token=${encodeURIComponent(devResetToken)}`}>
                                Open reset page with token
                            </Link>
                        </p>
                        {devResetLink && (
                            <p className="mt-2 break-all text-sm">
                                <a className="underline" href={devResetLink}>{devResetLink}</a>
                            </p>
                        )}
                    </Card>
                )}

                <p className="mt-4 text-sm text-slate-700">
                    <Link className="underline" href="/login">Back to login</Link>
                </p>
            </Card>
        </main>
    );
}
