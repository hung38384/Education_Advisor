import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    admissionService,
    type AdmissionCartResponse,
    type AdmissionCartViewItem,
    type AdmissionSearchParams,
    type CreateAdmissionCartPayload,
} from '@/services/admissionService';

export const ADMISSION_CATALOG_QUERY_KEY = ['admissions', 'catalog'] as const;
export const ADMISSION_CART_QUERY_KEY = ['admissions', 'cart'] as const;

let nextOptimisticCartItemId = -1;

function createEmptyProfile(): AdmissionCartResponse['profile'] {
    return {
        fullName: null,
        averageGrade: null,
        favoriteSubjects: [],
        targetMajor: null,
        targetUniversity: null,
    };
}

type AddAdmissionCartContext = {
    previousCart?: AdmissionCartResponse;
    optimisticId?: number;
};

function hasSelection(item: AdmissionCartViewItem, payload: CreateAdmissionCartPayload): boolean {
    return item.school.id === payload.schoolId && item.major.id === payload.majorId && item.method.id === payload.methodId;
}

function createEmptyCart(): AdmissionCartResponse {
    return {
        profile: createEmptyProfile(),
        items: [],
    };
}

function createOptimisticCartItem(payload: CreateAdmissionCartPayload): AdmissionCartViewItem {
    const optimisticId = nextOptimisticCartItemId;
    nextOptimisticCartItemId -= 1;

    return {
        id: optimisticId,
        createdAt: new Date().toISOString(),
        school: {
            id: payload.schoolId,
            name: payload.snapshot.schoolName,
            city: 'Chưa xác định',
        },
        major: {
            id: payload.majorId,
            name: payload.snapshot.majorName,
            field: 'social',
        },
        method: {
            id: payload.methodId,
            name: payload.snapshot.methodName,
            type: 'direct',
            requiredAverage: payload.snapshot.requiredAverage,
            description: payload.snapshot.description,
        },
        evaluation: {
            chanceScore: 0,
            chanceLevel: 'medium',
            comment: 'Đang cập nhật đánh giá xét tuyển.',
        },
        orientation: 'Đang cập nhật định hướng học tập.',
        studyPlan: ['Đang cập nhật kế hoạch học tập.'],
    };
}

export function useAdmissionCatalog(params: AdmissionSearchParams) {
    return useQuery({
        queryKey: [...ADMISSION_CATALOG_QUERY_KEY, params],
        queryFn: () => admissionService.listCatalog(params),
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
        onMutate: async (payload): Promise<AddAdmissionCartContext> => {
            await queryClient.cancelQueries({ queryKey: ADMISSION_CART_QUERY_KEY });

            const previousCart = queryClient.getQueryData<AdmissionCartResponse>(ADMISSION_CART_QUERY_KEY);
            const optimisticItem = createOptimisticCartItem(payload);
            const baseCart = previousCart ?? createEmptyCart();

            if (!baseCart.items.some((item) => hasSelection(item, payload))) {
                queryClient.setQueryData<AdmissionCartResponse>(ADMISSION_CART_QUERY_KEY, {
                    ...baseCart,
                    items: [...baseCart.items, optimisticItem],
                });
            }

            return {
                previousCart,
                optimisticId: optimisticItem.id,
            };
        },
        onError: (_error, _payload, context) => {
            if (context?.optimisticId !== undefined) {
                queryClient.setQueryData<AdmissionCartResponse>(ADMISSION_CART_QUERY_KEY, (currentCart) => {
                    if (!currentCart) {
                        return context.previousCart;
                    }

                    return {
                        ...currentCart,
                        items: currentCart.items.filter((item) => item.id !== context.optimisticId),
                    };
                });
            }
        },
        onSuccess: (result, payload, context) => {
            queryClient.setQueryData<AdmissionCartResponse>(ADMISSION_CART_QUERY_KEY, (currentCart) => {
                const baseCart = currentCart ?? context?.previousCart ?? createEmptyCart();
                const items = baseCart.items.filter(
                    (item) => item.id !== context?.optimisticId && !hasSelection(item, payload)
                );

                return {
                    ...baseCart,
                    items: [...items, result.item],
                };
            });
        },
        onSettled: () => {
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
