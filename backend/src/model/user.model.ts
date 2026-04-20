export const USER_ROLES = ['user', 'admin', 'superadmin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ACCOUNT_STATUSES = ['active', 'disabled'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export interface User {
    id: number;
    email: string;
    password: string;
    name: string;
    role: UserRole;
    accountStatus: AccountStatus;
    tokenVersion: number;
    deletedAt: string | null;
    createdAt: string;
}

export type PublicUser = Omit<User, 'password' | 'tokenVersion'>;

export function toPublicUser(user: User): PublicUser {
    const { password, tokenVersion, ...publicUser } = user;
    return publicUser;
}
