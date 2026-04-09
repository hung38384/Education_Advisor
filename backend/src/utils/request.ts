import { Request } from 'express';

export const parseBody = async (req: Request): Promise<any> => {
    return req.body;
};
