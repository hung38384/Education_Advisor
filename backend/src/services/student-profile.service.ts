import {
    CERTIFICATE_TYPES,
    REQUIRED_TRANSCRIPT_SUBJECTS,
    StudentCertificate,
    StudentProfile,
    SubjectTranscript,
    UpsertStudentProfileInput,
} from '../model/student-profile.model';
import { StudentProfileRepository } from '../repository/student-profile.repository';
import { CacheStore } from '../cache-store';

export interface StudentProfileResult {
    profile: StudentProfile | null;
}

export class StudentProfileServiceError extends Error {
    constructor(
        message: string,
        public statusCode: number = 400
    ) {
        super(message);
        this.name = 'StudentProfileServiceError';
    }
}

export interface StudentProfileCacheConfig {
    admissionCatalogStore?: CacheStore;
}

export class StudentProfileService {
    constructor(
        private repository: StudentProfileRepository,
        private cacheConfig?: StudentProfileCacheConfig
    ) { }

    getMyProfile(userId: number): StudentProfileResult {
        const profile = this.repository.findByUserId(userId) ?? null;
        return { profile };
    }

    async upsertMyProfile(userId: number, input: UpsertStudentProfileInput): Promise<StudentProfileResult> {
        const sanitized = this.sanitizeInput(input);
        const profile = this.repository.upsertByUserId(userId, sanitized);
        if (!profile) {
            throw new StudentProfileServiceError('Không thể lưu hồ sơ', 500);
        }

        await this.invalidateAdmissionCatalogCache(userId);
        return { profile };
    }

    private async invalidateAdmissionCatalogCache(userId: number): Promise<void> {
        const store = this.cacheConfig?.admissionCatalogStore;
        if (!store || !store.enabled) {
            return;
        }

        try {
            await store.purgePrefix(`u:${userId}:`);
        } catch (error) {
            console.warn(`[profile] Failed to invalidate admission catalog cache for user ${userId}`, error);
        }
    }

    private sanitizeInput(input: UpsertStudentProfileInput): UpsertStudentProfileInput {
        const fullName = (input.fullName ?? '').trim();
        if (!fullName) {
            throw new StudentProfileServiceError('Vui lòng nhập họ và tên', 400);
        }

        const grade10 = this.normalizeScore(input.grade10);
        const grade11 = this.normalizeScore(input.grade11);
        const grade12 = this.normalizeScore(input.grade12);
        const transcript = this.normalizeTranscript(input.transcript);
        const certificates = this.normalizeCertificates(input.certificates);

        const favoriteSubjects = (input.favoriteSubjects ?? [])
            .map((item) => item.trim())
            .filter((item) => item.length > 0)
            .slice(0, 20);

        return {
            fullName,
            phone: this.normalizeOptionalText(input.phone),
            gender: this.normalizeOptionalText(input.gender),
            dateOfBirth: this.normalizeOptionalText(input.dateOfBirth),
            city: this.normalizeOptionalText(input.city),
            schoolName: this.normalizeOptionalText(input.schoolName),
            grade10,
            grade11,
            grade12,
            transcript,
            certificates,
            favoriteSubjects,
            targetMajor: this.normalizeOptionalText(input.targetMajor),
            targetUniversity: this.normalizeOptionalText(input.targetUniversity),
            bio: this.normalizeOptionalText(input.bio),
        };
    }

    private normalizeCertificates(value: StudentCertificate[] | null | undefined): StudentCertificate[] {
        if (value === null || value === undefined) {
            return [];
        }

        if (!Array.isArray(value)) {
            throw new StudentProfileServiceError('Danh sách chứng chỉ không hợp lệ', 400);
        }

        return value
            .flatMap((item): StudentCertificate[] => {
                if (!item || typeof item !== 'object' || Array.isArray(item)) {
                    return [];
                }

                const rawType = typeof item.type === 'string' ? item.type.trim().toUpperCase() : '';
                const type = CERTIFICATE_TYPES.includes(rawType as StudentCertificate['type'])
                    ? rawType as StudentCertificate['type']
                    : 'OTHER';
                const name = this.normalizeOptionalText(item.name) || type;
                const score = this.normalizeCertificateScore(type, item.score);

                return [{
                    type,
                    name,
                    score,
                    issuedAt: this.normalizeOptionalText(item.issuedAt),
                    expiresAt: this.normalizeOptionalText(item.expiresAt),
                    note: this.normalizeOptionalText(item.note),
                }];
            })
            .slice(0, 20);
    }

    private normalizeCertificateScore(type: StudentCertificate['type'], value: number | null | undefined): number | null {
        if (value === null || value === undefined) {
            return null;
        }

        const score = Number(value);
        if (!Number.isFinite(score) || score < 0) {
            throw new StudentProfileServiceError('Điểm chứng chỉ không hợp lệ', 400);
        }

        const maxByType: Partial<Record<StudentCertificate['type'], number>> = {
            IELTS: 9,
            TOEFL: 120,
            TOEIC: 990,
            VSTEP: 10,
            SAT: 1600,
            ACT: 36,
            HSA: 150,
            TSA: 100,
        };
        const maxScore = maxByType[type];
        if (maxScore !== undefined && score > maxScore) {
            throw new StudentProfileServiceError(`Điểm ${type} phải nằm trong khoảng 0-${maxScore}`, 400);
        }

        return Number(score.toFixed(2));
    }

    private normalizeOptionalText(value: string | null | undefined): string | null {
        if (value === null || value === undefined) {
            return null;
        }

        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
    }

    private normalizeScore(value: number | null | undefined): number | null {
        if (value === null || value === undefined) {
            return null;
        }

        return this.normalizeRequiredScore(value);
    }

    private normalizeTranscript(value: SubjectTranscript | null | undefined): SubjectTranscript {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            throw new StudentProfileServiceError('Vui lòng nhập điểm tất cả các môn học', 400);
        }

        const transcript: SubjectTranscript = {};
        for (const subject of REQUIRED_TRANSCRIPT_SUBJECTS) {
            if (value[subject] === null || value[subject] === undefined) {
                throw new StudentProfileServiceError('Vui lòng nhập điểm tất cả các môn học', 400);
            }
            transcript[subject] = this.normalizeRequiredScore(value[subject]);
        }

        return transcript;
    }

    private normalizeRequiredScore(value: number): number {
        const normalized = Number(value);
        if (!Number.isFinite(normalized) || normalized < 0 || normalized > 10) {
            throw new StudentProfileServiceError('Điểm phải nằm trong khoảng từ 0 đến 10', 400);
        }

        return Number(normalized.toFixed(2));
    }
}
