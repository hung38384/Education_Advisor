"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Textarea } from "@/components/ui";
import { getApiErrorMessage } from "@/lib/api-error";
import { productService, type Product } from "@/services/productService";

interface ProductFormData {
    name: string;
    price: string;
    description: string;
}

export default function ProductListPage() {
    const router = useRouter();
    const [products, setProducts] = useState<Product[]>([]);
    const [data, setData] = useState<ProductFormData>({
        name: "",
        price: "",
        description: "",
    });
    const [message, setMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const fetchProducts = async () => {
        try {
            const result = await productService.getAll();
            setProducts(result);
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, "Không thể tải danh sách sản phẩm"));
        }
    };

    useEffect(() => {
        void fetchProducts();
    }, []);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setMessage(null);
        setErrorMessage(null);

        const price = Number(data.price);
        if (!Number.isFinite(price) || price < 0) {
            setErrorMessage("Giá sản phẩm không hợp lệ");
            return;
        }

        try {
            await productService.create({
                name: data.name,
                price,
                description: data.description,
            });
            setMessage("Thêm sản phẩm thành công");
            setData({ name: "", price: "", description: "" });
            await fetchProducts();
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, "Không thể thêm sản phẩm"));
        }
    };

    const handleDelete = async (id: number) => {
        setMessage(null);
        setErrorMessage(null);

        try {
            const result = await productService.delete(id);
            setMessage(result.message);
            await fetchProducts();
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, "Không thể xóa sản phẩm"));
        }
    };

    const handleEdit = (product: Product) => {
        router.push(`/product/${product.id}/edit`);
    };

    return (
        <main className="space-y-5 p-6">
            <Card className="space-y-4">
                <h2 className="text-lg font-semibold text-slate-900">Product Form</h2>
                <form onSubmit={handleSubmit} className="grid gap-3">
                    <Input
                        type="text"
                        aria-label="Product name"
                        placeholder="Name"
                        value={data.name}
                        onChange={(event) => setData({ ...data, name: event.target.value })}
                        required
                    />
                    <Input
                        type="number"
                        min={0}
                        aria-label="Product price"
                        placeholder="Price"
                        value={data.price}
                        onChange={(event) => setData({ ...data, price: event.target.value })}
                        required
                    />
                    <Textarea
                        aria-label="Product description"
                        placeholder="Description"
                        value={data.description}
                        onChange={(event) => setData({ ...data, description: event.target.value })}
                    />
                    <Button type="submit" className="w-full sm:w-fit">
                        Add Product
                    </Button>
                </form>
            </Card>

            {message && <p className="text-sm text-green-700">{message}</p>}
            {errorMessage && <p className="text-sm text-red-700">{errorMessage}</p>}

            <Card className="space-y-4">
                <h2 className="text-lg font-semibold text-slate-900">Product List</h2>
                <ul className="space-y-2">
                    {products.map((product) => (
                        <li key={product.id} className="flex flex-col gap-2 rounded-md border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between">
                            <span className="text-sm text-slate-800">
                                {product.name} - {product.price} - {product.description}
                            </span>
                            <div className="flex gap-2">
                                <Button type="button" variant="secondary" onClick={() => handleEdit(product)}>
                                    Edit
                                </Button>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() => {
                                        if (product.id == null) {
                                            return;
                                        }
                                        void handleDelete(product.id);
                                    }}
                                >
                                    Delete
                                </Button>
                            </div>
                        </li>
                    ))}
                </ul>
            </Card>
        </main>
    );
}
