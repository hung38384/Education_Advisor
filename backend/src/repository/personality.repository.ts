import { Database } from 'better-sqlite3';
import { PersonalityAnswer, PersonalityScores, PersonalitySubmission } from '../model/personality.model';

export interface CreatePersonalitySubmissionInput {
    userId: number;
    answers: Record<string, PersonalityAnswer>;
    mbtiType: string;
    scores: PersonalityScores;
}

export interface PersonalityRepository {
    create(input: CreatePersonalitySubmissionInput): PersonalitySubmission | undefined;
    findLatestByUserId(userId: number): PersonalitySubmission | undefined;
}

interface PersonalitySubmissionRow {
    id: number;
    userId: number;
    answers: string;
    mbtiType: string;
    scores: string;
    createdAt: string;
}

function parseAnswers(rawValue: string): Record<string, PersonalityAnswer> {
    try {
        const parsed = JSON.parse(rawValue);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return {};
        }

        return Object.entries(parsed).reduce<Record<string, PersonalityAnswer>>((acc, [key, value]) => {
            if (value === 'A' || value === 'B' || value === 'C' || value === 'D') {
                acc[key] = value;
            }
            return acc;
        }, {});
    } catch {
        return {};
    }
}

function parseScores(rawValue: string): PersonalityScores {
    const defaultScores: PersonalityScores = {
        E: 0,
        I: 0,
        S: 0,
        N: 0,
        T: 0,
        F: 0,
        J: 0,
        P: 0,
    };

    try {
        const parsed = JSON.parse(rawValue) as Partial<PersonalityScores>;
        return {
            E: Number(parsed.E ?? 0),
            I: Number(parsed.I ?? 0),
            S: Number(parsed.S ?? 0),
            N: Number(parsed.N ?? 0),
            T: Number(parsed.T ?? 0),
            F: Number(parsed.F ?? 0),
            J: Number(parsed.J ?? 0),
            P: Number(parsed.P ?? 0),
        };
    } catch {
        return defaultScores;
    }
}

function toModel(row: PersonalitySubmissionRow): PersonalitySubmission {
    return {
        id: row.id,
        userId: row.userId,
        answers: parseAnswers(row.answers),
        mbtiType: row.mbtiType,
        scores: parseScores(row.scores),
        createdAt: row.createdAt,
    };
}

export class SQLitePersonalityRepository implements PersonalityRepository {
    constructor(private db: Database) { }

    create(input: CreatePersonalitySubmissionInput): PersonalitySubmission | undefined {
        const stmt = this.db.prepare(`
            INSERT INTO personality_submission (userId, answers, mbtiType, scores)
            VALUES (?, ?, ?, ?)
        `);

        const result = stmt.run(
            input.userId,
            JSON.stringify(input.answers),
            input.mbtiType,
            JSON.stringify(input.scores)
        );

        const row = this.db.prepare('SELECT * FROM personality_submission WHERE id = ?')
            .get(Number(result.lastInsertRowid)) as PersonalitySubmissionRow | undefined;

        if (!row) {
            return undefined;
        }

        return toModel(row);
    }

    findLatestByUserId(userId: number): PersonalitySubmission | undefined {
        const stmt = this.db.prepare(`
            SELECT *
            FROM personality_submission
            WHERE userId = ?
            ORDER BY createdAt DESC, id DESC
            LIMIT 1
        `);

        const row = stmt.get(userId) as PersonalitySubmissionRow | undefined;
        if (!row) {
            return undefined;
        }

        return toModel(row);
    }
}
