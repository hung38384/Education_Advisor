import type { TextareaHTMLAttributes } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
    hasError?: boolean;
}

export default function Textarea({ className = '', hasError = false, ...props }: TextareaProps) {
    const stateClass = hasError
        ? 'border-red-500 focus:ring-red-300'
        : 'border-slate-300 focus:ring-slate-300';

    return (
        <textarea
            aria-invalid={hasError || undefined}
            className={`w-full rounded-md border px-3 py-2 text-sm text-slate-900 outline-none transition-shadow placeholder:text-slate-400 focus:ring-2 ${stateClass} ${className}`.trim()}
            {...props}
        />
    );
}
