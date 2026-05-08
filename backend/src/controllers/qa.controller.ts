import { Request, Response } from 'express';
import { parseBody } from '../utils/request';
import { sendError, sendSuccess } from '../utils/response';
import { QAService, QAServiceError } from '../services/qa.service';

export class QAController {
    constructor(private service: QAService) { }

    public async listConversations(req: Request, res: Response): Promise<void> {
        try {
            if (!req.user?.userId) {
                sendError(res, 'Chưa đăng nhập', 401);
                return;
            }

            const result = this.service.listConversations(req.user.userId);
            sendSuccess(res, result);
        } catch (error) {
            this.handleError(res, error, 'Không thể lấy danh sách cuộc trò chuyện');
        }
    }

    public async createConversation(req: Request, res: Response): Promise<void> {
        try {
            if (!req.user?.userId) {
                sendError(res, 'Chưa đăng nhập', 401);
                return;
            }

            const body = await parseBody(req);
            const result = this.service.createConversation(
                req.user.userId,
                typeof body.title === 'string' ? body.title : undefined
            );
            sendSuccess(res, result, 201);
        } catch (error) {
            this.handleError(res, error, 'Không thể tạo cuộc trò chuyện');
        }
    }

    public async deleteConversation(req: Request, res: Response): Promise<void> {
        try {
            if (!req.user?.userId) {
                sendError(res, 'Chưa đăng nhập', 401);
                return;
            }

            const conversationId = Number(req.params.id);
            const result = this.service.deleteConversation(req.user.userId, conversationId);
            sendSuccess(res, result);
        } catch (error) {
            this.handleError(res, error, 'Không thể xóa cuộc trò chuyện');
        }
    }

    public async listMessages(req: Request, res: Response): Promise<void> {
        try {
            if (!req.user?.userId) {
                sendError(res, 'Chưa đăng nhập', 401);
                return;
            }

            const conversationId = this.parseConversationId(req.query.conversationId);
            const result = this.service.listMessages(req.user.userId, conversationId);
            sendSuccess(res, result);
        } catch (error) {
            this.handleError(res, error, 'Không thể lấy tin nhắn cuộc trò chuyện');
        }
    }

    public async ask(req: Request, res: Response): Promise<void> {
        try {
            if (!req.user?.userId) {
                sendError(res, 'Chưa đăng nhập', 401);
                return;
            }

            const body = await parseBody(req);
            const conversationId = this.parseConversationId(body.conversationId);
            const result = await this.service.ask(
                req.user.userId,
                String(body.question ?? ''),
                conversationId
            );
            sendSuccess(res, result);
        } catch (error) {
            this.handleError(res, error, 'Không thể xử lý câu hỏi');
        }
    }

    private parseConversationId(rawValue: unknown): number | undefined {
        if (rawValue === undefined || rawValue === null || rawValue === '') {
            return undefined;
        }

        const parsed = Number(rawValue);
        if (!Number.isInteger(parsed) || parsed <= 0) {
            throw new QAServiceError('Mã cuộc trò chuyện không hợp lệ', 400);
        }

        return parsed;
    }

    private handleError(res: Response, error: unknown, fallbackMessage: string): void {
        if (error instanceof QAServiceError) {
            sendError(res, error.message, error.statusCode);
            return;
        }

        console.error(fallbackMessage, error);
        sendError(res, fallbackMessage);
    }
}
