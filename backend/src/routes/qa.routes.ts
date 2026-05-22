import { NextFunction, Request, RequestHandler, Response, Router } from 'express';
import { QAController } from '../controllers/qa.controller';

function withAsyncError(handler: (req: Request, res: Response) => Promise<void>) {
    return (req: Request, res: Response, next: NextFunction) => {
        void handler(req, res).catch(next);
    };
}

export function createQARouter(controller: QAController, authenticateToken: RequestHandler) {
    const router = Router();

    router.get('/api/qa/conversations', authenticateToken, withAsyncError((req, res) => controller.listConversations(req, res)));
    router.post('/api/qa/conversations', authenticateToken, withAsyncError((req, res) => controller.createConversation(req, res)));
    router.delete('/api/qa/conversations/:id', authenticateToken, withAsyncError((req, res) => controller.deleteConversation(req, res)));
    router.get('/api/qa/messages', authenticateToken, withAsyncError((req, res) => controller.listMessages(req, res)));
    router.post('/api/qa/ask', authenticateToken, withAsyncError((req, res) => controller.ask(req, res)));
    router.post('/api/qa/advise', authenticateToken, withAsyncError((req, res) => controller.advise(req, res)));

    return router;
}
