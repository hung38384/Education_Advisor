import { Database } from 'better-sqlite3';
import { ReviewFeaturedMethod, ReviewRecommendation, ReviewResult } from '../model/review.model';

export interface CreateReviewResultInput {
    userId: number;
    overallScore: number;
    summary: string;
    recommendations: ReviewRecommendation[];
    inputSnapshot: Record<string, unknown>;
}

export interface ReviewRepository {
    create(input: CreateReviewResultInput): ReviewResult | undefined;
    findLatestByUserId(userId: number): ReviewResult | undefined;
}

interface ReviewResultRow {
    id: number;
    userId: number;
    overallScore: number;
    summary: string;
    recommendations: string;
    inputSnapshot: string;
    createdAt: string;
}

function parseFeaturedMethod(value: unknown): ReviewFeaturedMethod | null {
    if (value == null) {
        return null;
    }

    if (typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Invalid review_result.recommendations JSON');
    }

    const record = value as Record<string, unknown>;
    const methodTag = typeof record.methodTag === 'string' ? record.methodTag.trim() : '';
    if (!methodTag) {
        throw new Error('Invalid review_result.recommendations JSON');
    }

    const latestYear = record.latestYear == null
        ? null
        : (typeof record.latestYear === 'number' && Number.isFinite(record.latestYear)
            ? Math.round(record.latestYear)
            : null);

    if (record.latestYear != null && latestYear == null) {
        throw new Error('Invalid review_result.recommendations JSON');
    }

    const latestScore = record.latestScore == null
        ? null
        : (typeof record.latestScore === 'number' && Number.isFinite(record.latestScore)
            ? record.latestScore
            : null);

    if (record.latestScore != null && latestScore == null) {
        throw new Error('Invalid review_result.recommendations JSON');
    }

    if (record.methodAlias != null && typeof record.methodAlias !== 'string') {
        throw new Error('Invalid review_result.recommendations JSON');
    }

    if (record.shortComment != null && typeof record.shortComment !== 'string') {
        throw new Error('Invalid review_result.recommendations JSON');
    }

    return {
        methodTag,
        methodAlias: typeof record.methodAlias === 'string' ? record.methodAlias : null,
        latestYear,
        latestScore,
        shortComment: typeof record.shortComment === 'string' ? record.shortComment : '',
    };
}

function parseRecommendations(rawValue: string): ReviewRecommendation[] {
    let parsed: unknown;
    try {
        parsed = JSON.parse(rawValue);
    } catch {
        throw new Error('Invalid review_result.recommendations JSON');
    }

    if (!Array.isArray(parsed)) {
        throw new Error('Invalid review_result.recommendations JSON');
    }

    return parsed.map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            throw new Error('Invalid review_result.recommendations JSON');
        }

        const value = item as Record<string, unknown>;

        const name = typeof value.name === 'string' ? value.name.trim() : '';
        const reason = typeof value.reason === 'string' ? value.reason.trim() : '';
        const score = value.score;

        if (!name || !reason || typeof score !== 'number' || !Number.isFinite(score)) {
            throw new Error('Invalid review_result.recommendations JSON');
        }

        const hasAnyRichField = value.universityCode != null
            || value.majorCode != null
            || value.majorName != null
            || value.universityName != null
            || value.featuredMethod != null;

        if (!hasAnyRichField) {
            return {
                name,
                score,
                reason,
                universityCode: '',
                universityName: null,
                majorCode: '',
                majorName: name,
                featuredMethod: null,
            };
        }

        const universityCode = typeof value.universityCode === 'string' ? value.universityCode.trim() : '';
        const majorCode = typeof value.majorCode === 'string' ? value.majorCode.trim() : '';
        const majorName = typeof value.majorName === 'string' ? value.majorName.trim() : '';

        if (!universityCode || !majorCode || !majorName) {
            throw new Error('Invalid review_result.recommendations JSON');
        }

        if (value.universityName != null && typeof value.universityName !== 'string') {
            throw new Error('Invalid review_result.recommendations JSON');
        }

        return {
            name,
            score,
            reason,
            universityCode,
            universityName: typeof value.universityName === 'string' ? value.universityName : null,
            majorCode,
            majorName,
            featuredMethod: parseFeaturedMethod(value.featuredMethod),
        };
    });
}

function parseSnapshot(rawValue: string): Record<string, unknown> {
    let parsed: unknown;
    try {
        parsed = JSON.parse(rawValue);
    } catch {
        throw new Error('Invalid review_result.inputSnapshot JSON');
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Invalid review_result.inputSnapshot JSON');
    }

    return parsed as Record<string, unknown>;
}

function toModel(row: ReviewResultRow): ReviewResult {
    return {
        id: row.id,
        userId: row.userId,
        overallScore: row.overallScore,
        summary: row.summary,
        recommendations: parseRecommendations(row.recommendations),
        inputSnapshot: parseSnapshot(row.inputSnapshot),
        createdAt: row.createdAt,
    };
}

export class SQLiteReviewRepository implements ReviewRepository {
    constructor(private db: Database) { }

    create(input: CreateReviewResultInput): ReviewResult | undefined {
        const stmt = this.db.prepare(`
            INSERT INTO review_result (userId, overallScore, summary, recommendations, inputSnapshot)
            VALUES (?, ?, ?, ?, ?)
        `);

        const result = stmt.run(
            input.userId,
            input.overallScore,
            input.summary,
            JSON.stringify(input.recommendations),
            JSON.stringify(input.inputSnapshot)
        );

        const row = this.db.prepare('SELECT * FROM review_result WHERE id = ?')
            .get(Number(result.lastInsertRowid)) as ReviewResultRow | undefined;

        if (!row) {
            return undefined;
        }

        return toModel(row);
    }

    findLatestByUserId(userId: number): ReviewResult | undefined {
        const stmt = this.db.prepare(`
            SELECT *
            FROM review_result
            WHERE userId = ?
            ORDER BY createdAt DESC, id DESC
            LIMIT 1
        `);

        const row = stmt.get(userId) as ReviewResultRow | undefined;
        if (!row) {
            return undefined;
        }

        return toModel(row);
    }
}
