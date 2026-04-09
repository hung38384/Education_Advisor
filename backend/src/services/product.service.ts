import { Product } from '../model/product.model';
import { ProductRepository } from '../repository/product.repository';

export class ProductService {
    constructor(private repository: ProductRepository) { }

    getAll(): Product[] {
        return this.repository.getAll();
    }

    getById(id: number): Product | undefined {
        return this.repository.getById(id);
    }

    create(productData: Omit<Product, 'id' | 'createdAt'>): Product | undefined {
        return this.repository.create(productData);
    }

    update(id: number, productData: Partial<Omit<Product, 'id' | 'createdAt'>>): Product | undefined {
        return this.repository.update(id, productData);
    }

    delete(id: number): boolean {
        return this.repository.delete(id);
    }
}
