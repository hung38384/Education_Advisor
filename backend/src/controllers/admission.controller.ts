import { Request, Response } from 'express';
import { parseBody } from '../utils/request';
import { sendBadRequest, sendError, sendSuccess } from '../utils/response';
import { AdmissionService, AdmissionServiceError } from '../services/admission.service';

export class AdmissionController {
    constructor(private service: AdmissionService) { }

    public async listCatalog(req: Request, res: Response): Promise<void> {
        try {
            if (!req.user?.userId) {
                sendError(res, 'Unauthorized', 401);
                return;
            }

            const result = this.service.listCatalog();
            sendSuccess(res, result);
        } catch (error) {
            this.handleError(res, error, 'Failed to list admissions catalog');
        }
    }

    public async listCart(req: Request, res: Response): Promise<void> {
        try {
            if (!req.user?.userId) {
                sendError(res, 'Unauthorized', 401);
                return;
            }

            const result = this.service.listCart(req.user.userId);
            sendSuccess(res, result);
        } catch (error) {
            this.handleError(res, error, 'Failed to list admissions cart');
        }
    }

    public async addToCart(req: Request, res: Response): Promise<void> {
        try {
            if (!req.user?.userId) {
                sendError(res, 'Unauthorized', 401);
                return;
            }

            const body = await parseBody(req);
            const result = this.service.addToCart(req.user.userId, {
                schoolId: body.schoolId,
                majorId: body.majorId,
                methodId: body.methodId,
            });

            sendSuccess(res, result, 201);
        } catch (error) {
            this.handleError(res, error, 'Failed to add admissions cart item');
        }
    }

    public async removeFromCart(req: Request, res: Response): Promise<void> {
        try {
            if (!req.user?.userId) {
                sendError(res, 'Unauthorized', 401);
                return;
            }

            const id = Number(req.params.id);
            if (!Number.isInteger(id) || id <= 0) {
                sendBadRequest(res, 'Admissions cart item id is invalid');
                return;
            }

            const result = this.service.removeFromCart(req.user.userId, id);
            sendSuccess(res, result);
        } catch (error) {
            this.handleError(res, error, 'Failed to remove admissions cart item');
        }
    }

    private handleError(res: Response, error: unknown, fallbackMessage: string): void {
        if (error instanceof AdmissionServiceError) {
            sendError(res, error.message, error.statusCode);
            return;
        }

        console.error(fallbackMessage, error);
        sendError(res, fallbackMessage);
    }
}
