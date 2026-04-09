import bcrypt from 'bcryptjs';
import {
    ACCOUNT_STATUSES,
    AccountStatus,
    PublicUser,
    USER_ROLES,
    UserRole,
    toPublicUser,
} from '../model/user.model';
import { UserRepository } from '../repository/user.repository';

const MIN_PASSWORD_LENGTH = 8;

export interface CreateAdminUserInput {
    email: string;
    password: string;
    name: string;
    role: UserRole;
}

export interface UpdateUserRoleInput {
    actorUserId: number;
    targetUserId: number;
    role: UserRole;
}

export interface UpdateUserStatusInput {
    actorUserId: number;
    targetUserId: number;
    accountStatus: AccountStatus;
}

export interface SoftDeleteUserInput {
    actorUserId: number;
    targetUserId: number;
}

export class AdminUserServiceError extends Error {
    constructor(
        message: string,
        public statusCode: number = 400
    ) {
        super(message);
        this.name = 'AdminUserServiceError';
    }
}

export class AdminUserService {
    constructor(private userRepository: UserRepository) { }

    listUsers(): { users: PublicUser[] } {
        const users = this.userRepository.listAdmins().map(toPublicUser);
        return { users };
    }

    createUser(input: CreateAdminUserInput): { message: string; user: PublicUser } {
        const email = this.normalizeEmail(input.email);
        const password = input.password ?? '';
        const name = (input.name ?? '').trim();
        const role = this.normalizeRole(input.role);

        this.validateEmail(email);
        this.validatePassword(password);
        this.validateName(name);

        const existingUser = this.userRepository.findByEmail(email);
        if (existingUser) {
            throw new AdminUserServiceError('Email is already registered', 409);
        }

        const passwordHash = bcrypt.hashSync(password, 10);
        let user;
        try {
            user = this.userRepository.create({
                email,
                password: passwordHash,
                name,
                role,
                accountStatus: 'active',
            });
        } catch (error) {
            if (this.isUniqueEmailConstraintError(error)) {
                throw new AdminUserServiceError('Email is already registered', 409);
            }

            throw error;
        }

        if (!user) {
            throw new AdminUserServiceError('Unable to create user', 500);
        }

        return {
            message: 'User created successfully',
            user: toPublicUser(user),
        };
    }

    updateUserRole(input: UpdateUserRoleInput): { message: string; user: PublicUser } {
        const { actorUserId, targetUserId } = input;
        const role = this.normalizeRole(input.role);

        if (actorUserId === targetUserId) {
            throw new AdminUserServiceError('You cannot change your own role', 400);
        }

        const targetUser = this.userRepository.findById(targetUserId);
        if (!targetUser) {
            throw new AdminUserServiceError('User not found', 404);
        }

        if (targetUser.role === 'superadmin' && targetUser.accountStatus === 'active' && role !== 'superadmin') {
            this.ensureNotLastSuperadmin();
        }

        const updatedUser = this.userRepository.updateRole(targetUserId, role);
        if (!updatedUser) {
            throw new AdminUserServiceError('Unable to update role', 500);
        }

        return {
            message: 'User role updated successfully',
            user: toPublicUser(updatedUser),
        };
    }

    updateUserStatus(input: UpdateUserStatusInput): { message: string; user: PublicUser } {
        const { actorUserId, targetUserId } = input;
        const accountStatus = this.normalizeAccountStatus(input.accountStatus);

        if (actorUserId === targetUserId) {
            throw new AdminUserServiceError('You cannot change your own status', 400);
        }

        const targetUser = this.userRepository.findById(targetUserId);
        if (!targetUser) {
            throw new AdminUserServiceError('User not found', 404);
        }

        if (targetUser.role === 'superadmin' && targetUser.accountStatus === 'active' && accountStatus === 'disabled') {
            this.ensureNotLastSuperadmin();
        }

        const updatedUser = this.userRepository.updateStatus(targetUserId, accountStatus);
        if (!updatedUser) {
            throw new AdminUserServiceError('Unable to update status', 500);
        }

        return {
            message: 'User status updated successfully',
            user: toPublicUser(updatedUser),
        };
    }

    softDeleteUser(input: SoftDeleteUserInput): { message: string } {
        const { actorUserId, targetUserId } = input;

        if (actorUserId === targetUserId) {
            throw new AdminUserServiceError('You cannot delete your own account', 400);
        }

        const targetUser = this.userRepository.findById(targetUserId);
        if (!targetUser) {
            throw new AdminUserServiceError('User not found', 404);
        }

        if (targetUser.role === 'superadmin' && targetUser.accountStatus === 'active') {
            this.ensureNotLastSuperadmin();
        }

        const deletedAt = this.toSqliteDate(new Date());
        const deletedUser = this.userRepository.softDelete(targetUserId, deletedAt);
        if (!deletedUser) {
            throw new AdminUserServiceError('Unable to delete user', 500);
        }

        return { message: 'User deleted successfully' };
    }

    private ensureNotLastSuperadmin(): void {
        const totalSuperadmin = this.userRepository.countActiveByRole('superadmin');
        if (totalSuperadmin <= 1) {
            throw new AdminUserServiceError('Cannot modify the last active superadmin', 400);
        }
    }

    private normalizeEmail(email: string | undefined): string {
        return (email ?? '').trim().toLowerCase();
    }

    private normalizeRole(role: UserRole | undefined): UserRole {
        if (!role || !USER_ROLES.includes(role)) {
            throw new AdminUserServiceError('Role is invalid', 400);
        }
        return role;
    }

    private normalizeAccountStatus(accountStatus: AccountStatus | undefined): AccountStatus {
        if (!accountStatus || !ACCOUNT_STATUSES.includes(accountStatus)) {
            throw new AdminUserServiceError('Account status is invalid', 400);
        }
        return accountStatus;
    }

    private validateEmail(email: string): void {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            throw new AdminUserServiceError('Email is invalid', 400);
        }
    }

    private validatePassword(password: string): void {
        if (password.length < MIN_PASSWORD_LENGTH) {
            throw new AdminUserServiceError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`, 400);
        }
    }

    private validateName(name: string): void {
        if (!name) {
            throw new AdminUserServiceError('Name is required', 400);
        }
    }

    private toSqliteDate(date: Date): string {
        return date.toISOString().slice(0, 19).replace('T', ' ');
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
