import { StudentProfile, UpsertStudentProfileInput } from '../model/student-profile.model';
import { StudentProfileRepository } from '../repository/student-profile.repository';

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

export class StudentProfileService {
    constructor(private repository: StudentProfileRepository) { }

    getMyProfile(userId: number): StudentProfileResult {
        const profile = this.repository.findByUserId(userId) ?? null;
        return { profile };
    }

    upsertMyProfile(userId: number, input: UpsertStudentProfileInput): StudentProfileResult {
        const sanitized = this.sanitizeInput(input);
        const profile = this.repository.upsertByUserId(userId, sanitized);
        if (!profile) {
            throw new StudentProfileServiceError('Unable to save profile', 500);
        }

        return { profile };
    }

    private sanitizeInput(input: UpsertStudentProfileInput): UpsertStudentProfileInput {
        const fullName = (input.fullName ?? '').trim();
        if (!fullName) {
            throw new StudentProfileServiceError('Full name is required', 400);
        }

        const grade10 = this.normalizeScore(input.grade10);
        const grade11 = this.normalizeScore(input.grade11);
        const grade12 = this.normalizeScore(input.grade12);

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
            favoriteSubjects,
            targetMajor: this.normalizeOptionalText(input.targetMajor),
            targetUniversity: this.normalizeOptionalText(input.targetUniversity),
            bio: this.normalizeOptionalText(input.bio),
        };
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

        const normalized = Number(value);
        if (!Number.isFinite(normalized) || normalized < 0 || normalized > 10) {
            throw new StudentProfileServiceError('Scores must be between 0 and 10', 400);
        }

        return Number(normalized.toFixed(2));
    }
}
