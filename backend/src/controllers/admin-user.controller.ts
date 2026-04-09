import { Request, Response } from 'express';
import { parseBody } from '../utils/request';
import { sendBadRequest, sendCreated, sendError, sendSuccess } from '../utils/response';
import { AdminUserService, AdminUserServiceError } from '../services/admin-user.service';

export class AdminUserController {
    constructor(private service: AdminUserService) { }

    public async listUsers(req: Request, res: Response): Promise<void> {
        try {
            const result = this.service.listUsers();
            sendSuccess(res, result);
        } catch (error) {
            this.handleError(res, error, 'Failed to list users');
        }
    }

    public async createUser(req: Request, res: Response): Promise<void> {
        try {
            const body = await parseBody(req);
            const result = this.service.createUser({
                email: body.email,
                password: body.password,
                name: body.name,
                role: body.role,
            });

            sendCreated(res, result);
        } catch (error) {
            this.handleError(res, error, 'Failed to create user');
        }
    }

    public async updateRole(req: Request, res: Response): Promise<void> {
        try {
            const actorUserId = req.user?.userId;
            if (!actorUserId) {
                sendError(res, 'Unauthorized', 401);
                return;
            }

            const targetUserId = Number(req.params.id);
            if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
                sendBadRequest(res, 'User id is invalid');
                return;
            }

            const body = await parseBody(req);
            const result = this.service.updateUserRole({
                actorUserId,
                targetUserId,
                role: body.role,
            });

            sendSuccess(res, result);
        } catch (error) {
            this.handleError(res, error, 'Failed to update role');
        }
    }

    public async updateStatus(req: Request, res: Response): Promise<void> {
        try {
            const actorUserId = req.user?.userId;
            if (!actorUserId) {
                sendError(res, 'Unauthorized', 401);
                return;
            }

            const targetUserId = Number(req.params.id);
            if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
                sendBadRequest(res, 'User id is invalid');
                return;
            }

            const body = await parseBody(req);
            const result = this.service.updateUserStatus({
                actorUserId,
                targetUserId,
                accountStatus: body.accountStatus,
            });

            sendSuccess(res, result);
        } catch (error) {
            this.handleError(res, error, 'Failed to update status');
        }
    }

    public async deleteUser(req: Request, res: Response): Promise<void> {
        try {
            const actorUserId = req.user?.userId;
            if (!actorUserId) {
                sendError(res, 'Unauthorized', 401);
                return;
            }

            const targetUserId = Number(req.params.id);
            if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
                sendBadRequest(res, 'User id is invalid');
                return;
            }

            const result = this.service.softDeleteUser({
                actorUserId,
                targetUserId,
            });

            sendSuccess(res, result);
        } catch (error) {
            this.handleError(res, error, 'Failed to delete user');
        }
    }

    private handleError(res: Response, error: unknown, fallbackMessage: string): void {
        if (error instanceof AdminUserServiceError) {
            sendError(res, error.message, error.statusCode);
            return;
        }

        console.error(fallbackMessage, error);
        sendError(res, fallbackMessage);
    }
}
