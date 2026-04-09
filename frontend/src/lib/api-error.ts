import type { AxiosError } from 'axios';

export function getApiErrorMessage(error: unknown, fallback: string): string {
    const axiosError = error as AxiosError<{ message?: string }>;
    const status = axiosError.response?.status;

    if (typeof status === 'number' && status >= 500) {
        return fallback;
    }

    const message = axiosError.response?.data?.message;
    return typeof message === 'string' && message.trim().length > 0 ? message : fallback;
}
