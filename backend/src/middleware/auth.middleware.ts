import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { UserRepository } from '../repository/user.repository';
import { sendError } from '../utils/response';
import { JWT_ALGORITHM, JWT_AUDIENCE, JWT_ISSUER } from '../config/auth';
interface JwtAccessPayload extends jwt.JwtPayload {
    userId: number;
    tokenVersion: number;
}

function getJwtSecret(): string {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) {
        throw new Error('JWT_ACCESS_SECRET is not set');
    }
    return secret;
}

export function createAuthenticateToken(userRepository: UserRepository) {
    return (req: Request, res: Response, next: NextFunction): void => {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            sendError(res, 'Unauthorized', 401);
            return;
        }

        const token = authHeader.slice('Bearer '.length).trim();
        if (!token) {
            sendError(res, 'Unauthorized', 401);
            return;
        }

        try {
            const decoded = jwt.verify(token, getJwtSecret(), {
                algorithms: [JWT_ALGORITHM],
                issuer: JWT_ISSUER,
                audience: JWT_AUDIENCE,
            });
            if (
                typeof decoded === 'string'
                || typeof (decoded as JwtAccessPayload).userId !== 'number'
                || typeof (decoded as JwtAccessPayload).tokenVersion !== 'number'
            ) {
                sendError(res, 'Unauthorized', 401);
                return;
            }

            const userId = (decoded as JwtAccessPayload).userId;
            const tokenVersion = (decoded as JwtAccessPayload).tokenVersion;
            const user = userRepository.findByIdIncludingDeleted(userId);
            if (!user) {
                sendError(res, 'Unauthorized', 401);
                return;
            }

            if (user.deletedAt || user.accountStatus !== 'active') {
                sendError(res, 'Forbidden', 403);
                return;
            }

            if (user.tokenVersion !== tokenVersion) {
                sendError(res, 'Unauthorized', 401);
                return;
            }

            req.user = {
                userId: user.id,
                role: user.role,
            };
            next();
        } catch (error) {
            sendError(res, 'Unauthorized', 401);
        }
    };
}
