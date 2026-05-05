import { RequestHandler, Router } from 'express';
import { QAController } from '../controllers/qa.controller';

export function createQARouter(controller: QAController, authenticateToken: RequestHandler) {
    const router = Router();

    router.get('/api/qa/conversations', authenticateToken, (req, res) => controller.listConversations(req, res));
    router.post('/api/qa/conversations', authenticateToken, (req, res) => controller.createConversation(req, res));
    router.delete('/api/qa/conversations/:id', authenticateToken, (req, res) => controller.deleteConversation(req, res));
    router.get('/api/qa/messages', authenticateToken, (req, res) => controller.listMessages(req, res));
    router.post('/api/qa/ask', authenticateToken, (req, res) => controller.ask(req, res));

    return router;
}
