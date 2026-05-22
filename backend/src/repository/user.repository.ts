import { Database } from 'better-sqlite3';
import { AccountStatus, User, UserRole } from '../model/user.model';

export interface CreateUserInput {
    email: string;
    password: string;
    name: string;
    role?: UserRole;
    accountStatus?: AccountStatus;
}

export interface UserRepository {
    findByEmail(email: string): User | undefined;
    findById(id: number): User | undefined;
    findByIdIncludingDeleted(id: number): User | undefined;
    create(input: CreateUserInput): User | undefined;
    updatePassword(id: number, passwordHash: string): boolean;
    listAdmins(): User[];
    updateRole(id: number, role: UserRole): User | undefined;
    updateStatus(id: number, accountStatus: AccountStatus): User | undefined;
    softDelete(id: number, deletedAt: string): User | undefined;
    countActiveByRole(role: UserRole): number;
}

export class SQLiteUserRepository implements UserRepository {
    constructor(private db: Database) { }

    findByEmail(email: string): User | undefined {
        const stmt = this.db.prepare('SELECT * FROM "user" WHERE email = ? AND deletedAt IS NULL');
        return stmt.get(email) as User | undefined;
    }

    findById(id: number): User | undefined {
        const stmt = this.db.prepare('SELECT * FROM "user" WHERE id = ? AND deletedAt IS NULL');
        return stmt.get(id) as User | undefined;
    }

    findByIdIncludingDeleted(id: number): User | undefined {
        const stmt = this.db.prepare('SELECT * FROM "user" WHERE id = ?');
        return stmt.get(id) as User | undefined;
    }

    create(input: CreateUserInput): User | undefined {
        const stmt = this.db.prepare(`
            INSERT INTO "user" (email, password, name, role, accountStatus)
            VALUES (?, ?, ?, ?, ?)
        `);

        const result = stmt.run(
            input.email,
            input.password,
            input.name,
            input.role ?? 'user',
            input.accountStatus ?? 'active'
        );

        return this.findById(Number(result.lastInsertRowid));
    }

    updatePassword(id: number, passwordHash: string): boolean {
        const stmt = this.db.prepare('UPDATE "user" SET password = ?, tokenVersion = tokenVersion + 1 WHERE id = ? AND deletedAt IS NULL');
        const result = stmt.run(passwordHash, id);
        return result.changes > 0;
    }

    listAdmins(): User[] {
        const stmt = this.db.prepare(`
            SELECT *
            FROM "user"
            WHERE deletedAt IS NULL
            ORDER BY createdAt DESC
        `);

        return stmt.all() as User[];
    }

    updateRole(id: number, role: UserRole): User | undefined {
        const stmt = this.db.prepare('UPDATE "user" SET role = ? WHERE id = ? AND deletedAt IS NULL');
        const result = stmt.run(role, id);
        if (result.changes === 0) {
            return undefined;
        }

        return this.findById(id);
    }

    updateStatus(id: number, accountStatus: AccountStatus): User | undefined {
        const stmt = this.db.prepare(`
            UPDATE "user"
            SET accountStatus = ?, tokenVersion = tokenVersion + 1
            WHERE id = ? AND deletedAt IS NULL AND accountStatus != ?
        `);

        const result = stmt.run(accountStatus, id, accountStatus);
        if (result.changes === 0) {
            return undefined;
        }

        return this.findById(id);
    }

    softDelete(id: number, deletedAt: string): User | undefined {
        const stmt = this.db.prepare(`
            UPDATE "user"
            SET accountStatus = 'disabled', deletedAt = ?
            WHERE id = ? AND deletedAt IS NULL
        `);

        const result = stmt.run(deletedAt, id);
        if (result.changes === 0) {
            return undefined;
        }

        return this.findRawById(id);
    }

    countActiveByRole(role: UserRole): number {
        const stmt = this.db.prepare(`
            SELECT COUNT(1) as total
            FROM "user"
            WHERE role = ?
              AND accountStatus = 'active'
              AND deletedAt IS NULL
        `);

        const row = stmt.get(role) as { total: number };
        return row.total;
    }

    private findRawById(id: number): User | undefined {
        const stmt = this.db.prepare('SELECT * FROM "user" WHERE id = ?');
        return stmt.get(id) as User | undefined;
    }
}
