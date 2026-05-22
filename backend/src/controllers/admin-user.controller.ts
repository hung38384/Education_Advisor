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
            this.handleError(res, error, 'Không thể lấy danh sách người dùng');
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
            this.handleError(res, error, 'Không thể tạo người dùng');
        }
    }

    public async updateRole(req: Request, res: Response): Promise<void> {
        try {
            const actorUserId = req.user?.userId;
            if (!actorUserId) {
                sendError(res, 'Chưa đăng nhập', 401);
                return;
            }

            const targetUserId = Number(req.params.id);
            if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
                sendBadRequest(res, 'Mã người dùng không hợp lệ');
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
            this.handleError(res, error, 'Không thể cập nhật vai trò');
        }
    }

    public async updateStatus(req: Request, res: Response): Promise<void> {
        try {
            const actorUserId = req.user?.userId;
            if (!actorUserId) {
                sendError(res, 'Chưa đăng nhập', 401);
                return;
            }

            const targetUserId = Number(req.params.id);
            if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
                sendBadRequest(res, 'Mã người dùng không hợp lệ');
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
            this.handleError(res, error, 'Không thể cập nhật trạng thái');
        }
    }

    public async deleteUser(req: Request, res: Response): Promise<void> {
        try {
            const actorUserId = req.user?.userId;
            if (!actorUserId) {
                sendError(res, 'Chưa đăng nhập', 401);
                return;
            }

            const targetUserId = Number(req.params.id);
            if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
                sendBadRequest(res, 'Mã người dùng không hợp lệ');
                return;
            }

            const result = this.service.softDeleteUser({
                actorUserId,
                targetUserId,
            });

            sendSuccess(res, result);
        } catch (error) {
            this.handleError(res, error, 'Không thể xóa người dùng');
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
