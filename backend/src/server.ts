import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { setupRoutes } from './routes/index';
import { createDatabase } from './config/database';
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
import type { Database } from 'better-sqlite3';
import { requestMetricsStore, requestObservabilityMiddleware } from './middleware/observability.middleware';
import { SQLiteStudentProfileRepository } from './repository/student-profile.repository';
import { StudentProfileService } from './services/student-profile.service';
import { StudentProfileController } from './controllers/student-profile.controller';
import { SQLitePersonalityRepository } from './repository/personality.repository';
import { PersonalityService } from './services/personality.service';
import { PersonalityController } from './controllers/personality.controller';
import { SQLiteReviewRepository } from './repository/review.repository';
import { ReviewService } from './services/review.service';
import { ReviewController } from './controllers/review.controller';
import { SQLiteQARepository } from './repository/qa.repository';
import { QAService } from './services/qa.service';
import { QAController } from './controllers/qa.controller';
import { SQLiteAdmissionCartRepository } from './repository/admission-cart.repository';
import { AdmissionService } from './services/admission.service';
import { AdmissionController } from './controllers/admission.controller';
import { createQAInferenceClientFromEnv, QAInferenceClient } from './clients/ai.client';
import { AIAdmissionsClient, createAIAdmissionsClientFromEnv } from './clients/ai-admissions.client';
import { AIPredictClient, createAIPredictClientFromEnv } from './clients/ai-predict.client';
import { AdvisorClient, createAdvisorClientFromEnv } from './clients/advisor.client';
import { CacheStore, createCacheStore } from './cache-store';

dotenv.config();

export interface AppDependencies {
    authController: AuthController;
    adminUserController: AdminUserController;
    studentProfileController: StudentProfileController;
    personalityController: PersonalityController;
    reviewController: ReviewController;
    qaController: QAController;
    admissionController: AdmissionController;
    userRepository: UserRepository;
    authService: AuthService;
    authenticateToken: RequestHandler;
}

export interface DependencyOverrides {
    qaInferenceClient?: QAInferenceClient | null;
    aiAdmissionsClient?: AIAdmissionsClient;
    aiPredictClient?: AIPredictClient | null;
    advisorClient?: AdvisorClient | null;
    qaAnswerCacheStore?: CacheStore;
    qaConversationsCacheStore?: CacheStore;
    qaMessagesCacheStore?: CacheStore;
    admissionCatalogCacheStore?: CacheStore;
}

export function createDependencies(
    database?: Database,
    overrides: DependencyOverrides = {}
): AppDependencies {
    const db = database ?? createDatabase();

    const userRepository = new SQLiteUserRepository(db);
    const resetTokenRepository = new SQLitePasswordResetTokenRepository(db);
    const authService = new AuthService(userRepository, resetTokenRepository);
    const authController = new AuthController(authService);
    const adminUserService = new AdminUserService(userRepository);
    const adminUserController = new AdminUserController(adminUserService);

    const qaWebCacheEnabled = process.env.QA_WEB_CACHE_ENABLED
        ? isEnabled(process.env.QA_WEB_CACHE_ENABLED)
        : true;
    const qaWebCacheRedisUrl = (process.env.QA_WEB_CACHE_REDIS_URL || 'redis://localhost:6379').trim();

    const qaAnswerCacheStore = overrides.qaAnswerCacheStore ?? createCacheStore({
        enabled: qaWebCacheEnabled,
        redisUrl: qaWebCacheRedisUrl,
        namespace: (process.env.QA_WEB_CACHE_NAMESPACE || 'qa:web:v1').trim(),
    });

    const qaConversationsCacheStore = overrides.qaConversationsCacheStore ?? createCacheStore({
        enabled: qaWebCacheEnabled,
        redisUrl: qaWebCacheRedisUrl,
        namespace: (process.env.QA_CONVERSATIONS_CACHE_NAMESPACE || 'conversation:web:v1').trim(),
    });

    const qaMessagesCacheStore = overrides.qaMessagesCacheStore ?? qaConversationsCacheStore;

    const admissionCatalogCacheStore = overrides.admissionCatalogCacheStore ?? createCacheStore({
        enabled: qaWebCacheEnabled,
        redisUrl: qaWebCacheRedisUrl,
        namespace: (process.env.ADMISSION_CATALOG_CACHE_NAMESPACE || 'admission:web:v1').trim(),
    });

    const studentProfileRepository = new SQLiteStudentProfileRepository(db);
    const studentProfileService = new StudentProfileService(studentProfileRepository, {
        admissionCatalogStore: admissionCatalogCacheStore,
    });
    const studentProfileController = new StudentProfileController(studentProfileService);

    const personalityRepository = new SQLitePersonalityRepository(db);
    const personalityService = new PersonalityService(personalityRepository);
    const personalityController = new PersonalityController(personalityService);

    const qaRepository = new SQLiteQARepository(db);
    const qaInferenceClient = overrides.qaInferenceClient === undefined
        ? createQAInferenceClientFromEnv()
        : overrides.qaInferenceClient;
    const aiAdmissionsClient = overrides.aiAdmissionsClient ?? createAIAdmissionsClientFromEnv();
    const aiPredictClient = overrides.aiPredictClient === undefined
        ? createAIPredictClientFromEnv()
        : overrides.aiPredictClient;
    const advisorClient = overrides.advisorClient === undefined
        ? createAdvisorClientFromEnv()
        : overrides.advisorClient;

    const reviewRepository = new SQLiteReviewRepository(db);
    const reviewService = new ReviewService(
        reviewRepository,
        studentProfileRepository,
        personalityRepository,
        aiAdmissionsClient,
        aiPredictClient
    );
    const reviewController = new ReviewController(reviewService);

    void aiPredictClient;

    const qaService = new QAService(
        qaRepository,
        studentProfileRepository,
        personalityRepository,
        reviewRepository,
        qaInferenceClient,
        advisorClient,
        {
            answerStore: qaAnswerCacheStore,
            conversationsStore: qaConversationsCacheStore,
            messagesStore: qaMessagesCacheStore,
            answerTtlSeconds: parseTtlSeconds(process.env.QA_WEB_CACHE_TTL_SECONDS, 300),
            conversationsTtlSeconds: parseTtlSeconds(process.env.QA_CONVERSATIONS_CACHE_TTL_SECONDS, 120),
            messagesTtlSeconds: parseTtlSeconds(process.env.QA_MESSAGES_CACHE_TTL_SECONDS, 120),
        }
    );
    const qaController = new QAController(qaService);

    const admissionCartRepository = new SQLiteAdmissionCartRepository(db);
    const admissionService = new AdmissionService(
        admissionCartRepository,
        studentProfileRepository,
        aiAdmissionsClient,
        {
            store: admissionCatalogCacheStore,
            ttlSeconds: parseTtlSeconds(process.env.ADMISSION_CATALOG_CACHE_TTL_SECONDS, 300),
        }
    );
    const admissionController = new AdmissionController(admissionService);

    const authenticateToken = createAuthenticateToken(userRepository);

    return {
        authController,
        adminUserController,
        studentProfileController,
        personalityController,
        reviewController,
        qaController,
        admissionController,
        userRepository,
        authService,
        authenticateToken,
    };
}

export function initServer({
    authController,
    adminUserController,
    studentProfileController,
    personalityController,
    reviewController,
    qaController,
    admissionController,
    authenticateToken,
}: AppDependencies) {
    const app = express();
    const requestLogEnabled = process.env.REQUEST_LOG_ENABLED
        ? isEnabled(process.env.REQUEST_LOG_ENABLED)
        : process.env.NODE_ENV !== 'production';
    const metricsEnabled = process.env.METRICS_ENABLED
        ? isEnabled(process.env.METRICS_ENABLED)
        : true;

    app.use(cors());
    app.use(express.json());
    if (requestLogEnabled) {
        app.use(requestObservabilityMiddleware);
    }

    if (metricsEnabled) {
        app.get('/api/metrics', (req, res) => {
            res.json({
                timestamp: new Date().toISOString(),
                metrics: requestMetricsStore.snapshot(),
            });
        });
    }

    setupRoutes(app, {
        authController,
        adminUserController,
        studentProfileController,
        personalityController,
        reviewController,
        qaController,
        admissionController,
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

function parseTtlSeconds(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }

    return Math.round(parsed);
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

if (require.main === module) {
    void bootstrap().catch((error) => {
        console.error('Failed to start server:', error);
        process.exit(1);
    });
}
