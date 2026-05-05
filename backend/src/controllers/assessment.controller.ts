import { Request, Response } from 'express';
import { sendError, sendSuccess } from '../utils/response';
import { AssessmentService, AssessmentServiceError } from '../services/assessment.service';

export class AssessmentController {
    constructor(private service: AssessmentService) { }

    public async run(req: Request, res: Response): Promise<void> {
        try {
            if (!req.user?.userId) {
                sendError(res, 'Unauthorized', 401);
                return;
            }

            const result = this.service.run(req.user.userId);
            sendSuccess(res, result);
        } catch (error) {
            this.handleError(res, error, 'Failed to run assessment');
        }
    }

    public async latest(req: Request, res: Response): Promise<void> {
        try {
            if (!req.user?.userId) {
                sendError(res, 'Unauthorized', 401);
                return;
            }

            const result = this.service.getLatest(req.user.userId);
            sendSuccess(res, result);
        } catch (error) {
            this.handleError(res, error, 'Failed to get latest assessment');
        }
    }

    private handleError(res: Response, error: unknown, fallbackMessage: string): void {
        if (error instanceof AssessmentServiceError) {
            sendError(res, error.message, error.statusCode);
            return;
        }

        console.error(fallbackMessage, error);
        sendError(res, fallbackMessage);
    }
}
