import { Express, RequestHandler } from 'express';
import { AdminUserController } from '../controllers/admin-user.controller';
import { ReviewController } from '../controllers/review.controller';
import { AuthController } from '../controllers/auth.controller';
import { PersonalityController } from '../controllers/personality.controller';
import { QAController } from '../controllers/qa.controller';
import { StudentProfileController } from '../controllers/student-profile.controller';
import { AdmissionController } from '../controllers/admission.controller';
import { createAdminUserRouter } from './admin-user.routes';
import { createReviewRouter } from './review.routes';
import { createAuthRouter } from './auth.routes';
import { createPersonalityRouter } from './personality.routes';
import { createQARouter } from './qa.routes';
import { createStudentProfileRouter } from './student-profile.routes';
import { createAdmissionRouter } from './admission.routes';

interface RouteDependencies {
    authController: AuthController;
    adminUserController: AdminUserController;
    studentProfileController: StudentProfileController;
    personalityController: PersonalityController;
    reviewController: ReviewController;
    qaController: QAController;
    admissionController: AdmissionController;
    authenticateToken: RequestHandler;
    requireSuperadmin: RequestHandler;
}

export function setupRoutes(app: Express, deps: RouteDependencies) {
    app.use(createAuthRouter(deps.authController, deps.authenticateToken));
    app.use(createAdminUserRouter(deps.adminUserController, deps.authenticateToken, deps.requireSuperadmin));
    app.use(createStudentProfileRouter(deps.studentProfileController, deps.authenticateToken));
    app.use(createPersonalityRouter(deps.personalityController, deps.authenticateToken));
    app.use(createReviewRouter(deps.reviewController, deps.authenticateToken));
    app.use(createQARouter(deps.qaController, deps.authenticateToken));
    app.use(createAdmissionRouter(deps.admissionController, deps.authenticateToken));
}
