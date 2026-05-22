import { Response } from 'express';

export const sendJSON = (res: Response, statusCode: number, data: any) => {
    res.status(statusCode).json(data);
};

export const sendSuccess = (res: Response, data: any, statusCode = 200) => {
    sendJSON(res, statusCode, data);
};

export const sendCreated = (res: Response, data: any) => {
    sendJSON(res, 201, data);
};

export const sendError = (res: Response, message: string, statusCode = 500) => {
    sendJSON(res, statusCode, { message });
};

export const sendNotFound = (res: Response, message = 'Không tìm thấy tài nguyên') => {
    sendJSON(res, 404, { message });
};

export const sendBadRequest = (res: Response, message: string) => {
    sendJSON(res, 400, { message });
};
