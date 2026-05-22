'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { UserRole } from '@/services/authService';

interface AppSidebarProps {
    role: UserRole;
    onNavigate?: () => void;
}

type NavItem = {
    href: string;
    label: string;
    roles?: UserRole[];
};

const NAV_ITEMS: NavItem[] = [
    { href: '/', label: 'Trang chủ' },
    { href: '/dashboard', label: 'Tổng quan' },
    { href: '/profile', label: 'Hồ sơ cá nhân' },
    { href: '/personality', label: 'Đánh giá tính cách' },
    { href: '/admissions', label: 'Trường học' },
    { href: '/admissions/favorites', label: 'Yêu thích xét tuyển' },
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

export default function AppSidebar({ role, onNavigate }: AppSidebarProps) {
    const pathname = usePathname();

    const items = NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role));

    return (
        <nav className="flex h-full flex-col p-4">
            <div className="mb-4 px-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Điều hướng</div>
            <div className="grid gap-1">
                {items.map((item) => {
                    const active = isActive(pathname, item.href);
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            onClick={onNavigate}
                            aria-current={active ? 'page' : undefined}
                            className={[
                                'rounded-md px-3 py-2 text-sm transition-colors',
                                active
                                    ? 'bg-slate-900 text-white'
                                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900',
                            ].join(' ')}
                        >
                            {item.label}
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
