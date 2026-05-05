import { Database } from 'better-sqlite3';
import { AdmissionCartItem, CreateAdmissionCartItemInput } from '../model/admission.model';

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
    createdAt: string;
}

function toModel(row: AdmissionCartItemRow): AdmissionCartItem {
    return {
        id: row.id,
        userId: row.userId,
        schoolId: row.schoolId,
        majorId: row.majorId,
        methodId: row.methodId,
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
            INSERT INTO admission_cart_item (userId, schoolId, majorId, methodId)
            VALUES (?, ?, ?, ?)
        `);

        const result = stmt.run(userId, input.schoolId, input.majorId, input.methodId);
        return this.findByIdForUser(Number(result.lastInsertRowid), userId);
    }

    delete(id: number, userId: number): boolean {
        const stmt = this.db.prepare('DELETE FROM admission_cart_item WHERE id = ? AND userId = ?');
        const result = stmt.run(id, userId);
        return result.changes > 0;
    }
}
