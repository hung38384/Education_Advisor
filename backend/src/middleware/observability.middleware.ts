import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';

interface RouteMetrics {
    key: string;
    method: string;
    path: string;
    requests: number;
    errors: number;
    totalDurationMs: number;
    maxDurationMs: number;
}

interface RouteMetricsSnapshot extends RouteMetrics {
    averageDurationMs: number;
}

interface MetricsSnapshot {
    totalRequests: number;
    totalErrors: number;
    averageDurationMs: number;
    maxDurationMs: number;
    routes: RouteMetricsSnapshot[];
}

const MAX_ROUTE_METRICS_KEYS = 500;
const UNMATCHED_ROUTE = '__unmatched__';
const OTHER_ROUTE_KEY = 'OVERFLOW';
const OTHER_ROUTE_PATH = '__other__';
const REQUEST_TRACE_ENABLED = isEnabled(process.env.REQUEST_TRACE_ENABLED);

function isEnabled(value: string | undefined): boolean {
    const normalized = (value || '').trim().toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(normalized);
}

class RequestMetricsStore {
    private totalRequests = 0;
    private totalErrors = 0;
    private totalDurationMs = 0;
    private maxDurationMs = 0;
    private readonly routes = new Map<string, RouteMetrics>();

    private updateRoute(route: RouteMetrics, statusCode: number, durationMs: number): void {
        route.requests += 1;
        if (statusCode >= 400) {
            route.errors += 1;
        }
        route.totalDurationMs += durationMs;
        if (durationMs > route.maxDurationMs) {
            route.maxDurationMs = durationMs;
        }
    }

    record(method: string, path: string, statusCode: number, durationMs: number): void {
        this.totalRequests += 1;
        if (statusCode >= 400) {
            this.totalErrors += 1;
        }

        this.totalDurationMs += durationMs;
        if (durationMs > this.maxDurationMs) {
            this.maxDurationMs = durationMs;
        }

        const normalizedPath = path || UNMATCHED_ROUTE;
        const key = `${method} ${normalizedPath}`;
        const existing = this.routes.get(key);
        if (existing) {
            this.updateRoute(existing, statusCode, durationMs);
            return;
        }

        if (this.routes.size >= MAX_ROUTE_METRICS_KEYS) {
            const overflow = this.routes.get(OTHER_ROUTE_KEY);
            if (overflow) {
                this.updateRoute(overflow, statusCode, durationMs);
                return;
            }

            this.routes.set(OTHER_ROUTE_KEY, {
                key: OTHER_ROUTE_KEY,
                method: '*',
                path: OTHER_ROUTE_PATH,
                requests: 1,
                errors: statusCode >= 400 ? 1 : 0,
                totalDurationMs: durationMs,
                maxDurationMs: durationMs,
            });
            return;
        }

        this.routes.set(key, {
            key,
            method,
            path: normalizedPath,
            requests: 1,
            errors: statusCode >= 400 ? 1 : 0,
            totalDurationMs: durationMs,
            maxDurationMs: durationMs,
        });
    }

    snapshot(): MetricsSnapshot {
        const averageDurationMs = this.totalRequests > 0
            ? this.totalDurationMs / this.totalRequests
            : 0;

        const routes = Array.from(this.routes.values())
            .sort((first, second) => second.requests - first.requests)
            .map((item) => ({
                ...item,
                averageDurationMs: item.requests > 0 ? item.totalDurationMs / item.requests : 0,
            }));

        return {
            totalRequests: this.totalRequests,
            totalErrors: this.totalErrors,
            averageDurationMs,
            maxDurationMs: this.maxDurationMs,
            routes,
        };
    }
}

export const requestMetricsStore = new RequestMetricsStore();

function formatDuration(durationMs: number): string {
    return `${durationMs.toFixed(1)}ms`;
}

export function requestObservabilityMiddleware(req: Request, res: Response, next: NextFunction): void {
    const requestId = randomUUID();
    const startedAt = process.hrtime.bigint();
    res.setHeader('x-request-id', requestId);

    res.on('finish', () => {
        const endedAt = process.hrtime.bigint();
        const durationMs = Number(endedAt - startedAt) / 1_000_000;
        const path = req.route?.path ? String(req.route.path) : UNMATCHED_ROUTE;

        requestMetricsStore.record(req.method, path, res.statusCode, durationMs);

        if (REQUEST_TRACE_ENABLED) {
            console.log(
                `[http] requestId=${requestId} method=${req.method} path=${req.originalUrl} status=${res.statusCode} duration=${formatDuration(durationMs)}`
            );
        }
    });

    next();
}
