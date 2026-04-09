import { Request, Response } from 'express';
import { parseBody } from '../utils/request';
import { sendBadRequest, sendCreated, sendError, sendSuccess } from '../utils/response';
import { AuthService, AuthServiceError } from '../services/auth.service';

export class AuthController {
    constructor(private service: AuthService) { }

    public async register(req: Request, res: Response): Promise<void> {
        try {
            const body = await parseBody(req);
            if (body && typeof body === 'object' && Object.prototype.hasOwnProperty.call(body, 'role')) {
                sendBadRequest(res, 'Role field is not allowed for public registration');
                return;
            }

            const result = await this.service.register({
                email: body.email,
                password: body.password,
                name: body.name,
            });

            sendCreated(res, result);
        } catch (error) {
            this.handleError(res, error, 'Failed to register');
        }
    }

    public async login(req: Request, res: Response): Promise<void> {
        try {
            const body = await parseBody(req);
            const result = await this.service.login({
                email: body.email,
                password: body.password,
            });

            sendSuccess(res, result);
        } catch (error) {
            this.handleError(res, error, 'Failed to login');
        }
    }

    public async forgotPassword(req: Request, res: Response): Promise<void> {
        try {
            const body = await parseBody(req);
            const result = await this.service.forgotPassword({
                email: body.email,
            });

            sendSuccess(res, result);
        } catch (error) {
            this.handleError(res, error, 'Failed to process forgot password');
        }
    }

    public async resetPassword(req: Request, res: Response): Promise<void> {
        try {
            const body = await parseBody(req);
            const result = await this.service.resetPassword({
                token: body.token,
                newPassword: body.newPassword,
            });

            sendSuccess(res, result);
        } catch (error) {
            this.handleError(res, error, 'Failed to reset password');
        }
    }

    public async me(req: Request, res: Response): Promise<void> {
        try {
            if (!req.user?.userId) {
                sendError(res, 'Unauthorized', 401);
                return;
            }

            const result = await this.service.getMe(req.user.userId);
            sendSuccess(res, result);
        } catch (error) {
            this.handleError(res, error, 'Failed to get current user');
        }
    }

    private handleError(res: Response, error: unknown, fallbackMessage: string): void {
        if (error instanceof AuthServiceError) {
            sendError(res, error.message, error.statusCode);
            return;
        }

        console.error(fallbackMessage, error);
        sendError(res, fallbackMessage);
    }
}
