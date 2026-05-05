import { Database } from 'better-sqlite3';
import { QAConversation, QAMessage, QAMessageRole } from '../model/qa.model';

const DEFAULT_CONVERSATION_TITLE = 'Cuộc trò chuyện mới';

export interface CreateQAMessageInput {
    userId: number;
    conversationId: number;
    role: QAMessageRole;
    message: string;
    metadata?: Record<string, unknown> | null;
}

export interface CreateQAConversationInput {
    userId: number;
    title?: string;
}

export interface QARepository {
    listConversationsByUserId(userId: number, limit?: number): QAConversation[];
    findConversationById(userId: number, conversationId: number): QAConversation | undefined;
    findLatestConversationByUserId(userId: number): QAConversation | undefined;
    createConversation(input: CreateQAConversationInput): QAConversation | undefined;
    deleteConversation(userId: number, conversationId: number): boolean;
    listByUserId(userId: number, limit?: number): QAMessage[];
    listByConversationId(userId: number, conversationId: number, limit?: number): QAMessage[];
    create(input: CreateQAMessageInput): QAMessage | undefined;
}

interface QAConversationRow {
    id: number;
    userId: number;
    title: string;
    createdAt: string;
    updatedAt: string;
    lastMessage: string | null;
    lastMessageAt: string | null;
    messageCount: number | null;
}

interface QAMessageRow {
    id: number;
    userId: number;
    conversationId: number;
    role: QAMessageRole;
    message: string;
    metadata: string | null;
    createdAt: string;
}

function parseMetadata(rawValue: string | null): Record<string, unknown> | null {
    if (!rawValue) {
        return null;
    }

    try {
        const parsed = JSON.parse(rawValue);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return null;
        }

        return parsed as Record<string, unknown>;
    } catch {
        return null;
    }
}

function toModel(row: QAMessageRow): QAMessage {
    return {
        id: row.id,
        userId: row.userId,
        conversationId: row.conversationId,
        role: row.role,
        message: row.message,
        metadata: parseMetadata(row.metadata),
        createdAt: row.createdAt,
    };
}

function toConversationModel(row: QAConversationRow): QAConversation {
    return {
        id: row.id,
        userId: row.userId,
        title: row.title,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        lastMessage: row.lastMessage ?? null,
        lastMessageAt: row.lastMessageAt ?? null,
        messageCount: row.messageCount ?? 0,
    };
}

export class SQLiteQARepository implements QARepository {
    constructor(private db: Database) { }

    listConversationsByUserId(userId: number, limit: number = 50): QAConversation[] {
        const safeLimit = Math.min(Math.max(limit, 1), 200);
        const stmt = this.db.prepare(`
            SELECT
                c.id,
                c.userId,
                c.title,
                c.createdAt,
                c.updatedAt,
                (
                    SELECT m.message
                    FROM qa_message m
                    WHERE m.conversationId = c.id
                    ORDER BY m.createdAt DESC, m.id DESC
                    LIMIT 1
                ) AS lastMessage,
                (
                    SELECT m.createdAt
                    FROM qa_message m
                    WHERE m.conversationId = c.id
                    ORDER BY m.createdAt DESC, m.id DESC
                    LIMIT 1
                ) AS lastMessageAt,
                (
                    SELECT COUNT(1)
                    FROM qa_message m
                    WHERE m.conversationId = c.id
                ) AS messageCount
            FROM qa_conversation c
            WHERE c.userId = ?
            ORDER BY COALESCE(lastMessageAt, c.updatedAt, c.createdAt) DESC, c.id DESC
            LIMIT ?
        `);

        const rows = stmt.all(userId, safeLimit) as QAConversationRow[];
        return rows.map(toConversationModel);
    }

    findConversationById(userId: number, conversationId: number): QAConversation | undefined {
        const stmt = this.db.prepare(`
            SELECT
                c.id,
                c.userId,
                c.title,
                c.createdAt,
                c.updatedAt,
                (
                    SELECT m.message
                    FROM qa_message m
                    WHERE m.conversationId = c.id
                    ORDER BY m.createdAt DESC, m.id DESC
                    LIMIT 1
                ) AS lastMessage,
                (
                    SELECT m.createdAt
                    FROM qa_message m
                    WHERE m.conversationId = c.id
                    ORDER BY m.createdAt DESC, m.id DESC
                    LIMIT 1
                ) AS lastMessageAt,
                (
                    SELECT COUNT(1)
                    FROM qa_message m
                    WHERE m.conversationId = c.id
                ) AS messageCount
            FROM qa_conversation c
            WHERE c.userId = ? AND c.id = ?
            LIMIT 1
        `);

        const row = stmt.get(userId, conversationId) as QAConversationRow | undefined;
        return row ? toConversationModel(row) : undefined;
    }

    findLatestConversationByUserId(userId: number): QAConversation | undefined {
        const latestIdRow = this.db.prepare(`
            SELECT id
            FROM qa_conversation
            WHERE userId = ?
            ORDER BY COALESCE(updatedAt, createdAt) DESC, id DESC
            LIMIT 1
        `).get(userId) as { id: number } | undefined;

        if (!latestIdRow) {
            return undefined;
        }

        return this.findConversationById(userId, latestIdRow.id);
    }

    createConversation(input: CreateQAConversationInput): QAConversation | undefined {
        const normalizedTitle = (input.title || '').trim() || DEFAULT_CONVERSATION_TITLE;
        const stmt = this.db.prepare(`
            INSERT INTO qa_conversation (userId, title, updatedAt)
            VALUES (?, ?, CURRENT_TIMESTAMP)
        `);

        const result = stmt.run(input.userId, normalizedTitle);
        return this.findConversationById(input.userId, Number(result.lastInsertRowid));
    }

    deleteConversation(userId: number, conversationId: number): boolean {
        this.db.prepare(`
            DELETE FROM qa_message
            WHERE userId = ? AND conversationId = ?
        `).run(userId, conversationId);

        const result = this.db.prepare(`
            DELETE FROM qa_conversation
            WHERE userId = ? AND id = ?
        `).run(userId, conversationId);

        return result.changes > 0;
    }

    listByUserId(userId: number, limit: number = 100): QAMessage[] {
        const safeLimit = Math.min(Math.max(limit, 1), 500);
        const stmt = this.db.prepare(`
            SELECT *
            FROM qa_message
            WHERE userId = ?
            ORDER BY createdAt ASC, id ASC
            LIMIT ?
        `);

        const rows = stmt.all(userId, safeLimit) as QAMessageRow[];
        return rows.map(toModel);
    }

    listByConversationId(userId: number, conversationId: number, limit: number = 200): QAMessage[] {
        const safeLimit = Math.min(Math.max(limit, 1), 500);
        const stmt = this.db.prepare(`
            SELECT *
            FROM qa_message
            WHERE userId = ? AND conversationId = ?
            ORDER BY createdAt ASC, id ASC
            LIMIT ?
        `);

        const rows = stmt.all(userId, conversationId, safeLimit) as QAMessageRow[];
        return rows.map(toModel);
    }

    create(input: CreateQAMessageInput): QAMessage | undefined {
        const stmt = this.db.prepare(`
            INSERT INTO qa_message (userId, conversationId, role, message, metadata)
            VALUES (?, ?, ?, ?, ?)
        `);

        const result = stmt.run(
            input.userId,
            input.conversationId,
            input.role,
            input.message,
            input.metadata ? JSON.stringify(input.metadata) : null
        );

        this.db.prepare(`
            UPDATE qa_conversation
            SET updatedAt = CURRENT_TIMESTAMP
            WHERE id = ? AND userId = ?
        `).run(input.conversationId, input.userId);

        const row = this.db.prepare('SELECT * FROM qa_message WHERE id = ?')
            .get(Number(result.lastInsertRowid)) as QAMessageRow | undefined;

        if (!row) {
            return undefined;
        }

        return toModel(row);
    }
}
