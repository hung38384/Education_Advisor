import type { ReactNode } from 'react';
import QueryProvider from '@/components/providers/QueryProvider';
import '@/styles/global.css';

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en">
            <body>
                <QueryProvider>
                    {children}
                </QueryProvider>
            </body>
        </html>
    );
}
