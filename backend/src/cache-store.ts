import crypto from 'crypto';
import { createClient } from 'redis';

export type CacheStatus = 'hit' | 'miss' | 'bypass';

export interface CacheMetadata {
    layer: string;
    status: CacheStatus;
    keyVersion: string;
    ttlSeconds: number;
}

export interface CacheStore {
    enabled: boolean;
    keyVersion: string;
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
    purgePrefix(prefix: string): Promise<void>;
    buildMetadata(status: CacheStatus, ttlSeconds: number, layer?: string): CacheMetadata;
}

export interface CacheStoreOptions {
    enabled: boolean;
    redisUrl: string;
    namespace: string;
    keyVersion?: string;
}

interface MemoryCacheEntry {
    value: string;
    expiresAt: number;
}

export function createCacheStore(options: CacheStoreOptions): CacheStore {
    const namespace = normalizeNamespace(options.namespace);
    const keyVersion = options.keyVersion ?? resolveKeyVersion(namespace);

    if (!options.enabled) {
        return new DisabledCacheStore(keyVersion);
    }

    return new RedisBackedCacheStore({
        ...options,
        namespace,
        keyVersion,
    });
}

export function buildScopedDigest(value: unknown): string {
    return crypto
        .createHash('sha256')
        .update(stableStringify(value))
        .digest('hex')
        .slice(0, 24);
}

class DisabledCacheStore implements CacheStore {
    public readonly enabled = false;

    constructor(public readonly keyVersion: string) { }

    async get<T>(_key: string): Promise<T | null> {
        return null;
    }

    async set<T>(_key: string, _value: T, _ttlSeconds: number): Promise<void> {
        return;
    }

    async purgePrefix(_prefix: string): Promise<void> {
        return;
    }

    buildMetadata(status: CacheStatus, ttlSeconds: number, layer = 'none'): CacheMetadata {
        return {
            layer,
            status,
            keyVersion: this.keyVersion,
            ttlSeconds,
        };
    }
}

class RedisBackedCacheStore implements CacheStore {
    public readonly enabled = true;
    private readonly memory = new Map<string, MemoryCacheEntry>();
    private readonly client = createClient({ url: this.options.redisUrl });
    private connectPromise: Promise<void> | null = null;
    private redisAvailable = true;

    constructor(private readonly options: Required<CacheStoreOptions>) {
        this.client.on('error', (error) => {
            this.redisAvailable = false;
            console.warn(`[cache] Redis unavailable for ${this.options.namespace}: ${error.message}`);
        });
    }

    get keyVersion(): string {
        return this.options.keyVersion;
    }

    async get<T>(key: string): Promise<T | null> {
        const fullKey = this.toFullKey(key);
        const raw = await this.getRaw(fullKey);
        if (raw === null) {
            return null;
        }

        try {
            return JSON.parse(raw) as T;
        } catch {
            await this.deleteRaw(fullKey);
            return null;
        }
    }

    async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
        const normalizedTtlSeconds = normalizeTtlSeconds(ttlSeconds);
        const fullKey = this.toFullKey(key);
        const raw = JSON.stringify(value);

        if (await this.ensureConnected()) {
            try {
                await this.client.set(fullKey, raw, { EX: normalizedTtlSeconds });
                return;
            } catch (error) {
                this.markRedisUnavailable(error);
            }
        }

        this.memory.set(fullKey, {
            value: raw,
            expiresAt: Date.now() + normalizedTtlSeconds * 1000,
        });
    }

    async purgePrefix(prefix: string): Promise<void> {
        const fullPrefix = this.toFullKey(prefix);

        if (await this.ensureConnected()) {
            try {
                let cursor = 0;
                do {
                    const result = await this.client.scan(cursor, {
                        MATCH: `${fullPrefix}*`,
                        COUNT: 100,
                    });
                    cursor = result.cursor;
                    if (result.keys.length > 0) {
                        await this.client.del(result.keys);
                    }
                } while (cursor !== 0);
                return;
            } catch (error) {
                this.markRedisUnavailable(error);
            }
        }

        for (const key of this.memory.keys()) {
            if (key.startsWith(fullPrefix)) {
                this.memory.delete(key);
            }
        }
    }

    buildMetadata(status: CacheStatus, ttlSeconds: number, layer = 'web'): CacheMetadata {
        return {
            layer,
            status,
            keyVersion: this.keyVersion,
            ttlSeconds,
        };
    }

    private async getRaw(fullKey: string): Promise<string | null> {
        if (await this.ensureConnected()) {
            try {
                return await this.client.get(fullKey);
            } catch (error) {
                this.markRedisUnavailable(error);
            }
        }

        const entry = this.memory.get(fullKey);
        if (!entry) {
            return null;
        }

        if (entry.expiresAt <= Date.now()) {
            this.memory.delete(fullKey);
            return null;
        }

        return entry.value;
    }

    private async deleteRaw(fullKey: string): Promise<void> {
        if (await this.ensureConnected()) {
            try {
                await this.client.del(fullKey);
                return;
            } catch (error) {
                this.markRedisUnavailable(error);
            }
        }

        this.memory.delete(fullKey);
    }

    private async ensureConnected(): Promise<boolean> {
        if (!this.redisAvailable) {
            return false;
        }

        if (this.client.isOpen) {
            return true;
        }

        this.connectPromise ??= this.client
            .connect()
            .then(() => undefined)
            .catch((error) => {
                this.markRedisUnavailable(error);
            })
            .finally(() => {
                this.connectPromise = null;
            });

        await this.connectPromise;
        return this.client.isOpen;
    }

    private markRedisUnavailable(error: unknown): void {
        this.redisAvailable = false;
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[cache] Falling back to in-memory cache for ${this.options.namespace}: ${message}`);
    }

    private toFullKey(key: string): string {
        return `${this.options.namespace}:${key}`;
    }
}

function normalizeNamespace(namespace: string): string {
    return namespace.trim().replace(/:+$/g, '') || 'cache:v1';
}

function resolveKeyVersion(namespace: string): string {
    const version = namespace.split(':').reverse().find((part) => /^v\d+$/i.test(part));
    return version ?? 'v1';
}

function normalizeTtlSeconds(ttlSeconds: number): number {
    if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
        return 60;
    }

    return Math.max(1, Math.round(ttlSeconds));
}

function stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(',')}]`;
    }

    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}
