'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLogout } from '@/hooks/useAuth';
import type { UserRole } from '@/services/authService';
import Button from './Button';

type NavItem = {
    href: string;
    label: string;
    roles?: UserRole[];
};

interface AppTopbarProps {
    userName: string;
    role: UserRole;
}

const NAV_ITEMS: NavItem[] = [
    { href: '/dashboard', label: 'Trang chủ' },
    { href: '/admissions', label: 'Trường học' },
    { href: '/admissions/favorites', label: 'Yêu thích' },
    { href: '/personality', label: 'Đánh giá tính cách' },
    { href: '/review', label: 'Đánh giá độ phù hợp' },
    { href: '/qa', label: 'Trợ lý AI' },
    { href: '/admin/users', label: 'Quản trị người dùng', roles: ['superadmin'] },
];

function isActive(pathname: string, href: string): boolean {
    if (href === '/admissions' && pathname.startsWith('/admissions/favorites')) {
        return false;
    }

    return pathname === href || pathname.startsWith(`${href}/`);
}

function getLinkClass(active: boolean): string {
    return [
        'rounded-md px-3 py-2 text-sm font-medium transition-colors',
        active ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950',
    ].join(' ');
}

export default function AppTopbar({ userName, role }: AppTopbarProps) {
    const pathname = usePathname();
    const router = useRouter();
    const logout = useLogout();
    const [mobileOpen, setMobileOpen] = useState(false);
    const [userOpen, setUserOpen] = useState(false);
    const userMenuRef = useRef<HTMLDivElement | null>(null);

    const navItems = useMemo(
        () => NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role)),
        [role]
    );

    useEffect(() => {
        setMobileOpen(false);
        setUserOpen(false);
    }, [pathname]);

    useEffect(() => {
        const handleClick = (event: MouseEvent) => {
            if (!userMenuRef.current?.contains(event.target as Node)) {
                setUserOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const handleLogout = () => {
        logout();
        setUserOpen(false);
        router.replace('/login');
    };

    return (
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
            <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
                <div className="flex min-w-0 items-center gap-3">
                    <Link href="/dashboard" className="shrink-0 text-base font-bold text-slate-950">
                        Education Advisor
                    </Link>

                    <nav aria-label="Điều hướng chính" className="hidden items-center gap-1 md:flex">
                        {navItems.map((item) => {
                            const active = isActive(pathname, item.href);
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    aria-current={active ? 'page' : undefined}
                                    className={getLinkClass(active)}
                                >
                                    {item.label}
                                </Link>
                            );
                        })}
                    </nav>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        variant="secondary"
                        className="md:hidden"
                        aria-expanded={mobileOpen}
                        aria-controls="app-mobile-menu"
                        onClick={() => setMobileOpen((open) => !open)}
                    >
                        Thực đơn
                    </Button>

                    <div ref={userMenuRef} className="relative">
                        <Button
                            type="button"
                            variant="secondary"
                            aria-haspopup="menu"
                            aria-expanded={userOpen}
                            onClick={() => setUserOpen((open) => !open)}
                        >
                            {userName || 'Người dùng'}
                        </Button>

                        {userOpen && (
                            <div
                                role="menu"
                                className="absolute right-0 mt-2 w-48 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg"
                            >
                                <Link
                                    role="menuitem"
                                    href="/profile"
                                    className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                                >
                                    Hồ sơ cá nhân
                                </Link>
                                <button
                                    type="button"
                                    role="menuitem"
                                    className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                                    onClick={handleLogout}
                                >
                                    Đăng xuất
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {mobileOpen && (
                <nav
                    id="app-mobile-menu"
                    aria-label="Điều hướng chính trên di động"
                    className="border-t border-slate-200 bg-white px-4 py-3 md:hidden"
                >
                    <div className="grid gap-1">
                        {navItems.map((item) => {
                            const active = isActive(pathname, item.href);
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    aria-current={active ? 'page' : undefined}
                                    className={getLinkClass(active)}
                                >
                                    {item.label}
                                </Link>
                            );
                        })}
                    </div>
                </nav>
            )}
        </header>
    );
}
