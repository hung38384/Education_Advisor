import { Request, Response } from 'express';
import { parseBody } from '../utils/request';
import { sendBadRequest, sendError, sendSuccess } from '../utils/response';
import { AdmissionService, AdmissionServiceError } from '../services/admission.service';

export class AdmissionController {
    constructor(private service: AdmissionService) { }

    public async listCatalog(req: Request, res: Response): Promise<void> {
        try {
            if (!req.user?.userId) {
                sendError(res, 'Chưa đăng nhập', 401);
                return;
            }

            const result = this.service.listCatalog(req.user.userId);
            sendSuccess(res, result);
        } catch (error) {
            this.handleError(res, error, 'Không thể lấy danh mục xét tuyển');
        }
    }

    public async listFavorites(req: Request, res: Response): Promise<void> {
        try {
            if (!req.user?.userId) {
                sendError(res, 'Chưa đăng nhập', 401);
                return;
            }

            const result = this.service.listFavorites(req.user.userId);
            sendSuccess(res, result);
        } catch (error) {
            this.handleError(res, error, 'Không thể lấy danh sách yêu thích xét tuyển');
        }
    }

    public async addToFavorites(req: Request, res: Response): Promise<void> {
        try {
            if (!req.user?.userId) {
                sendError(res, 'Chưa đăng nhập', 401);
                return;
            }

            const body = await parseBody(req);
            const result = this.service.addToFavorites(req.user.userId, {
                schoolId: body.schoolId,
                majorId: body.majorId,
                methodId: body.methodId,
            });

            sendSuccess(res, result, 201);
        } catch (error) {
            this.handleError(res, error, 'Không thể thêm lựa chọn vào danh sách yêu thích xét tuyển');
        }
    }

    public async removeFromFavorites(req: Request, res: Response): Promise<void> {
        try {
            if (!req.user?.userId) {
                sendError(res, 'Chưa đăng nhập', 401);
                return;
            }

            const id = Number(req.params.id);
            if (!Number.isInteger(id) || id <= 0) {
                sendBadRequest(res, 'Mã mục yêu thích xét tuyển không hợp lệ');
                return;
            }

            const result = this.service.removeFromFavorites(req.user.userId, id);
            sendSuccess(res, result);
        } catch (error) {
            this.handleError(res, error, 'Không thể xóa lựa chọn khỏi danh sách yêu thích xét tuyển');
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
