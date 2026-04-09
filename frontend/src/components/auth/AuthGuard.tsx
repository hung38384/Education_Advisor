'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthInit } from '@/hooks/useAuth';
import type { UserRole } from '@/services/authService';

interface AuthGuardProps {
    children: ReactNode;
    allowedRoles?: UserRole[];
}

export default function AuthGuard({ children, allowedRoles }: AuthGuardProps) {
    const router = useRouter();
    const { initialized, accessToken, currentUser } = useAuthInit();
    const isRoleAllowed = !allowedRoles || (currentUser ? allowedRoles.includes(currentUser.role) : false);

    useEffect(() => {
        if (!initialized) {
            return;
        }

        if (!accessToken || !currentUser) {
            router.replace('/login');
            return;
        }

        if (!isRoleAllowed) {
            router.replace('/dashboard');
        }
    }, [initialized, accessToken, currentUser, isRoleAllowed, router]);

    if (!initialized) {
        return <div style={{ padding: 24 }}>Checking login...</div>;
    }

    if (!accessToken || !currentUser) {
        return <div style={{ padding: 24 }}>Redirecting to login...</div>;
    }

    if (!isRoleAllowed) {
        return <div style={{ padding: 24 }}>You do not have permission to view this page.</div>;
    }

    return <>{children}</>;
}
