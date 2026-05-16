import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const SQLITE_DB_ENV_KEY = 'SQLITE_DB_PATH';
const DEFAULT_SQLITE_RELATIVE_PATH = path.join('data', 'educationadvisor-web.sqlite');
const BACKEND_ROOT_DIR = path.resolve(__dirname, '../..');

function resolveDatabasePath(databasePath?: string): string {
  const explicitPath = (databasePath || '').trim();
  if (explicitPath) {
    return explicitPath;
  }

  const configuredPath = (process.env[SQLITE_DB_ENV_KEY] || '').trim();
  if (configuredPath) {
    return path.isAbsolute(configuredPath)
      ? configuredPath
      : path.resolve(BACKEND_ROOT_DIR, configuredPath);
  }

  return path.resolve(BACKEND_ROOT_DIR, DEFAULT_SQLITE_RELATIVE_PATH);
}

function ensureDatabaseDirectoryExists(dbFilePath: string): void {
  if (!dbFilePath || dbFilePath === ':memory:' || dbFilePath.startsWith('file:')) {
    return;
  }

  const dbDirectory = path.dirname(dbFilePath);
  fs.mkdirSync(dbDirectory, { recursive: true });
}

export function createDatabase(databasePath?: string) {
  const dbFilePath = resolveDatabasePath(databasePath);
  ensureDatabaseDirectoryExists(dbFilePath);
  const db = new Database(dbFilePath, {
    fileMustExist: false
  });

  db.pragma('foreign_keys = ON');

  const tableExists = (tableName: string): boolean => {
    const stmt = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`);
    return Boolean(stmt.get(tableName));
  };

  if (tableExists('assessment_result') && !tableExists('review_result')) {
    const migrateAssessmentResultToReviewResult = db.transaction(() => {
      db.exec(`
        CREATE TABLE review_result (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          userId INTEGER NOT NULL,
          overallScore INTEGER NOT NULL,
          summary TEXT NOT NULL,
          recommendations TEXT NOT NULL,
          inputSnapshot TEXT NOT NULL,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (userId) REFERENCES "user"(id) ON DELETE CASCADE
        );

        INSERT INTO review_result (id, userId, overallScore, summary, recommendations, inputSnapshot, createdAt)
        SELECT id, userId, overallScore, summary, recommendations, inputSnapshot, createdAt
        FROM assessment_result;

        DROP TABLE assessment_result;
      `);
    });

    migrateAssessmentResultToReviewResult();
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS "user" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'admin', 'superadmin')),
      accountStatus TEXT NOT NULL DEFAULT 'active' CHECK(accountStatus IN ('active', 'disabled')),
      tokenVersion INTEGER NOT NULL DEFAULT 0,
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

    CREATE TABLE IF NOT EXISTS student_profile (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL UNIQUE,
      fullName TEXT NOT NULL,
      phone TEXT,
      gender TEXT,
      dateOfBirth TEXT,
      city TEXT,
      schoolName TEXT,
      grade10 REAL,
      grade11 REAL,
      grade12 REAL,
      transcript TEXT,
      certificates TEXT,
      favoriteSubjects TEXT,
      targetMajor TEXT,
      targetUniversity TEXT,
      bio TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES "user"(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS personality_submission (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      answers TEXT NOT NULL,
      mbtiType TEXT NOT NULL,
      scores TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES "user"(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS admission_cart_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      schoolId TEXT NOT NULL,
      majorId TEXT NOT NULL,
      methodId TEXT NOT NULL,
      snapshot TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES "user"(id) ON DELETE CASCADE,
      UNIQUE(userId, schoolId, majorId, methodId)
    );

    CREATE TABLE IF NOT EXISTS review_result (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      overallScore INTEGER NOT NULL,
      summary TEXT NOT NULL,
      recommendations TEXT NOT NULL,
      inputSnapshot TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES "user"(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS qa_conversation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      title TEXT NOT NULL DEFAULT 'Cuộc trò chuyện mới',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES "user"(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS qa_message (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      conversationId INTEGER,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      message TEXT NOT NULL,
      metadata TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES "user"(id) ON DELETE CASCADE,
      FOREIGN KEY (conversationId) REFERENCES qa_conversation(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_student_profile_userId
      ON student_profile(userId);

    CREATE INDEX IF NOT EXISTS idx_personality_submission_userId
      ON personality_submission(userId);

    CREATE INDEX IF NOT EXISTS idx_admission_cart_item_userId_createdAt
      ON admission_cart_item(userId, createdAt DESC);

    CREATE INDEX IF NOT EXISTS idx_review_result_userId_createdAt
      ON review_result(userId, createdAt DESC);

    CREATE INDEX IF NOT EXISTS idx_qa_message_userId_createdAt
      ON qa_message(userId, createdAt DESC);

    CREATE INDEX IF NOT EXISTS idx_qa_conversation_userId_updatedAt
      ON qa_conversation(userId, updatedAt DESC, createdAt DESC);
  `);

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
  if (!columnExists('user', 'tokenVersion')) {
    db.exec('ALTER TABLE "user" ADD COLUMN tokenVersion INTEGER NOT NULL DEFAULT 0');
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
          tokenVersion INTEGER NOT NULL DEFAULT 0,
          deletedAt DATETIME,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        INSERT INTO "user_new" (id, email, password, name, role, accountStatus, tokenVersion, deletedAt, createdAt)
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
          COALESCE(tokenVersion, 0),
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

  // Migration: Add QA conversation support
  if (!columnExists('qa_message', 'conversationId')) {
    db.exec('ALTER TABLE qa_message ADD COLUMN conversationId INTEGER');
  }
  if (!columnExists('admission_cart_item', 'snapshot')) {
    db.exec('ALTER TABLE admission_cart_item ADD COLUMN snapshot TEXT');
  }
  if (!columnExists('student_profile', 'transcript')) {
    db.exec('ALTER TABLE student_profile ADD COLUMN transcript TEXT');
  }
  if (!columnExists('student_profile', 'certificates')) {
    db.exec('ALTER TABLE student_profile ADD COLUMN certificates TEXT');
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_qa_message_conversationId_createdAt
      ON qa_message(conversationId, createdAt DESC);
  `);

  const qaMessageRowsWithMissingConversation = db.prepare(`
    SELECT DISTINCT userId
    FROM qa_message
    WHERE conversationId IS NULL
  `).all() as Array<{ userId: number }>;

  if (qaMessageRowsWithMissingConversation.length > 0) {
    const migrateQAMessages = db.transaction((rows: Array<{ userId: number }>) => {
      const findLatestConversationStmt = db.prepare(`
        SELECT id
        FROM qa_conversation
        WHERE userId = ?
        ORDER BY updatedAt DESC, createdAt DESC, id DESC
        LIMIT 1
      `);
      const createConversationStmt = db.prepare(`
        INSERT INTO qa_conversation (userId, title, updatedAt)
        VALUES (?, 'Cuộc trò chuyện cũ', CURRENT_TIMESTAMP)
      `);
      const updateMissingConversationStmt = db.prepare(`
        UPDATE qa_message
        SET conversationId = ?
        WHERE userId = ? AND conversationId IS NULL
      `);
      const syncConversationUpdatedAtStmt = db.prepare(`
        UPDATE qa_conversation
        SET updatedAt = COALESCE(
          (SELECT MAX(createdAt) FROM qa_message WHERE conversationId = ?),
          updatedAt
        )
        WHERE id = ?
      `);

      for (const row of rows) {
        const latest = findLatestConversationStmt.get(row.userId) as { id: number } | undefined;
        const conversationId = latest?.id ?? Number(createConversationStmt.run(row.userId).lastInsertRowid);

        updateMissingConversationStmt.run(conversationId, row.userId);
        syncConversationUpdatedAtStmt.run(conversationId, conversationId);
      }
    });

    migrateQAMessages(qaMessageRowsWithMissingConversation);
  }

  db.exec(`
    UPDATE qa_conversation
    SET title = 'Cuộc trò chuyện mới'
    WHERE title = 'Cuoc tro chuyen moi';

    UPDATE qa_conversation
    SET title = 'Cuộc trò chuyện cũ'
    WHERE title = 'Cuoc tro chuyen cu';
  `);

  console.log(`SQLite database connected and tables created (${dbFilePath})`);
  return db;
}
