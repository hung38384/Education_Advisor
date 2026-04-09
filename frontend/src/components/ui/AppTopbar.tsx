'use client';

import { useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useLogout } from '@/hooks/useAuth';
import Button from './Button';

interface AppTopbarProps {
    userName: string;
    onOpenSidebar: () => void;
    mobileOpen: boolean;
}

function getPageTitle(pathname: string): string {
    if (pathname.startsWith('/admin/users')) {
        return 'Admin Users';
    }

    if (pathname.startsWith('/product')) {
        return 'Products';
    }

    if (pathname.startsWith('/dashboard')) {
        return 'Dashboard';
    }

    return 'Dashboard';
}

export default function AppTopbar({ userName, onOpenSidebar, mobileOpen }: AppTopbarProps) {
    const pathname = usePathname();
    const router = useRouter();
    const logout = useLogout();
    const pageTitle = useMemo(() => getPageTitle(pathname), [pathname]);

    return (
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 md:px-6">
            <div className="flex items-center gap-2">
                <Button
                    type="button"
                    variant="secondary"
                    className="md:hidden"
                    aria-expanded={mobileOpen}
                    aria-controls={mobileOpen ? 'app-mobile-sidebar' : undefined}
                    onClick={onOpenSidebar}
                >
                    Menu
                </Button>
                <h1 className="text-base font-semibold text-slate-900">{pageTitle}</h1>
            </div>

            <div className="flex items-center gap-2">
                <span className="hidden text-sm text-slate-600 md:inline">{userName}</span>
                <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                        logout();
                        router.replace('/login');
                    }}
                >
                    Logout
                </Button>
            </div>
        </header>
    );
}
