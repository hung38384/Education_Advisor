export const API_ROUTES = {
    AUTH: {
        REGISTER: '/auth/register',
        LOGIN: '/auth/login',
        FORGOT_PASSWORD: '/auth/forgot-password',
        RESET_PASSWORD: '/auth/reset-password',
        CHANGE_PASSWORD: '/auth/change-password',
        ME: '/auth/me',
    },
    PROFILE: {
        ME: '/profile/me',
    },
    PERSONALITY: {
        QUESTIONS: '/personality/questions',
        SUBMIT: '/personality/submit',
        LATEST: '/personality/latest',
        HISTORY: '/personality/history',
    },
    REVIEW: {
        RUN: '/review/run',
        LATEST: '/review/latest',
    },
    QA: {
        CONVERSATIONS: '/qa/conversations',
        CONVERSATION_DELETE: '/qa/conversations/{id}',
        MESSAGES: '/qa/messages',
        ASK: '/qa/ask',
    },
    ADMISSIONS: {
        CATALOG: '/admissions/catalog',
        FAVORITES_LIST: '/admissions/favorites',
        FAVORITES_CREATE: '/admissions/favorites',
        FAVORITES_DELETE: '/admissions/favorites/{id}',
    },
    ADMIN_USER: {
        LIST: '/admin/users',
        CREATE: '/admin/users',
        UPDATE_ROLE: '/admin/users/{id}/role',
        UPDATE_STATUS: '/admin/users/{id}/status',
        DELETE: '/admin/users/{id}',
    },
};
