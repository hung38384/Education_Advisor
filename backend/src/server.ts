import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { setupRoutes } from './routes/index';
import { createDatabase } from './config/database';
import { SQLiteProductRepository } from './repository/product.repository';
import { ProductService } from './services/product.service';
import { ProductController } from './controllers/product.controller';
import { SQLiteUserRepository } from './repository/user.repository';
import { SQLitePasswordResetTokenRepository } from './repository/password-reset-token.repository';
import { AuthService, AuthServiceError } from './services/auth.service';
import { AuthController } from './controllers/auth.controller';
import { createAuthenticateToken } from './middleware/auth.middleware';
import { requireSuperadmin } from './middleware/authorize.middleware';
import { AdminUserService } from './services/admin-user.service';
import { AdminUserController } from './controllers/admin-user.controller';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { UserRepository } from './repository/user.repository';

dotenv.config();

interface AppDependencies {
    productController: ProductController;
    authController: AuthController;
    adminUserController: AdminUserController;
    userRepository: UserRepository;
    authService: AuthService;
    authenticateToken: RequestHandler;
}

function createDependencies(): AppDependencies {
    const db = createDatabase();

    const productRepository = new SQLiteProductRepository(db);
    const productService = new ProductService(productRepository);
    const productController = new ProductController(productService);

    const userRepository = new SQLiteUserRepository(db);
    const resetTokenRepository = new SQLitePasswordResetTokenRepository(db);
    const authService = new AuthService(userRepository, resetTokenRepository);
    const authController = new AuthController(authService);
    const adminUserService = new AdminUserService(userRepository);
    const adminUserController = new AdminUserController(adminUserService);

    const authenticateToken = createAuthenticateToken(userRepository);

    return {
        productController,
        authController,
        adminUserController,
        userRepository,
        authService,
        authenticateToken,
    };
}

function initServer({ productController, authController, adminUserController, authenticateToken }: AppDependencies) {
    const app = express();
    app.use(cors());
    app.use(express.json());
    setupRoutes(app, {
        productController,
        authController,
        adminUserController,
        authenticateToken,
        requireSuperadmin,
    });

    app.use((req: Request, res: Response) => {
        res.status(404).json({ message: 'Route không tồn tại' });
    });

    app.use((err: any, req: Request, res: Response, next: NextFunction) => {
        console.error('Server error:', err);
        res.status(500).json({ message: 'Lỗi hệ thống' });
    });

    return app;
}

function isEnabled(value: string | undefined): boolean {
    const normalized = (value || '').trim().toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(normalized);
}

async function seedDevUser(authService: AuthService): Promise<void> {
    if (!isEnabled(process.env.DEV_SEED_USER_ENABLED)) {
        return;
    }

    const email = process.env.DEV_SEED_USER_EMAIL?.trim();
    const password = process.env.DEV_SEED_USER_PASSWORD;
    const name = process.env.DEV_SEED_USER_NAME?.trim();

    if (!email || !password || !name) {
        console.warn('[auth-seed] Missing DEV_SEED_USER_EMAIL / DEV_SEED_USER_PASSWORD / DEV_SEED_USER_NAME');
        return;
    }

    try {
        await authService.register({ email, password, name });
        console.log(`[auth-seed] Created dev user: ${email}`);
    } catch (error) {
        if (error instanceof AuthServiceError && error.statusCode === 409) {
            return;
        }

        throw error;
    }
}

async function seedSuperadmin(userRepository: UserRepository, authService: AuthService): Promise<void> {
    const email = process.env.SUPERADMIN_EMAIL?.trim();
    const password = process.env.SUPERADMIN_PASSWORD;
    const name = process.env.SUPERADMIN_NAME?.trim();

    if (!email || !password || !name) {
        return;
    }

    try {
        const registerResult = await authService.register({ email, password, name });
        const promotedUser = userRepository.updateRole(registerResult.user.id, 'superadmin');
        if (!promotedUser) {
            throw new Error('Failed to promote configured SUPERADMIN_EMAIL to superadmin');
        }
        console.log(`[auth-seed] Created superadmin: ${email}`);
    } catch (error) {
        if (error instanceof AuthServiceError && error.statusCode === 409) {
            const existingUser = userRepository.findByEmail(email);
            if (!existingUser) {
                throw new Error('SUPERADMIN_EMAIL already exists but is not an active account');
            }

            if (existingUser.role !== 'superadmin') {
                const promotedUser = userRepository.updateRole(existingUser.id, 'superadmin');
                if (!promotedUser) {
                    throw new Error('Failed to promote configured SUPERADMIN_EMAIL to superadmin');
                }
            }
            return;
        }

        throw error;
    }
}

async function bootstrap(): Promise<void> {
    const dependencies = createDependencies();
    await seedSuperadmin(dependencies.userRepository, dependencies.authService);
    await seedDevUser(dependencies.authService);

    const app = initServer(dependencies);
    const PORT = process.env.PORT || 5001;
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}

void bootstrap().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
});
