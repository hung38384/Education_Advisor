import Database from 'better-sqlite3';
import path from 'path';

export function createDatabase() {
  const db = new Database(path.join(__dirname, '../../database.sqlite'), {
    fileMustExist: false
  });

  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS product (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price INTEGER NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS "user" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'admin', 'superadmin')),
      accountStatus TEXT NOT NULL DEFAULT 'active' CHECK(accountStatus IN ('active', 'disabled')),
      deletedAt DATETIME,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS password_reset_token (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      tokenHash TEXT NOT NULL,
      expiresAt DATETIME NOT NULL,
      usedAt DATETIME,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES "user"(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_password_reset_token_userId
      ON password_reset_token(userId);

    CREATE INDEX IF NOT EXISTS idx_password_reset_token_tokenHash
      ON password_reset_token(tokenHash);
  `);

  const tableExists = (tableName: string): boolean => {
    const stmt = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`);
    return Boolean(stmt.get(tableName));
  };

  const columnExists = (tableName: string, columnName: string): boolean => {
    const stmt = db.prepare(`PRAGMA table_info("${tableName}")`);
    const rows = stmt.all() as Array<{ name: string }>;
    return rows.some((row) => row.name === columnName);
  };

  // Migration: Add missing columns first
  if (!columnExists('user', 'password')) {
    db.exec('ALTER TABLE "user" ADD COLUMN password TEXT');
  }
  if (!columnExists('user', 'role')) {
    db.exec('ALTER TABLE "user" ADD COLUMN role TEXT DEFAULT \'user\'');
  }
  if (!columnExists('user', 'accountStatus')) {
    db.exec('ALTER TABLE "user" ADD COLUMN accountStatus TEXT DEFAULT \'active\'');
  }
  if (!columnExists('user', 'deletedAt')) {
    db.exec('ALTER TABLE "user" ADD COLUMN deletedAt DATETIME');
  }

  // Migration: Copy from old 'users' table if exists
  if (tableExists('users')) {
    const sourcePasswordColumn = columnExists('users', 'passwordHash') ? 'passwordHash' : 'password';
    db.exec(`
      INSERT INTO "user" (id, email, password, name, role, accountStatus, deletedAt, createdAt)
      SELECT u.id, u.email, u.${sourcePasswordColumn}, u.name, 'user', 'active', NULL, COALESCE(u.createdAt, CURRENT_TIMESTAMP)
      FROM "users" u
      WHERE NOT EXISTS (SELECT 1 FROM "user" t WHERE t.id = u.id OR t.email = u.email);
    `);
  }

  // Migration: Sync passwordHash to password if needed
  if (columnExists('user', 'passwordHash')) {
    db.exec('UPDATE "user" SET password = passwordHash WHERE password IS NULL');
  }

  // Migration: Ensure values in required domain
  db.exec(`
    UPDATE "user"
    SET role = 'user'
    WHERE role IS NULL
      OR role = ''
      OR role NOT IN ('user', 'admin', 'superadmin');

    UPDATE "user"
    SET accountStatus = 'active'
    WHERE accountStatus IS NULL
      OR accountStatus = ''
      OR accountStatus NOT IN ('active', 'disabled');
  `);

  const userTableSqlRow = db.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = 'user'
  `).get() as { sql?: string } | undefined;

  const expectedRoleConstraint = "role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'admin', 'superadmin'))";
  const hasExpectedRoleConstraint = (userTableSqlRow?.sql || '').includes(expectedRoleConstraint);

  if (!hasExpectedRoleConstraint) {
    db.exec('PRAGMA foreign_keys = OFF');

    const rebuildUserTable = db.transaction(() => {
      db.exec(`
        CREATE TABLE "user_new" (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL UNIQUE,
          password TEXT NOT NULL,
          name TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'admin', 'superadmin')),
          accountStatus TEXT NOT NULL DEFAULT 'active' CHECK(accountStatus IN ('active', 'disabled')),
          deletedAt DATETIME,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        INSERT INTO "user_new" (id, email, password, name, role, accountStatus, deletedAt, createdAt)
        SELECT
          id,
          email,
          password,
          name,
          CASE
            WHEN role IN ('user', 'admin', 'superadmin') THEN role
            ELSE 'user'
          END,
          CASE
            WHEN accountStatus IN ('active', 'disabled') THEN accountStatus
            ELSE 'active'
          END,
          deletedAt,
          COALESCE(createdAt, CURRENT_TIMESTAMP)
        FROM "user";

        DROP TABLE "user";
        ALTER TABLE "user_new" RENAME TO "user";
      `);
    });

    try {
      rebuildUserTable();
    } finally {
      db.exec('PRAGMA foreign_keys = ON');
    }
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_user_role ON "user"(role);
    CREATE INDEX IF NOT EXISTS idx_user_accountStatus ON "user"(accountStatus);
  `);

  console.log('SQLite database connected and tables created');
  return db;
}
