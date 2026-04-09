import { Express, RequestHandler } from 'express';
import { AdminUserController } from '../controllers/admin-user.controller';
import { AuthController } from '../controllers/auth.controller';
import { ProductController } from '../controllers/product.controller';
import { createAdminUserRouter } from './admin-user.routes';
import { createAuthRouter } from './auth.routes';
import { createProductRouter } from './product.routes';

interface RouteDependencies {
    productController: ProductController;
    authController: AuthController;
    adminUserController: AdminUserController;
    authenticateToken: RequestHandler;
    requireSuperadmin: RequestHandler;
}

export function setupRoutes(app: Express, deps: RouteDependencies) {
    app.use(createAuthRouter(deps.authController, deps.authenticateToken));
    app.use(createProductRouter(deps.productController, deps.authenticateToken));
    app.use(createAdminUserRouter(deps.adminUserController, deps.authenticateToken, deps.requireSuperadmin));
}
