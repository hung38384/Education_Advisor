import type { ReactNode } from 'react';

interface CardProps {
    children: ReactNode;
    className?: string;
}

export default function Card({ children, className = '' }: CardProps) {
    return <div className={`rounded-lg border border-slate-200 bg-white p-4 shadow-sm ${className}`.trim()}>{children}</div>;
}
