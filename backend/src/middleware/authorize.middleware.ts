import { NextFunction, Request, RequestHandler, Response } from 'express';
import { UserRole } from '../model/user.model';
import { sendError } from '../utils/response';

export function authorizeRoles(...roles: UserRole[]): RequestHandler {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.user) {
            sendError(res, 'Chưa đăng nhập', 401);
            return;
        }

        if (!roles.includes(req.user.role)) {
            sendError(res, 'Bạn không có quyền thực hiện thao tác này', 403);
            return;
        }

        next();
    };
}

export const requireSuperadmin = authorizeRoles('superadmin');
