import { RequestHandler, Router } from 'express';
import { StudentProfileController } from '../controllers/student-profile.controller';

export function createStudentProfileRouter(controller: StudentProfileController, authenticateToken: RequestHandler) {
    const router = Router();

    router.get('/api/profile/me', authenticateToken, (req, res) => controller.getMyProfile(req, res));
    router.put('/api/profile/me', authenticateToken, (req, res) => controller.upsertMyProfile(req, res));

    return router;
}
