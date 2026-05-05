import { RequestHandler, Router } from 'express';
import { AuthController } from '../controllers/auth.controller';

export function createAuthRouter(controller: AuthController, authenticateToken: RequestHandler) {
    const router = Router();

    router.post('/api/auth/register', (req, res) => controller.register(req, res));
    router.post('/api/auth/login', (req, res) => controller.login(req, res));
    router.post('/api/auth/forgot-password', (req, res) => controller.forgotPassword(req, res));
    router.post('/api/auth/reset-password', (req, res) => controller.resetPassword(req, res));
    router.post('/api/auth/change-password', authenticateToken, (req, res) => controller.changePassword(req, res));
    router.get('/api/auth/me', authenticateToken, (req, res) => controller.me(req, res));

    return router;
}
