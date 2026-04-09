import api from '@/config/axios';
import { API_ROUTES } from '@/config/api-collection';
import { replacePathParams } from '@/lib/utils';

export interface Product {
    id?: number;
    name: string;
    price: number;
    description?: string;
}

export const productService = {
    async getAll(): Promise<Product[]> {
        const response = await api.get<Product[]>(API_ROUTES.PRODUCT.LIST);
        return response.data;
    },

    async getById(id: number): Promise<Product> {
        const url = replacePathParams(API_ROUTES.PRODUCT.GET, { id });
        const response = await api.get<Product>(url);
        return response.data;
    },

    async create(product: Omit<Product, 'id'>): Promise<Product> {
        const response = await api.post<Product>(API_ROUTES.PRODUCT.CREATE, product);
        return response.data;
    },

    async update(id: number, product: Omit<Product, 'id'>): Promise<Product> {
        const url = replacePathParams(API_ROUTES.PRODUCT.UPDATE, { id });
        const response = await api.put<Product>(url, product);
        return response.data;
    },

    async delete(id: number): Promise<{ message: string }> {
        const url = replacePathParams(API_ROUTES.PRODUCT.DELETE, { id });
        const response = await api.delete<{ message: string }>(url);
        return response.data;
    }
};
