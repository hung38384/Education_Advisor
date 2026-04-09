import type { UserRole } from '../model/user.model';

export {};

declare global {
    namespace Express {
        interface Request {
            user?: {
                userId: number;
                role: UserRole;
            };
        }
    }
}
