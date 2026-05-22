import axios, { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { ACCESS_TOKEN_STORAGE_KEY } from '@/config/auth';

const DEFAULT_AXIOS_TIMEOUT = 180 * 1000; // 180s for slower free-tier AI responses
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5001/api';
const API_TIMEOUT_MS = Number(process.env.NEXT_PUBLIC_API_TIMEOUT_MS || DEFAULT_AXIOS_TIMEOUT);

const api = axios.create({
    baseURL: API_BASE_URL,
    timeout: Number.isFinite(API_TIMEOUT_MS) && API_TIMEOUT_MS > 0
        ? API_TIMEOUT_MS
        : DEFAULT_AXIOS_TIMEOUT,
    headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
    },
    validateStatus: function (status: number) {
        return status >= 200 && status < 300;
    },
});

// Request Interceptor
api.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
        if (typeof window !== 'undefined') {
            const token = window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
            }
        }

        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response Interceptor
api.interceptors.response.use(
    (response: AxiosResponse) => {
        return response;
    },
    (error: AxiosError) => {
        if (error.response?.status === 401) {
            if (typeof window !== 'undefined') {
                window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);

                const authPages = ['/login', '/register', '/forgot-password', '/reset-password'];
                const isAuthPage = authPages.includes(window.location.pathname);
                if (!isAuthPage) {
                    window.location.href = '/login';
                }
            }
        }

        if (error.response?.status === 403 && typeof window !== 'undefined') {
            const isAdminPage = window.location.pathname.startsWith('/admin');
            if (isAdminPage && window.location.pathname !== '/dashboard') {
                window.location.href = '/dashboard';
            }
        }

        return Promise.reject(error);
    }
);

export default api;
