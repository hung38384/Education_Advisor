import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'crypto';
import { PublicUser, User, UserRole, toPublicUser } from '../model/user.model';
import { PasswordResetTokenRepository } from '../repository/password-reset-token.repository';
import { UserRepository as IUserRepository } from '../repository/user.repository';
import { JWT_ALGORITHM, JWT_AUDIENCE, JWT_ISSUER } from '../config/auth';

const MIN_PASSWORD_LENGTH = 8;
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;
const GENERIC_FORGOT_PASSWORD_MESSAGE = 'If the email exists, reset instructions have been sent.';

export interface RegisterInput {
    email: string;
    password: string;
    name: string;
}

export interface LoginInput {
    email: string;
    password: string;
}

export interface ForgotPasswordInput {
    email: string;
}

export interface ResetPasswordInput {
    token: string;
    newPassword: string;
}

export interface ChangePasswordInput {
    userId: number;
    oldPassword: string;
    newPassword: string;
}

export interface AuthResult {
    accessToken: string;
    user: PublicUser;
}

export interface ForgotPasswordResult {
    message: string;
    resetToken?: string;
    resetLink?: string;
}

export class AuthServiceError extends Error {
    constructor(
        message: string,
        public statusCode: number = 400
    ) {
        super(message);
        this.name = 'AuthServiceError';
    }
}

interface AuthTokenPayload {
    userId: number;
    role: UserRole;
    tokenVersion: number;
}

export class AuthService {
    constructor(
        private userRepository: IUserRepository,
        private resetTokenRepository: PasswordResetTokenRepository
    ) { }

    async register(input: RegisterInput): Promise<{ message: string; user: PublicUser }> {
        const email = this.normalizeEmail(input.email);
        const password = input.password ?? '';
        const name = (input.name ?? '').trim();

        this.validateEmail(email);
        this.validatePassword(password);
        this.validateName(name);

        const passwordHash = bcrypt.hashSync(password, 10);
        let user: User | undefined;
        try {
            user = this.userRepository.create({
                email,
                password: passwordHash,
                name,
                role: 'user',
            });
        } catch (error) {
            if (this.isUniqueEmailConstraintError(error)) {
                throw new AuthServiceError('Email is already registered', 409);
            }

            throw error;
        }

        if (!user) {
            throw new AuthServiceError('Unable to create user', 500);
        }

        return {
            message: 'Register successful',
            user: toPublicUser(user),
        };
    }

    async login(input: LoginInput): Promise<AuthResult> {
        const email = this.normalizeEmail(input.email);
        const password = input.password ?? '';

        if (!email || !password) {
            throw new AuthServiceError('Email and password are required', 400);
        }

        const user = this.userRepository.findByEmail(email);
        if (!user) {
            throw new AuthServiceError('Invalid email or password', 401);
        }

        const isPasswordValid = bcrypt.compareSync(password, user.password);
        if (!isPasswordValid) {
            throw new AuthServiceError('Invalid email or password', 401);
        }

        if (user.accountStatus !== 'active') {
            throw new AuthServiceError('Account is disabled', 403);
        }

        const publicUser = toPublicUser(user);
        return {
            accessToken: this.generateAccessToken(user),
            user: publicUser,
        };
    }

    async forgotPassword(input: ForgotPasswordInput): Promise<ForgotPasswordResult> {
        const email = this.normalizeEmail(input.email);
        if (!email) {
            throw new AuthServiceError('Email is required', 400);
        }

        this.validateEmail(email);

        const user = this.userRepository.findByEmail(email);
        if (!user) {
            return { message: GENERIC_FORGOT_PASSWORD_MESSAGE };
        }

        const rawToken = randomBytes(32).toString('hex');
        const tokenHash = this.hashResetToken(rawToken);
        const expiresAt = this.toSqliteDate(new Date(Date.now() + RESET_TOKEN_TTL_MS));

        this.resetTokenRepository.invalidateUserTokens(user.id);
        this.resetTokenRepository.create({
            userId: user.id,
            tokenHash,
            expiresAt,
        });

        const result: ForgotPasswordResult = {
            message: GENERIC_FORGOT_PASSWORD_MESSAGE,
        };

        if (process.env.NODE_ENV !== 'production' && process.env.AUTH_DEBUG_RETURN_RESET_TOKEN === 'true') {
            result.resetToken = rawToken;
            const resetLink = this.buildResetLink(rawToken);
            if (resetLink) {
                result.resetLink = resetLink;
            }
        }

        return result;
    }

    async resetPassword(input: ResetPasswordInput): Promise<{ message: string }> {
        const token = (input.token ?? '').trim();
        const newPassword = input.newPassword ?? '';

        if (!token) {
            throw new AuthServiceError('Reset token is required', 400);
        }

        this.validatePassword(newPassword);

        const tokenHash = this.hashResetToken(token);
        const resetToken = this.resetTokenRepository.findValidByTokenHash(tokenHash);
        if (!resetToken) {
            throw new AuthServiceError('Reset token is invalid or expired', 400);
        }

        const user = this.userRepository.findById(resetToken.userId);
        if (!user) {
            throw new AuthServiceError('User not found for reset token', 400);
        }

        const consumed = this.resetTokenRepository.markUsed(resetToken.id);
        if (!consumed) {
            throw new AuthServiceError('Reset token is invalid or expired', 400);
        }

        const passwordHash = bcrypt.hashSync(newPassword, 10);
        const updated = this.userRepository.updatePassword(user.id, passwordHash);
        if (!updated) {
            throw new AuthServiceError('Unable to reset password', 500);
        }

        this.resetTokenRepository.invalidateUserTokens(user.id, resetToken.id);

        return { message: 'Password reset successful' };
    }

    async changePassword(input: ChangePasswordInput): Promise<{ message: string }> {
        const oldPassword = input.oldPassword ?? '';
        const newPassword = input.newPassword ?? '';

        if (!oldPassword) {
            throw new AuthServiceError('Current password is required', 400);
        }

        this.validatePassword(newPassword);

        const user = this.userRepository.findById(input.userId);
        if (!user) {
            throw new AuthServiceError('User not found', 404);
        }

        const isOldPasswordValid = bcrypt.compareSync(oldPassword, user.password);
        if (!isOldPasswordValid) {
            throw new AuthServiceError('Current password is incorrect', 401);
        }

        const passwordHash = bcrypt.hashSync(newPassword, 10);
        const updated = this.userRepository.updatePassword(user.id, passwordHash);
        if (!updated) {
            throw new AuthServiceError('Unable to change password', 500);
        }

        this.resetTokenRepository.invalidateUserTokens(user.id);

        return { message: 'Password changed successfully' };
    }

    async getMe(userId: number): Promise<{ user: PublicUser }> {
        const user = this.userRepository.findById(userId);
        if (!user) {
            throw new AuthServiceError('User not found', 404);
        }

        return { user: toPublicUser(user) };
    }

    generateAccessToken(user: Pick<User, 'id' | 'role' | 'tokenVersion'>): string {
        const secret = this.getJwtSecret();
        const expiresIn = (process.env.JWT_ACCESS_EXPIRES_IN || '1d') as jwt.SignOptions['expiresIn'];
        const payload: AuthTokenPayload = { userId: user.id, role: user.role, tokenVersion: user.tokenVersion };
        return jwt.sign(payload, secret, {
            expiresIn,
            algorithm: JWT_ALGORITHM,
            issuer: JWT_ISSUER,
            audience: JWT_AUDIENCE,
        });
    }

    private getJwtSecret(): string {
        const secret = process.env.JWT_ACCESS_SECRET;
        if (!secret) {
            throw new Error('JWT_ACCESS_SECRET is not set');
        }
        return secret;
    }

    private normalizeEmail(email: string | undefined): string {
        return (email ?? '').trim().toLowerCase();
    }

    private validateEmail(email: string): void {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            throw new AuthServiceError('Email is invalid', 400);
        }
    }

    private validatePassword(password: string): void {
        if (password.length < MIN_PASSWORD_LENGTH) {
            throw new AuthServiceError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`, 400);
        }
    }

    private validateName(name: string): void {
        if (!name) {
            throw new AuthServiceError('Name is required', 400);
        }
    }

    private hashResetToken(token: string): string {
        return createHash('sha256').update(token).digest('hex');
    }

    private toSqliteDate(date: Date): string {
        return date.toISOString().slice(0, 19).replace('T', ' ');
    }

    private buildResetLink(token: string): string | undefined {
        const baseUrl = process.env.APP_BASE_URL?.trim();
        if (!baseUrl) {
            return undefined;
        }

        return `${baseUrl.replace(/\/+$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
    }

    private isUniqueEmailConstraintError(error: unknown): boolean {
        if (!error || typeof error !== 'object') {
            return false;
        }

        const code = (error as { code?: string }).code;
        const message = (error as { message?: string }).message ?? '';
        return code === 'SQLITE_CONSTRAINT_UNIQUE'
            || (code === 'SQLITE_CONSTRAINT' && message.includes('UNIQUE constraint failed'));
    }
}
