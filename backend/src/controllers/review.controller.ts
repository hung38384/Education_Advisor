import { Request, Response } from 'express';
import { sendError, sendSuccess } from '../utils/response';
import { ReviewService, ReviewServiceError } from '../services/review.service';

export class ReviewController {
    constructor(private service: ReviewService) { }

    public async run(req: Request, res: Response): Promise<void> {
        try {
            if (!req.user?.userId) {
                sendError(res, 'Chưa đăng nhập', 401);
                return;
            }

            const result = this.service.run(req.user.userId);
            sendSuccess(res, result);
        } catch (error) {
            this.handleError(res, error, 'Không thể chạy đánh giá độ phù hợp');
        }
    }

    public async latest(req: Request, res: Response): Promise<void> {
        try {
            if (!req.user?.userId) {
                sendError(res, 'Chưa đăng nhập', 401);
                return;
            }

            const result = this.service.getLatest(req.user.userId);
            sendSuccess(res, result);
        } catch (error) {
            this.handleError(res, error, 'Không thể lấy kết quả đánh giá độ phù hợp mới nhất');
        }
    }

    private handleError(res: Response, error: unknown, fallbackMessage: string): void {
        if (error instanceof ReviewServiceError) {
            sendError(res, error.message, error.statusCode);
            return;
        }

        console.error(fallbackMessage, error);
        sendError(res, fallbackMessage);
    }
}
