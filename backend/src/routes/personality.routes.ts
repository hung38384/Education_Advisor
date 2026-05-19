import { RequestHandler, Router } from 'express';
import { PersonalityController } from '../controllers/personality.controller';

export function createPersonalityRouter(controller: PersonalityController, authenticateToken: RequestHandler) {
    const router = Router();

    router.get('/api/personality/questions', authenticateToken, (req, res) => controller.getQuestions(req, res));
    router.post('/api/personality/submit', authenticateToken, (req, res) => controller.submit(req, res));
    router.get('/api/personality/latest', authenticateToken, (req, res) => controller.getLatest(req, res));
    router.get('/api/personality/history', authenticateToken, (req, res) => controller.getHistory(req, res));

    return router;
}
