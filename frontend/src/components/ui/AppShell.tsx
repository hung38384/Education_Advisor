'use client';

import type { ReactNode } from 'react';
import { useAtomValue } from 'jotai';
import { currentUserAtom } from '@/store/atoms';
import AppTopbar from './AppTopbar';

interface AppShellProps {
    children: ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
    const currentUser = useAtomValue(currentUserAtom);

    if (!currentUser) {
        return null;
    }

    return (
        <div className="min-h-screen bg-slate-50">
            <AppTopbar userName={currentUser.name} role={currentUser.role} />
            <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8">{children}</main>
        </div>
    );
}
