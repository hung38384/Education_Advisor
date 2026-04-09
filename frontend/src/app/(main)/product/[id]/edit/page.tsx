"use client";

import type { FormEvent } from "react";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Textarea } from "@/components/ui";
import { getApiErrorMessage } from "@/lib/api-error";
import { productService, type Product } from "@/services/productService";

interface EditProductPageProps {
    params: Promise<{ id: string }>;
}

interface ProductFormData {
    name: string;
    price: string;
    description: string;
}

export default function EditProductPage({ params }: EditProductPageProps) {
    const router = useRouter();
    const [data, setData] = useState<ProductFormData>({
        name: "",
        price: "",
        description: "",
    });
    const [loading, setLoading] = useState<boolean>(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const { id } = use(params);
    const productId = Number(id);

    useEffect(() => {
        const fetchProduct = async () => {
            setLoading(true);
            setLoadError(null);

            if (!Number.isFinite(productId)) {
                setLoadError("ID sản phẩm không hợp lệ");
                setLoading(false);
                return;
            }

            try {
                const product: Product = await productService.getById(productId);
                setData({
                    name: product.name,
                    price: String(product.price),
                    description: product.description || "",
                });
            } catch (error) {
                setLoadError(getApiErrorMessage(error, "Không thể lấy thông tin sản phẩm"));
            } finally {
                setLoading(false);
            }
        };

        void fetchProduct();
    }, [productId]);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSubmitError(null);

        if (!Number.isFinite(productId)) {
            setSubmitError("ID sản phẩm không hợp lệ");
            return;
        }

        const price = Number(data.price);
        if (!Number.isFinite(price) || price < 0) {
            setSubmitError("Giá sản phẩm không hợp lệ");
            return;
        }

        try {
            await productService.update(productId, {
                name: data.name,
                price,
                description: data.description,
            });
            router.push("/product");
        } catch (error) {
            setSubmitError(getApiErrorMessage(error, "Không thể cập nhật sản phẩm"));
        }
    };

    const handleCancel = () => {
        router.push("/product");
    };

    if (loading) {
        return <div className="p-6">Loading...</div>;
    }

    if (loadError) {
        return (
            <main className="mx-auto mt-10 w-full max-w-[560px] px-4">
                <Card className="space-y-4">
                    <h2 className="text-xl font-semibold text-slate-900">Edit Product</h2>
                    <p className="text-sm text-red-700">{loadError}</p>
                    <Button type="button" variant="secondary" onClick={handleCancel}>
                        Back to product list
                    </Button>
                </Card>
            </main>
        );
    }

    return (
        <main className="mx-auto mt-10 w-full max-w-[560px] px-4">
            <Card className="space-y-4">
                <h2 className="text-xl font-semibold text-slate-900">Edit Product</h2>
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
                    {submitError && <p className="text-sm text-red-700">{submitError}</p>}
                    <div className="flex flex-wrap gap-2">
                        <Button type="submit">Save</Button>
                        <Button type="button" variant="secondary" onClick={handleCancel}>
                            Cancel
                        </Button>
                    </div>
                </form>
            </Card>
        </main>
    );
}
