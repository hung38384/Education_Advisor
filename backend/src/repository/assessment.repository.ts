import { Database } from 'better-sqlite3';
import { AssessmentRecommendation, AssessmentResult } from '../model/assessment.model';

export interface CreateAssessmentResultInput {
    userId: number;
    overallScore: number;
    summary: string;
    recommendations: AssessmentRecommendation[];
    inputSnapshot: Record<string, unknown>;
}

export interface AssessmentRepository {
    create(input: CreateAssessmentResultInput): AssessmentResult | undefined;
    findLatestByUserId(userId: number): AssessmentResult | undefined;
}

interface AssessmentResultRow {
    id: number;
    userId: number;
    overallScore: number;
    summary: string;
    recommendations: string;
    inputSnapshot: string;
    createdAt: string;
}

function parseRecommendations(rawValue: string): AssessmentRecommendation[] {
    try {
        const parsed = JSON.parse(rawValue);
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed
            .filter((item) => item && typeof item === 'object')
            .map((item) => {
                const value = item as Partial<AssessmentRecommendation>;
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

function toModel(row: AssessmentResultRow): AssessmentResult {
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

export class SQLiteAssessmentRepository implements AssessmentRepository {
    constructor(private db: Database) { }

    create(input: CreateAssessmentResultInput): AssessmentResult | undefined {
        const stmt = this.db.prepare(`
            INSERT INTO assessment_result (userId, overallScore, summary, recommendations, inputSnapshot)
            VALUES (?, ?, ?, ?, ?)
        `);

        const result = stmt.run(
            input.userId,
            input.overallScore,
            input.summary,
            JSON.stringify(input.recommendations),
            JSON.stringify(input.inputSnapshot)
        );

        const row = this.db.prepare('SELECT * FROM assessment_result WHERE id = ?')
            .get(Number(result.lastInsertRowid)) as AssessmentResultRow | undefined;

        if (!row) {
            return undefined;
        }

        return toModel(row);
    }

    findLatestByUserId(userId: number): AssessmentResult | undefined {
        const stmt = this.db.prepare(`
            SELECT *
            FROM assessment_result
            WHERE userId = ?
            ORDER BY createdAt DESC, id DESC
            LIMIT 1
        `);

        const row = stmt.get(userId) as AssessmentResultRow | undefined;
        if (!row) {
            return undefined;
        }

        return toModel(row);
    }
}
