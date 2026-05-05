import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { admissionService, type CreateAdmissionCartPayload } from '@/services/admissionService';

export const ADMISSION_CATALOG_QUERY_KEY = ['admissions', 'catalog'] as const;
export const ADMISSION_CART_QUERY_KEY = ['admissions', 'cart'] as const;

export function useAdmissionCatalog() {
    return useQuery({
        queryKey: ADMISSION_CATALOG_QUERY_KEY,
        queryFn: admissionService.getCatalog,
    });
}

export function useAdmissionCart() {
    return useQuery({
        queryKey: ADMISSION_CART_QUERY_KEY,
        queryFn: admissionService.listCart,
    });
}

export function useAddAdmissionCartItem() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (payload: CreateAdmissionCartPayload) => admissionService.addToCart(payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ADMISSION_CART_QUERY_KEY });
        },
    });
}

export function useRemoveAdmissionCartItem() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: number) => admissionService.removeFromCart(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ADMISSION_CART_QUERY_KEY });
        },
    });
}
