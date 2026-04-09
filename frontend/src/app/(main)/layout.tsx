import type { ReactNode } from 'react';
import AuthGuard from '@/components/auth/AuthGuard';
import AppShell from '@/components/ui/AppShell';

export default function MainLayout({ children }: { children: ReactNode }) {
    return (
        <AuthGuard>
            <AppShell>{children}</AppShell>
        </AuthGuard>
    );
}
