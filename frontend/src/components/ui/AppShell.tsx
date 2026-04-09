'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useAtomValue } from 'jotai';
import { currentUserAtom } from '@/store/atoms';
import AppSidebar from './AppSidebar';
import AppTopbar from './AppTopbar';

interface AppShellProps {
    children: ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
    const currentUser = useAtomValue(currentUserAtom);
    const pathname = usePathname();
    const [mobileOpen, setMobileOpen] = useState(false);

    useEffect(() => {
        setMobileOpen(false);
    }, [pathname]);

    useEffect(() => {
        if (!mobileOpen) {
            return;
        }

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setMobileOpen(false);
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [mobileOpen]);

    if (!currentUser) {
        return null;
    }

    return (
        <div className="min-h-screen bg-slate-50">
            <div className="flex min-h-screen">
                <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white md:block">
                    <AppSidebar role={currentUser.role} />
                </aside>

                {mobileOpen && (
                    <>
                        <button
                            type="button"
                            aria-label="Close navigation overlay"
                            className="fixed inset-0 z-40 bg-black/30 md:hidden"
                            onClick={() => setMobileOpen(false)}
                        />
                        <aside
                            id="app-mobile-sidebar"
                            role="dialog"
                            aria-modal="true"
                            aria-label="Main navigation"
                            className="fixed inset-y-0 left-0 z-50 w-64 border-r border-slate-200 bg-white md:hidden"
                        >
                            <AppSidebar role={currentUser.role} onNavigate={() => setMobileOpen(false)} />
                        </aside>
                    </>
                )}

                <div className="flex min-h-screen min-w-0 flex-1 flex-col">
                    <AppTopbar
                        userName={currentUser.name}
                        mobileOpen={mobileOpen}
                        onOpenSidebar={() => setMobileOpen(true)}
                    />
                    <main className="flex-1 p-4 md:p-6">{children}</main>
                </div>
            </div>
        </div>
    );
}
