import { RequestHandler, Router } from 'express';
import { AdmissionController } from '../controllers/admission.controller';

export function createAdmissionRouter(controller: AdmissionController, authenticateToken: RequestHandler) {
    const router = Router();

    router.get('/api/admissions/catalog', authenticateToken, (req, res) => controller.listCatalog(req, res));
    router.get('/api/admissions/cart', authenticateToken, (req, res) => controller.listCart(req, res));
    router.post('/api/admissions/cart', authenticateToken, (req, res) => controller.addToCart(req, res));
    router.delete('/api/admissions/cart/:id', authenticateToken, (req, res) => controller.removeFromCart(req, res));

    return router;
}
