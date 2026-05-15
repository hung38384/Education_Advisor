import { Database } from 'better-sqlite3';
import {
    AdmissionCartItem,
    AdmissionFavoriteSnapshot,
    CreateAdmissionCartItemInput,
} from '../model/admission.model';

export interface AdmissionCartRepository {
    listByUserId(userId: number): AdmissionCartItem[];
    findByIdForUser(id: number, userId: number): AdmissionCartItem | undefined;
    findBySelection(
        userId: number,
        schoolId: string,
        majorId: string,
        methodId: string
    ): AdmissionCartItem | undefined;
    create(userId: number, input: CreateAdmissionCartItemInput): AdmissionCartItem | undefined;
    delete(id: number, userId: number): boolean;
}

interface AdmissionCartItemRow {
    id: number;
    userId: number;
    schoolId: string;
    majorId: string;
    methodId: string;
    snapshot: string | null;
    createdAt: string;
}

function parseSnapshot(raw: string | null): AdmissionFavoriteSnapshot | null {
    if (!raw || typeof raw !== 'string') {
        return null;
    }

    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (!parsed || typeof parsed !== 'object') {
            return null;
        }

        const schoolName = typeof parsed.schoolName === 'string' ? parsed.schoolName.trim() : '';
        const majorName = typeof parsed.majorName === 'string' ? parsed.majorName.trim() : '';
        const methodName = typeof parsed.methodName === 'string' ? parsed.methodName.trim() : '';
        const description = typeof parsed.description === 'string' ? parsed.description.trim() : '';
        const requiredAverage = typeof parsed.requiredAverage === 'number' && Number.isFinite(parsed.requiredAverage)
            ? parsed.requiredAverage
            : null;

        if (!schoolName || !majorName || !methodName || !description || requiredAverage === null) {
            return null;
        }

        return {
            schoolName,
            majorName,
            methodName,
            requiredAverage,
            description,
        };
    } catch {
        return null;
    }
}

function toModel(row: AdmissionCartItemRow): AdmissionCartItem {
    return {
        id: row.id,
        userId: row.userId,
        schoolId: row.schoolId,
        majorId: row.majorId,
        methodId: row.methodId,
        snapshot: parseSnapshot(row.snapshot),
        createdAt: row.createdAt,
    };
}

export class SQLiteAdmissionCartRepository implements AdmissionCartRepository {
    constructor(private db: Database) { }

    listByUserId(userId: number): AdmissionCartItem[] {
        const stmt = this.db.prepare(`
            SELECT *
            FROM admission_cart_item
            WHERE userId = ?
            ORDER BY createdAt DESC, id DESC
        `);

        const rows = stmt.all(userId) as AdmissionCartItemRow[];
        return rows.map(toModel);
    }

    findByIdForUser(id: number, userId: number): AdmissionCartItem | undefined {
        const stmt = this.db.prepare(`
            SELECT *
            FROM admission_cart_item
            WHERE id = ? AND userId = ?
        `);

        const row = stmt.get(id, userId) as AdmissionCartItemRow | undefined;
        if (!row) {
            return undefined;
        }

        return toModel(row);
    }

    findBySelection(
        userId: number,
        schoolId: string,
        majorId: string,
        methodId: string
    ): AdmissionCartItem | undefined {
        const stmt = this.db.prepare(`
            SELECT *
            FROM admission_cart_item
            WHERE userId = ? AND schoolId = ? AND majorId = ? AND methodId = ?
        `);

        const row = stmt.get(userId, schoolId, majorId, methodId) as AdmissionCartItemRow | undefined;
        if (!row) {
            return undefined;
        }

        return toModel(row);
    }

    create(userId: number, input: CreateAdmissionCartItemInput): AdmissionCartItem | undefined {
        const stmt = this.db.prepare(`
            INSERT INTO admission_cart_item (userId, schoolId, majorId, methodId, snapshot)
            VALUES (?, ?, ?, ?, ?)
        `);

        const result = stmt.run(
            userId,
            input.schoolId,
            input.majorId,
            input.methodId,
            JSON.stringify(input.snapshot)
        );
        return this.findByIdForUser(Number(result.lastInsertRowid), userId);
    }

    delete(id: number, userId: number): boolean {
        const stmt = this.db.prepare('DELETE FROM admission_cart_item WHERE id = ? AND userId = ?');
        const result = stmt.run(id, userId);
        return result.changes > 0;
    }
}
