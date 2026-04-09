import { Database } from 'better-sqlite3';
import { PasswordResetToken } from '../model/password-reset-token.model';

export interface CreatePasswordResetTokenInput {
    userId: number;
    tokenHash: string;
    expiresAt: string;
}

export interface PasswordResetTokenRepository {
    create(input: CreatePasswordResetTokenInput): PasswordResetToken | undefined;
    findValidByTokenHash(tokenHash: string): PasswordResetToken | undefined;
    markUsed(id: number): boolean;
    invalidateUserTokens(userId: number, excludeId?: number): number;
}

export class SQLitePasswordResetTokenRepository implements PasswordResetTokenRepository {
    constructor(private db: Database) { }

    create(input: CreatePasswordResetTokenInput): PasswordResetToken | undefined {
        const stmt = this.db.prepare(
            'INSERT INTO password_reset_token (userId, tokenHash, expiresAt) VALUES (?, ?, ?)'
        );
        const result = stmt.run(input.userId, input.tokenHash, input.expiresAt);
        return this.findById(Number(result.lastInsertRowid));
    }

    findValidByTokenHash(tokenHash: string): PasswordResetToken | undefined {
        const stmt = this.db.prepare(`
            SELECT * FROM password_reset_token
            WHERE tokenHash = ?
              AND usedAt IS NULL
              AND datetime(expiresAt) > datetime('now')
            ORDER BY createdAt DESC
            LIMIT 1
        `);

        return stmt.get(tokenHash) as PasswordResetToken | undefined;
    }

    markUsed(id: number): boolean {
        const stmt = this.db.prepare(`
            UPDATE password_reset_token
            SET usedAt = CURRENT_TIMESTAMP
            WHERE id = ? AND usedAt IS NULL
        `);

        const result = stmt.run(id);
        return result.changes > 0;
    }

    invalidateUserTokens(userId: number, excludeId?: number): number {
        if (typeof excludeId === 'number') {
            const stmt = this.db.prepare(`
                UPDATE password_reset_token
                SET usedAt = CURRENT_TIMESTAMP
                WHERE userId = ?
                  AND usedAt IS NULL
                  AND id != ?
            `);

            return stmt.run(userId, excludeId).changes;
        }

        const stmt = this.db.prepare(`
            UPDATE password_reset_token
            SET usedAt = CURRENT_TIMESTAMP
            WHERE userId = ?
              AND usedAt IS NULL
        `);

        return stmt.run(userId).changes;
    }

    private findById(id: number): PasswordResetToken | undefined {
        const stmt = this.db.prepare('SELECT * FROM password_reset_token WHERE id = ?');
        return stmt.get(id) as PasswordResetToken | undefined;
    }
}
