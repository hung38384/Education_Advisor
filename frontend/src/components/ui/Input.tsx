import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    hasError?: boolean;
}

export default function Input({ className = '', hasError = false, ...props }: InputProps) {
    const stateClass = hasError
        ? 'border-red-500 focus:ring-red-300'
        : 'border-slate-300 focus:ring-slate-300';

    return (
        <input
            aria-invalid={hasError || undefined}
            className={`w-full rounded-md border px-3 py-2 text-sm text-slate-900 outline-none transition-shadow placeholder:text-slate-400 focus:ring-2 ${stateClass} ${className}`.trim()}
            {...props}
        />
    );
}
