import { RequestHandler, Router } from 'express';
import { ProductController } from '../controllers/product.controller';

export function createProductRouter(controller: ProductController, authenticateToken?: RequestHandler) {
    const router = Router();
    if (authenticateToken) {
        router.use('/api/product', authenticateToken);
    }

    router.get('/api/product', (req, res) => controller.getAllProduct(req, res));
    router.get('/api/product/:id', (req, res) => controller.getProductById(req, res));
    router.post('/api/product', (req, res) => controller.createProduct(req, res));
    router.put('/api/product/:id', (req, res) => controller.updateProduct(req, res));
    router.delete('/api/product/:id', (req, res) => controller.deleteProduct(req, res));
    return router;
}
