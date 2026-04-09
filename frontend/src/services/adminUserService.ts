import api from '@/config/axios';
import { API_ROUTES } from '@/config/api-collection';
import { replacePathParams } from '@/lib/utils';
import type { AccountStatus, AuthUser, UserRole } from '@/services/authService';

export interface CreateAdminUserPayload {
    email: string;
    password: string;
    name: string;
    role: UserRole;
}

export interface UpdateUserRolePayload {
    role: UserRole;
}

export interface UpdateUserStatusPayload {
    accountStatus: AccountStatus;
}

export interface ListAdminUsersResponse {
    users: AuthUser[];
}

export const adminUserService = {
    async listUsers(): Promise<ListAdminUsersResponse> {
        const response = await api.get<ListAdminUsersResponse>(API_ROUTES.ADMIN_USER.LIST);
        return response.data;
    },

    async createUser(payload: CreateAdminUserPayload): Promise<{ message: string; user: AuthUser }> {
        const response = await api.post<{ message: string; user: AuthUser }>(API_ROUTES.ADMIN_USER.CREATE, payload);
        return response.data;
    },

    async updateRole(id: number, payload: UpdateUserRolePayload): Promise<{ message: string; user: AuthUser }> {
        const route = replacePathParams(API_ROUTES.ADMIN_USER.UPDATE_ROLE, { id });
        const response = await api.patch<{ message: string; user: AuthUser }>(route, payload);
        return response.data;
    },

    async updateStatus(id: number, payload: UpdateUserStatusPayload): Promise<{ message: string; user: AuthUser }> {
        const route = replacePathParams(API_ROUTES.ADMIN_USER.UPDATE_STATUS, { id });
        const response = await api.patch<{ message: string; user: AuthUser }>(route, payload);
        return response.data;
    },

    async deleteUser(id: number): Promise<{ message: string }> {
        const route = replacePathParams(API_ROUTES.ADMIN_USER.DELETE, { id });
        const response = await api.delete<{ message: string }>(route);
        return response.data;
    },
};
