import type { ReactNode } from 'react';
import AuthGuard from '@/components/auth/AuthGuard';

export default function AdminLayout({ children }: { children: ReactNode }) {
    return <AuthGuard allowedRoles={['superadmin']}>{children}</AuthGuard>;
}
