import { Request, Response } from 'express';
import { parseBody } from '../utils/request';
import { sendError, sendSuccess } from '../utils/response';
import { PersonalityService, PersonalityServiceError } from '../services/personality.service';

export class PersonalityController {
    constructor(private service: PersonalityService) { }

    public async getQuestions(req: Request, res: Response): Promise<void> {
        try {
            const result = this.service.getQuestions();
            sendSuccess(res, result);
        } catch (error) {
            this.handleError(res, error, 'Không thể tải câu hỏi đánh giá tính cách');
        }
    }

    public async submit(req: Request, res: Response): Promise<void> {
        try {
            if (!req.user?.userId) {
                sendError(res, 'Chưa đăng nhập', 401);
                return;
            }

            const body = await parseBody(req);
            const result = this.service.submit(req.user.userId, {
                answers: body.answers,
            });

            sendSuccess(res, result);
        } catch (error) {
            this.handleError(res, error, 'Không thể nộp bài đánh giá tính cách');
        }
    }

    public async getLatest(req: Request, res: Response): Promise<void> {
        try {
            if (!req.user?.userId) {
                sendError(res, 'Chưa đăng nhập', 401);
                return;
            }

            const result = this.service.getLatest(req.user.userId);
            sendSuccess(res, result);
        } catch (error) {
            this.handleError(res, error, 'Không thể lấy kết quả đánh giá tính cách mới nhất');
        }
    }

    public async getHistory(req: Request, res: Response): Promise<void> {
        try {
            if (!req.user?.userId) {
                sendError(res, 'Chưa đăng nhập', 401);
                return;
            }

            const result = this.service.getHistory(req.user.userId);
            sendSuccess(res, result);
        } catch (error) {
            this.handleError(res, error, 'Không thể lấy lịch sử đánh giá tính cách');
        }
    }

    private handleError(res: Response, error: unknown, fallbackMessage: string): void {
        if (error instanceof PersonalityServiceError) {
            sendError(res, error.message, error.statusCode);
            return;
        }

        console.error(fallbackMessage, error);
        sendError(res, fallbackMessage);
    }
}
