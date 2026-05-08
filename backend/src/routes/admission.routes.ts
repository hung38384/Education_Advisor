import { RequestHandler, Router } from 'express';
import { AdmissionController } from '../controllers/admission.controller';

export function createAdmissionRouter(controller: AdmissionController, authenticateToken: RequestHandler) {
    const router = Router();

    router.get('/api/admissions/catalog', authenticateToken, (req, res) => controller.listCatalog(req, res));
    router.get('/api/admissions/favorites', authenticateToken, (req, res) => controller.listFavorites(req, res));
    router.post('/api/admissions/favorites', authenticateToken, (req, res) => controller.addToFavorites(req, res));
    router.delete('/api/admissions/favorites/:id', authenticateToken, (req, res) => controller.removeFromFavorites(req, res));

    return router;
}
