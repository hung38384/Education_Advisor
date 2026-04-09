import { ProductService } from '../services/product.service';
import { sendSuccess, sendCreated, sendError, sendNotFound, sendBadRequest } from '../utils/response';
import { parseBody } from '../utils/request';
import { Request, Response } from 'express';


export class ProductController {
    constructor(private service: ProductService) { }

    public async getAllProduct(req: Request, res: Response): Promise<void> {
        try {
            const products = this.service.getAll();
            sendSuccess(res, products);
        } catch (error) {
            this.handleError(res, error, 'Lỗi khi lấy danh sách product');
        }
    }

    public async getProductById(req: Request, res: Response): Promise<void> {
        try {
            const id = Number(req.params.id);
            const product = this.service.getById(id);
            if (!product) {
                sendNotFound(res, 'Sản phẩm không tồn tại');
                return;
            }
            sendSuccess(res, product);
        } catch (error) {
            this.handleError(res, error, 'Lỗi khi lấy product');
        }
    }

    public async createProduct(req: Request, res: Response): Promise<void> {
        try {
            const { name, description, price } = await parseBody(req);
            if (!name || !price) {
                sendBadRequest(res, 'Name và price là bắt buộc');
                return;
            }
            const newProduct = this.service.create({ name, description, price });
            sendCreated(res, newProduct);
        } catch (error) {
            this.handleError(res, error, 'Lỗi khi tạo product');
        }
    }

    public async updateProduct(req: Request, res: Response): Promise<void> {
        try {
            const id = Number(req.params.id);
            const { name, description, price } = await parseBody(req);
            const updatedProduct = this.service.update(id, { name, description, price });
            if (!updatedProduct) {
                sendNotFound(res, 'Sản phẩm không tồn tại');
                return;
            }
            sendSuccess(res, updatedProduct);
        } catch (error) {
            this.handleError(res, error, 'Lỗi khi cập nhật product');
        }
    }

    public async deleteProduct(req: Request, res: Response): Promise<void> {
        try {
            const id = Number(req.params.id);
            const deleted = this.service.delete(id);
            if (!deleted) {
                sendNotFound(res, 'Sản phẩm không tồn tại');
                return;
            }
            sendSuccess(res, { message: 'Xóa sản phẩm thành công' });
        } catch (error) {
            this.handleError(res, error, 'Lỗi khi xóa product');
        }
    }

    private handleError(res: Response, error: unknown, message: string): void {
        console.error(message, error);
        sendError(res, message);
    }
}
