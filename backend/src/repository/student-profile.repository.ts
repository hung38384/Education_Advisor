import { Database } from 'better-sqlite3';
import { CERTIFICATE_TYPES, StudentCertificate, StudentProfile, SubjectTranscript, UpsertStudentProfileInput } from '../model/student-profile.model';

export interface StudentProfileRepository {
    findByUserId(userId: number): StudentProfile | undefined;
    upsertByUserId(userId: number, input: UpsertStudentProfileInput): StudentProfile | undefined;
}

interface StudentProfileRow {
    id: number;
    userId: number;
    fullName: string;
    phone: string | null;
    gender: string | null;
    dateOfBirth: string | null;
    city: string | null;
    schoolName: string | null;
    grade10: number | null;
    grade11: number | null;
    grade12: number | null;
    transcript: string | null;
    certificates: string | null;
    favoriteSubjects: string | null;
    targetMajor: string | null;
    targetUniversity: string | null;
    bio: string | null;
    createdAt: string;
    updatedAt: string;
}

function parseCertificates(rawValue: string | null): StudentCertificate[] {
    if (!rawValue) {
        return [];
    }

    try {
        const parsed = JSON.parse(rawValue);
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed.flatMap((item): StudentCertificate[] => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) {
                return [];
            }

            const record = item as Record<string, unknown>;
            const rawType = typeof record.type === 'string' ? record.type.trim().toUpperCase() : '';
            const type = CERTIFICATE_TYPES.includes(rawType as StudentCertificate['type'])
                ? rawType as StudentCertificate['type']
                : 'OTHER';
            const name = typeof record.name === 'string' && record.name.trim()
                ? record.name.trim()
                : type;
            const rawScore = record.score;
            const score = typeof rawScore === 'number' && Number.isFinite(rawScore)
                ? rawScore
                : null;

            return [{
                type,
                name,
                score,
                issuedAt: typeof record.issuedAt === 'string' && record.issuedAt.trim() ? record.issuedAt.trim() : null,
                expiresAt: typeof record.expiresAt === 'string' && record.expiresAt.trim() ? record.expiresAt.trim() : null,
                note: typeof record.note === 'string' && record.note.trim() ? record.note.trim() : null,
            }];
        });
    } catch {
        return [];
    }
}

function parseFavoriteSubjects(rawValue: string | null): string[] {
    if (!rawValue) {
        return [];
    }

    try {
        const parsed = JSON.parse(rawValue);
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed.filter((item): item is string => typeof item === 'string');
    } catch {
        return [];
    }
}

function parseTranscript(rawValue: string | null): SubjectTranscript | null {
    if (!rawValue) {
        return null;
    }

    try {
        const parsed = JSON.parse(rawValue);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return null;
        }

        const transcript: SubjectTranscript = {};
        for (const [subject, score] of Object.entries(parsed)) {
            if (typeof score === 'number' && Number.isFinite(score)) {
                transcript[subject] = score;
            }
        }

        return Object.keys(transcript).length > 0 ? transcript : null;
    } catch {
        return null;
    }
}

function toModel(row: StudentProfileRow): StudentProfile {
    return {
        id: row.id,
        userId: row.userId,
        fullName: row.fullName,
        phone: row.phone,
        gender: row.gender,
        dateOfBirth: row.dateOfBirth,
        city: row.city,
        schoolName: row.schoolName,
        grade10: row.grade10,
        grade11: row.grade11,
        grade12: row.grade12,
        transcript: parseTranscript(row.transcript),
        certificates: parseCertificates(row.certificates),
        favoriteSubjects: parseFavoriteSubjects(row.favoriteSubjects),
        targetMajor: row.targetMajor,
        targetUniversity: row.targetUniversity,
        bio: row.bio,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

export class SQLiteStudentProfileRepository implements StudentProfileRepository {
    constructor(private db: Database) { }

    findByUserId(userId: number): StudentProfile | undefined {
        const stmt = this.db.prepare('SELECT * FROM student_profile WHERE userId = ?');
        const row = stmt.get(userId) as StudentProfileRow | undefined;
        if (!row) {
            return undefined;
        }

        return toModel(row);
    }

    upsertByUserId(userId: number, input: UpsertStudentProfileInput): StudentProfile | undefined {
        const stmt = this.db.prepare(`
            INSERT INTO student_profile (
                userId,
                fullName,
                phone,
                gender,
                dateOfBirth,
                city,
                schoolName,
                grade10,
                grade11,
                grade12,
                transcript,
                certificates,
                favoriteSubjects,
                targetMajor,
                targetUniversity,
                bio
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(userId) DO UPDATE SET
                fullName = excluded.fullName,
                phone = excluded.phone,
                gender = excluded.gender,
                dateOfBirth = excluded.dateOfBirth,
                city = excluded.city,
                schoolName = excluded.schoolName,
                grade10 = excluded.grade10,
                grade11 = excluded.grade11,
                grade12 = excluded.grade12,
                transcript = excluded.transcript,
                certificates = excluded.certificates,
                favoriteSubjects = excluded.favoriteSubjects,
                targetMajor = excluded.targetMajor,
                targetUniversity = excluded.targetUniversity,
                bio = excluded.bio,
                updatedAt = CURRENT_TIMESTAMP
        `);

        stmt.run(
            userId,
            input.fullName,
            input.phone ?? null,
            input.gender ?? null,
            input.dateOfBirth ?? null,
            input.city ?? null,
            input.schoolName ?? null,
            input.grade10 ?? null,
            input.grade11 ?? null,
            input.grade12 ?? null,
            input.transcript ? JSON.stringify(input.transcript) : null,
            JSON.stringify(input.certificates ?? []),
            JSON.stringify(input.favoriteSubjects ?? []),
            input.targetMajor ?? null,
            input.targetUniversity ?? null,
            input.bio ?? null
        );

        return this.findByUserId(userId);
    }
}
