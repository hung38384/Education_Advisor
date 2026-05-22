'use client';

import { useMutation } from '@tanstack/react-query';
import { useAtomValue, useSetAtom } from 'jotai';
import { useEffect } from 'react';
import { ACCESS_TOKEN_STORAGE_KEY } from '@/config/auth';
import {
    authService,
    ForgotPasswordPayload,
    LoginPayload,
    RegisterPayload,
    ResetPasswordPayload,
    ChangePasswordPayload,
} from '@/services/authService';
import { accessTokenAtom, authInitializedAtom, currentUserAtom } from '@/store/atoms';

function persistAccessToken(token: string | null): void {
    if (typeof window === 'undefined') {
        return;
    }

    if (token) {
        window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
        return;
    }

    window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
}

export function useLogin() {
    const setAccessToken = useSetAtom(accessTokenAtom);
    const setCurrentUser = useSetAtom(currentUserAtom);
    const setAuthInitialized = useSetAtom(authInitializedAtom);

    return useMutation({
        mutationFn: (payload: LoginPayload) => authService.login(payload),
        onSuccess: (data) => {
            persistAccessToken(data.accessToken);
            setAccessToken(data.accessToken);
            setCurrentUser(data.user);
            setAuthInitialized(true);
        },
    });
}

export function useRegister() {
    return useMutation({
        mutationFn: (payload: RegisterPayload) => authService.register(payload),
    });
}

export function useForgotPassword() {
    return useMutation({
        mutationFn: (payload: ForgotPasswordPayload) => authService.forgotPassword(payload),
    });
}

export function useResetPassword() {
    return useMutation({
        mutationFn: (payload: ResetPasswordPayload) => authService.resetPassword(payload),
    });
}

export function useChangePassword() {
    return useMutation({
        mutationFn: (payload: ChangePasswordPayload) => authService.changePassword(payload),
    });
}

export function useLogout() {
    const setAccessToken = useSetAtom(accessTokenAtom);
    const setCurrentUser = useSetAtom(currentUserAtom);
    const setAuthInitialized = useSetAtom(authInitializedAtom);

    return () => {
        persistAccessToken(null);
        setAccessToken(null);
        setCurrentUser(null);
        setAuthInitialized(true);
    };
}

export function useAuthInit() {
    const accessToken = useAtomValue(accessTokenAtom);
    const currentUser = useAtomValue(currentUserAtom);
    const initialized = useAtomValue(authInitializedAtom);
    const setAccessToken = useSetAtom(accessTokenAtom);
    const setCurrentUser = useSetAtom(currentUserAtom);
    const setAuthInitialized = useSetAtom(authInitializedAtom);

    useEffect(() => {
        if (initialized || typeof window === 'undefined') {
            return;
        }

        let cancelled = false;

        const initAuth = async () => {
            const storedToken = window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
            if (!storedToken) {
                if (!cancelled) {
                    setAccessToken(null);
                    setCurrentUser(null);
                    setAuthInitialized(true);
                }
                return;
            }

            setAccessToken(storedToken);

            try {
                const result = await authService.getMe();
                if (!cancelled) {
                    setCurrentUser(result.user);
                }
            } catch {
                if (!cancelled) {
                    persistAccessToken(null);
                    setAccessToken(null);
                    setCurrentUser(null);
                }
            } finally {
                if (!cancelled) {
                    setAuthInitialized(true);
                }
            }
        };

        void initAuth();

        return () => {
            cancelled = true;
        };
    }, [initialized, setAccessToken, setAuthInitialized, setCurrentUser]);

    return { initialized, accessToken, currentUser };
}
