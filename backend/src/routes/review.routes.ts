import { NextFunction, RequestHandler, Router } from 'express';
import { ReviewController } from '../controllers/review.controller';

export function createReviewRouter(controller: ReviewController, authenticateToken: RequestHandler) {
    const router = Router();

    router.post('/api/review/run', authenticateToken, (req, res, next: NextFunction) => {
        void controller.run(req, res).catch(next);
    });

    router.get('/api/review/latest', authenticateToken, (req, res, next: NextFunction) => {
        void controller.latest(req, res).catch(next);
    });

    return router;
}
