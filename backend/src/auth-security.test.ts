import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import Database from 'better-sqlite3';
import { AuthService } from './services/auth.service';
import { createAuthenticateToken } from './middleware/auth.middleware';
import { SQLiteUserRepository } from './repository/user.repository';
import type { PasswordResetTokenRepository } from './repository/password-reset-token.repository';
import type { User, UserRole } from './model/user.model';
import type { UserRepository, CreateUserInput } from './repository/user.repository';

function createBaseUser(overrides: Partial<User> = {}): User {
    return {
        id: 1,
        email: 'user@example.com',
        password: '$2a$10$123456789012345678901uW4fXzzzzzzzzzzzzzzzzzzzzzzzz',
        name: 'User',
        role: 'user',
        accountStatus: 'active',
        deletedAt: null,
        createdAt: '2026-01-01 00:00:00',
        ...overrides,
    };
}

function createUserRepository(overrides: Partial<UserRepository> = {}): UserRepository {
    return {
        findByEmail: () => undefined,
        findById: () => undefined,
        findByIdIncludingDeleted: () => undefined,
        create: () => undefined,
        updatePassword: () => false,
        listAdmins: () => [],
        updateRole: () => undefined,
        updateStatus: () => undefined,
        softDelete: () => undefined,
        countActiveByRole: () => 0,
        ...overrides,
    };
}

function createResetTokenRepository(overrides: Partial<PasswordResetTokenRepository> = {}): PasswordResetTokenRepository {
    return {
        create: () => undefined,
        findValidByTokenHash: () => undefined,
        markUsed: () => false,
        invalidateUserTokens: () => 0,
        ...overrides,
    };
}

test('register always creates role user', async () => {
    let capturedInput: CreateUserInput | undefined;

    const userRepository = createUserRepository({
        create: (input) => {
            capturedInput = input;
            return createBaseUser({
                id: 2,
                email: input.email,
                password: input.password,
                name: input.name,
                role: input.role ?? 'user',
            });
        },
    });

    const resetRepository = createResetTokenRepository();
    const service = new AuthService(userRepository, resetRepository);

    const result = await service.register({
        email: 'new-user@example.com',
        password: 'password123',
        name: 'New User',
    });

    assert.ok(capturedInput);
    assert.equal(capturedInput.role, 'user');
    assert.equal(result.user.role, 'user');
});

test('forgot password does not expose reset token in production', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousDebugFlag = process.env.AUTH_DEBUG_RETURN_RESET_TOKEN;

    process.env.NODE_ENV = 'production';
    process.env.AUTH_DEBUG_RETURN_RESET_TOKEN = 'true';

    const userRepository = createUserRepository({
        findByEmail: () => createBaseUser(),
    });

    const resetRepository = createResetTokenRepository({
        create: () => ({
            id: 1,
            userId: 1,
            tokenHash: 'hashed-token',
            expiresAt: '2026-01-01 00:15:00',
            usedAt: null,
            createdAt: '2026-01-01 00:00:00',
        }),
    });

    const service = new AuthService(userRepository, resetRepository);
    const result = await service.forgotPassword({ email: 'user@example.com' });

    assert.equal(result.message, 'If the email exists, reset instructions have been sent.');
    assert.equal(result.resetToken, undefined);
    assert.equal(result.resetLink, undefined);

    process.env.NODE_ENV = previousNodeEnv;
    process.env.AUTH_DEBUG_RETURN_RESET_TOKEN = previousDebugFlag;
});

test('forgot password exposes reset token in non-production when debug flag is true', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousDebugFlag = process.env.AUTH_DEBUG_RETURN_RESET_TOKEN;
    const previousBaseUrl = process.env.APP_BASE_URL;

    process.env.NODE_ENV = 'development';
    process.env.AUTH_DEBUG_RETURN_RESET_TOKEN = 'true';
    process.env.APP_BASE_URL = 'http://localhost:3000';

    const userRepository = createUserRepository({
        findByEmail: () => createBaseUser(),
    });

    const resetRepository = createResetTokenRepository({
        create: () => ({
            id: 2,
            userId: 1,
            tokenHash: 'hashed-token',
            expiresAt: '2026-01-01 00:15:00',
            usedAt: null,
            createdAt: '2026-01-01 00:00:00',
        }),
    });

    const service = new AuthService(userRepository, resetRepository);
    const result = await service.forgotPassword({ email: 'user@example.com' });

    assert.ok(result.resetToken);
    assert.ok(result.resetLink?.includes('/reset-password?token='));

    process.env.NODE_ENV = previousNodeEnv;
    process.env.AUTH_DEBUG_RETURN_RESET_TOKEN = previousDebugFlag;
    process.env.APP_BASE_URL = previousBaseUrl;
});

test('auth middleware uses current role from database instead of role in token', () => {
    const previousSecret = process.env.JWT_ACCESS_SECRET;
    process.env.JWT_ACCESS_SECRET = 'test-secret';

    const repository = createUserRepository({
        findByIdIncludingDeleted: () => createBaseUser({ role: 'user', accountStatus: 'active' }),
    });

    const middleware = createAuthenticateToken(repository);
    const token = jwt.sign({ userId: 1, role: 'superadmin' }, process.env.JWT_ACCESS_SECRET);

    const req = {
        headers: {
            authorization: `Bearer ${token}`,
        },
    } as any;

    let responseStatus = 0;
    let responseBody: unknown;
    const res = {
        status(code: number) {
            responseStatus = code;
            return this;
        },
        json(payload: unknown) {
            responseBody = payload;
            return this;
        },
    } as any;

    let nextCalled = false;
    middleware(req, res, () => {
        nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.deepEqual(req.user, { userId: 1, role: 'user' });
    assert.equal(responseStatus, 0);
    assert.equal(responseBody, undefined);

    process.env.JWT_ACCESS_SECRET = previousSecret;
});

test('auth middleware blocks disabled user with forbidden response', () => {
    const previousSecret = process.env.JWT_ACCESS_SECRET;
    process.env.JWT_ACCESS_SECRET = 'test-secret';

    const repository = createUserRepository({
        findByIdIncludingDeleted: () => createBaseUser({ accountStatus: 'disabled' }),
    });

    const middleware = createAuthenticateToken(repository);
    const token = jwt.sign({ userId: 1, role: 'superadmin' }, process.env.JWT_ACCESS_SECRET);

    const req = {
        headers: {
            authorization: `Bearer ${token}`,
        },
    } as any;

    let responseStatus = 0;
    let responseBody: any;
    const res = {
        status(code: number) {
            responseStatus = code;
            return this;
        },
        json(payload: unknown) {
            responseBody = payload;
            return this;
        },
    } as any;

    let nextCalled = false;
    middleware(req, res, () => {
        nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(responseStatus, 403);
    assert.deepEqual(responseBody, { message: 'Forbidden' });

    process.env.JWT_ACCESS_SECRET = previousSecret;
});

test('admin listing includes role user for superadmin role management', () => {
    const db = new Database(':memory:');

    db.exec(`
        CREATE TABLE "user" (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            name TEXT NOT NULL,
            role TEXT NOT NULL,
            accountStatus TEXT NOT NULL,
            deletedAt DATETIME,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        INSERT INTO "user" (email, password, name, role, accountStatus, deletedAt)
        VALUES ('u@example.com', 'hashed', 'Normal User', 'user', 'active', NULL);
    `);

    const repository = new SQLiteUserRepository(db);
    const users = repository.listAdmins();

    assert.equal(users.length, 1);
    assert.equal(users[0]?.role, 'user');

    db.close();
});
