import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary';
}

export default function Button({ variant = 'primary', className = '', type = 'button', ...props }: ButtonProps) {
    const variantClass =
        variant === 'secondary'
            ? 'bg-white text-slate-900 border border-slate-300 hover:bg-slate-100'
            : 'bg-slate-900 text-white hover:bg-slate-800';

    return (
        <button
            type={type}
            className={`inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-60 ${variantClass} ${className}`.trim()}
            {...props}
        />
    );
}
