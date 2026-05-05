import { RequestHandler, Router } from 'express';
import { AssessmentController } from '../controllers/assessment.controller';

export function createAssessmentRouter(controller: AssessmentController, authenticateToken: RequestHandler) {
    const router = Router();

    router.post('/api/review/run', authenticateToken, (req, res) => controller.run(req, res));
    router.get('/api/review/latest', authenticateToken, (req, res) => controller.latest(req, res));

    return router;
}
