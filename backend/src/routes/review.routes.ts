import { RequestHandler, Router } from 'express';
import { ReviewController } from '../controllers/review.controller';

export function createReviewRouter(controller: ReviewController, authenticateToken: RequestHandler) {
    const router = Router();

    router.post('/api/review/run', authenticateToken, (req, res) => controller.run(req, res));
    router.get('/api/review/latest', authenticateToken, (req, res) => controller.latest(req, res));

    return router;
}
