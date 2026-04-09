'use client';

import type { FormEvent } from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRegister } from '@/hooks/useAuth';
import { getApiErrorMessage } from '@/lib/api-error';
import { Button, Card, Input } from '@/components/ui';

export default function RegisterPage() {
    const router = useRouter();
    const registerMutation = useRegister();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [message, setMessage] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setMessage(null);
        setSuccessMessage(null);

        try {
            const result = await registerMutation.mutateAsync({ name, email, password });
            setSuccessMessage(result.message);
            setTimeout(() => router.push('/login'), 800);
        } catch (error) {
            setMessage(getApiErrorMessage(error, 'Register failed'));
        }
    };

    return (
        <main className="mx-auto mt-10 w-full max-w-[420px] px-4">
            <Card>
                <h1 className="mb-4 text-2xl font-semibold text-slate-900">Register</h1>
                <form onSubmit={handleSubmit} className="grid gap-3">
                    <Input
                        type="text"
                        placeholder="Name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        required
                    />
                    <Input
                        type="email"
                        placeholder="Email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        required
                    />
                    <Input
                        type="password"
                        placeholder="Password (min 8 chars)"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        minLength={8}
                        required
                    />
                    <Button type="submit" disabled={registerMutation.isPending} className="w-full">
                        {registerMutation.isPending ? 'Registering...' : 'Register'}
                    </Button>
                </form>
                {message && <p className="mt-3 text-sm text-red-700">{message}</p>}
                {successMessage && <p className="mt-3 text-sm text-green-700">{successMessage}</p>}
                <p className="mt-4 text-sm text-slate-700">
                    <Link className="underline" href="/login">Back to login</Link>
                </p>
            </Card>
        </main>
    );
}
