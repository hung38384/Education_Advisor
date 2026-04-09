import api from '@/config/axios';
import { API_ROUTES } from '@/config/api-collection';

export type UserRole = 'user' | 'admin' | 'superadmin';
export type AccountStatus = 'active' | 'disabled';

export interface AuthUser {
    id: number;
    email: string;
    name: string;
    role: UserRole;
    accountStatus: AccountStatus;
    deletedAt: string | null;
    createdAt: string;
}

export interface RegisterPayload {
    email: string;
    password: string;
    name: string;
}

export interface LoginPayload {
    email: string;
    password: string;
}

export interface ForgotPasswordPayload {
    email: string;
}

export interface ResetPasswordPayload {
    token: string;
    newPassword: string;
}

export interface RegisterResponse {
    message: string;
    user: AuthUser;
}

export interface LoginResponse {
    accessToken: string;
    user: AuthUser;
}

export interface ForgotPasswordResponse {
    message: string;
    resetToken?: string;
    resetLink?: string;
}

export interface ResetPasswordResponse {
    message: string;
}

export interface MeResponse {
    user: AuthUser;
}

export const authService = {
    async register(payload: RegisterPayload): Promise<RegisterResponse> {
        const response = await api.post<RegisterResponse>(API_ROUTES.AUTH.REGISTER, payload);
        return response.data;
    },

    async login(payload: LoginPayload): Promise<LoginResponse> {
        const response = await api.post<LoginResponse>(API_ROUTES.AUTH.LOGIN, payload);
        return response.data;
    },

    async forgotPassword(payload: ForgotPasswordPayload): Promise<ForgotPasswordResponse> {
        const response = await api.post<ForgotPasswordResponse>(API_ROUTES.AUTH.FORGOT_PASSWORD, payload);
        return response.data;
    },

    async resetPassword(payload: ResetPasswordPayload): Promise<ResetPasswordResponse> {
        const response = await api.post<ResetPasswordResponse>(API_ROUTES.AUTH.RESET_PASSWORD, payload);
        return response.data;
    },

    async getMe(): Promise<MeResponse> {
        const response = await api.get<MeResponse>(API_ROUTES.AUTH.ME);
        return response.data;
    },
};
