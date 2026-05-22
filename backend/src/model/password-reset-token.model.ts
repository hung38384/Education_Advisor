export interface PasswordResetToken {
    id: number;
    userId: number;
    tokenHash: string;
    expiresAt: string;
    usedAt: string | null;
    createdAt: string;
}
