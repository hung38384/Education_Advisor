import { Database } from 'better-sqlite3';
import { Product } from '../model/product.model';

export interface ProductRepository {
    getAll(): Product[];
    getById(id: number): Product | undefined;
    create(productData: Omit<Product, 'id' | 'createdAt'>): Product | undefined;
    update(id: number, productData: Partial<Omit<Product, 'id' | 'createdAt'>>): Product | undefined;
    delete(id: number): boolean;
}

export class SQLiteProductRepository implements ProductRepository {
    constructor(private db: Database) { }

    getAll(): Product[] {
        const stmt = this.db.prepare('SELECT * FROM product ORDER BY createdAt DESC');
        return stmt.all() as Product[];
    }

    getById(id: number): Product | undefined {
        const stmt = this.db.prepare('SELECT * FROM product WHERE id = ?');
        return stmt.get(id) as Product | undefined;
    }

    create(productData: Omit<Product, 'id' | 'createdAt'>): Product | undefined {
        const { name, description, price } = productData;
        const stmt = this.db.prepare(
            'INSERT INTO product (name, description, price) VALUES (?, ?, ?)'
        );
        const result = stmt.run(name, description || '', price);
        return this.getById(result.lastInsertRowid as number);
    }

    update(id: number, productData: Partial<Omit<Product, 'id' | 'createdAt'>>): Product | undefined {
        const { name, description, price } = productData;
        const stmt = this.db.prepare(
            'UPDATE product SET name = ?, description = ?, price = ? WHERE id = ?'
        );
        stmt.run(name, description, price, id);
        return this.getById(id);
    }

    delete(id: number): boolean {
        const stmt = this.db.prepare('DELETE FROM product WHERE id = ?');
        const result = stmt.run(id);
        return result.changes > 0;
    }
}
