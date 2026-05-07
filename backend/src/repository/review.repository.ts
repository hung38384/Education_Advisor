import { Database } from 'better-sqlite3';
import { ReviewRecommendation, ReviewResult } from '../model/review.model';

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

function parseRecommendations(rawValue: string): ReviewRecommendation[] {
    try {
        const parsed = JSON.parse(rawValue);
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed
            .filter((item) => item && typeof item === 'object')
            .map((item) => {
                const value = item as Partial<ReviewRecommendation>;
                return {
                    name: String(value.name ?? ''),
                    score: Number(value.score ?? 0),
                    reason: String(value.reason ?? ''),
                };
            });
    } catch {
        return [];
    }
}

function parseSnapshot(rawValue: string): Record<string, unknown> {
    try {
        const parsed = JSON.parse(rawValue);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return {};
        }

        return parsed as Record<string, unknown>;
    } catch {
        return {};
    }
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
