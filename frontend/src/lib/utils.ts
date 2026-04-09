export const replacePathParams = (path: string, params: Record<string, string | number>) => {
    let newPath = path;
    Object.keys(params).forEach((key) => {
        newPath = newPath.replace(`{${key}}`, String(params[key]));
    });
    return newPath;
};
