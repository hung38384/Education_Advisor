import { Request, Response } from 'express';
import { parseBody } from '../utils/request';
import { sendError, sendSuccess } from '../utils/response';
import { StudentProfileService, StudentProfileServiceError } from '../services/student-profile.service';

export class StudentProfileController {
    constructor(private service: StudentProfileService) { }

    public async getMyProfile(req: Request, res: Response): Promise<void> {
        try {
            if (!req.user?.userId) {
                sendError(res, 'Chưa đăng nhập', 401);
                return;
            }

            const result = this.service.getMyProfile(req.user.userId);
            sendSuccess(res, result);
        } catch (error) {
            this.handleError(res, error, 'Không thể lấy hồ sơ');
        }
    }

    public async upsertMyProfile(req: Request, res: Response): Promise<void> {
        try {
            if (!req.user?.userId) {
                sendError(res, 'Chưa đăng nhập', 401);
                return;
            }

            const body = await parseBody(req);
            const result = await this.service.upsertMyProfile(req.user.userId, {
                fullName: body.fullName,
                phone: body.phone,
                gender: body.gender,
                dateOfBirth: body.dateOfBirth,
                city: body.city,
                schoolName: body.schoolName,
                grade10: body.grade10,
                grade11: body.grade11,
                grade12: body.grade12,
                transcript: body.transcript,
                certificates: body.certificates,
                favoriteSubjects: body.favoriteSubjects,
                targetMajor: body.targetMajor,
                targetUniversity: body.targetUniversity,
                bio: body.bio,
            });

            sendSuccess(res, result);
        } catch (error) {
            this.handleError(res, error, 'Không thể lưu hồ sơ');
        }
    }

    private handleError(res: Response, error: unknown, fallbackMessage: string): void {
        if (error instanceof StudentProfileServiceError) {
            sendError(res, error.message, error.statusCode);
            return;
        }

        console.error(fallbackMessage, error);
        sendError(res, fallbackMessage);
    }
}
