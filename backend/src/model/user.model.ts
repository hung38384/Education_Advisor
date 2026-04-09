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
    deletedAt: string | null;
    createdAt: string;
}

export type PublicUser = Omit<User, 'password'>;

export function toPublicUser(user: User): PublicUser {
    const { password, ...publicUser } = user;
    return publicUser;
}
