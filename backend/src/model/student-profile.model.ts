export const REQUIRED_TRANSCRIPT_SUBJECTS = [
    'Toán',
    'Ngữ văn',
    'Ngoại ngữ',
    'Vật lý',
    'Hóa học',
    'Sinh học',
    'Lịch sử',
    'Địa lý',
    'Giáo dục công dân',
] as const;

export type SubjectTranscript = Record<string, number>;

export const CERTIFICATE_TYPES = [
    'IELTS',
    'TOEFL',
    'TOEIC',
    'VSTEP',
    'SAT',
    'ACT',
    'HSA',
    'TSA',
    'OTHER',
] as const;

export type CertificateType = (typeof CERTIFICATE_TYPES)[number];

export interface StudentCertificate {
    type: CertificateType;
    name: string;
    score: number | null;
    issuedAt: string | null;
    expiresAt: string | null;
    note: string | null;
}

export interface StudentProfile {
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
    transcript: SubjectTranscript | null;
    certificates: StudentCertificate[];
    favoriteSubjects: string[];
    targetMajor: string | null;
    targetUniversity: string | null;
    bio: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface UpsertStudentProfileInput {
    fullName: string;
    phone?: string | null;
    gender?: string | null;
    dateOfBirth?: string | null;
    city?: string | null;
    schoolName?: string | null;
    grade10?: number | null;
    grade11?: number | null;
    grade12?: number | null;
    transcript?: SubjectTranscript | null;
    certificates?: StudentCertificate[];
    favoriteSubjects?: string[];
    targetMajor?: string | null;
    targetUniversity?: string | null;
    bio?: string | null;
}
