import { RequestHandler, Router } from 'express';
import { AdminUserController } from '../controllers/admin-user.controller';

export function createAdminUserRouter(
    controller: AdminUserController,
    authenticateToken: RequestHandler,
    requireSuperadmin: RequestHandler
) {
    const router = Router();

    router.use('/api/admin/users', authenticateToken, requireSuperadmin);

    router.get('/api/admin/users', (req, res) => controller.listUsers(req, res));
    router.post('/api/admin/users', (req, res) => controller.createUser(req, res));
    router.patch('/api/admin/users/:id/role', (req, res) => controller.updateRole(req, res));
    router.patch('/api/admin/users/:id/status', (req, res) => controller.updateStatus(req, res));
    router.delete('/api/admin/users/:id', (req, res) => controller.deleteUser(req, res));

    return router;
}
