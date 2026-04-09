export const API_ROUTES = {
    AUTH: {
        REGISTER: '/auth/register',
        LOGIN: '/auth/login',
        FORGOT_PASSWORD: '/auth/forgot-password',
        RESET_PASSWORD: '/auth/reset-password',
        ME: '/auth/me',
    },
    PRODUCT: {
        LIST: '/product',
        CREATE: '/product',
        GET: '/product/{id}',
        UPDATE: '/product/{id}',
        DELETE: '/product/{id}',
    },
    ADMIN_USER: {
        LIST: '/admin/users',
        CREATE: '/admin/users',
        UPDATE_ROLE: '/admin/users/{id}/role',
        UPDATE_STATUS: '/admin/users/{id}/status',
        DELETE: '/admin/users/{id}',
    },
};
