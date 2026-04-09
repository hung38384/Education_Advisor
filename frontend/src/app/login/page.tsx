'use client';

import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthInit, useLogin } from '@/hooks/useAuth';
import { getApiErrorMessage } from '@/lib/api-error';
import { Button, Card, Input } from '@/components/ui';

export default function LoginPage() {
    const router = useRouter();
    const loginMutation = useLogin();
    const { initialized, accessToken, currentUser } = useAuthInit();
    const [email, setEmail] = useState(process.env.NEXT_PUBLIC_DEV_LOGIN_EMAIL ?? '');
    const [password, setPassword] = useState(process.env.NEXT_PUBLIC_DEV_LOGIN_PASSWORD ?? '');
    const [message, setMessage] = useState<string | null>(null);

    useEffect(() => {
        if (initialized && accessToken && currentUser) {
            router.replace('/product');
        }
    }, [initialized, accessToken, currentUser, router]);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setMessage(null);

        try {
            await loginMutation.mutateAsync({ email, password });
            router.push('/product');
        } catch (error) {
            setMessage(getApiErrorMessage(error, 'Login failed'));
        }
    };

    if (!initialized) {
        return <div className="p-6">Loading...</div>;
    }

    return (
        <main className="mx-auto mt-10 w-full max-w-[420px] px-4">
            <Card>
                <h1 className="mb-4 text-2xl font-semibold text-slate-900">Login</h1>
                <form onSubmit={handleSubmit} className="grid gap-3">
                    <Input
                        type="email"
                        placeholder="Email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        required
                    />
                    <Input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        minLength={8}
                        required
                    />
                    <Button type="submit" disabled={loginMutation.isPending} className="w-full">
                        {loginMutation.isPending ? 'Logging in...' : 'Login'}
                    </Button>
                </form>
                {message && <p className="mt-3 text-sm text-red-700">{message}</p>}
                <p className="mt-4 text-sm text-slate-700">
                    <Link className="underline" href="/register">Register</Link> |{' '}
                    <Link className="underline" href="/forgot-password">Forgot password?</Link>
                </p>
            </Card>
        </main>
    );
}
