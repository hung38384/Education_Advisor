import {
    AdmissionCatalogResult,
    AdmissionCartItem,
    AdmissionCartItemResult,
    AdmissionCartResult,
    AdmissionCartViewItem,
    AdmissionChanceLevel,
    AdmissionMajor,
    AdmissionMethod,
    AdmissionMethodType,
    AdmissionProfileSnapshot,
    AdmissionSchool,
    CreateAdmissionCartItemInput,
} from '../model/admission.model';
import { StudentProfile } from '../model/student-profile.model';
import { AdmissionCartRepository } from '../repository/admission-cart.repository';
import { StudentProfileRepository } from '../repository/student-profile.repository';

const ADMISSION_CATALOG: AdmissionSchool[] = [
    {
        id: 'hust',
        name: 'DH Bach Khoa Ha Noi',
        city: 'Ha Noi',
        majors: [
            {
                id: 'software-engineering',
                name: 'Ky thuat phan mem',
                field: 'engineering',
                admissionMethods: [
                    {
                        id: 'thpt-a00',
                        name: 'THPT - Toan Ly Hoa',
                        type: 'thpt',
                        requiredAverage: 8.6,
                        difficulty: 5,
                        description: 'Can nen tang Toan va Ly on dinh trong cac ky thi tong hop.',
                    },
                    {
                        id: 'tsa',
                        name: 'Danh gia tu duy',
                        type: 'competency',
                        requiredAverage: 8.2,
                        difficulty: 4,
                        description: 'Phu hop hoc sinh co tu duy logic va giai quyet van de.',
                    },
                    {
                        id: 'transcript-tech',
                        name: 'Xet hoc ba',
                        type: 'transcript',
                        requiredAverage: 8.8,
                        difficulty: 5,
                        description: 'Uu tien ket qua hoc tap on dinh trong 3 nam THPT.',
                    },
                ],
            },
            {
                id: 'data-science',
                name: 'Khoa hoc du lieu',
                field: 'engineering',
                admissionMethods: [
                    {
                        id: 'thpt-a01',
                        name: 'THPT - Toan Ly Anh',
                        type: 'thpt',
                        requiredAverage: 8.5,
                        difficulty: 5,
                        description: 'Can dong deu Toan va Tieng Anh de dap ung dau vao.',
                    },
                    {
                        id: 'tsa-data',
                        name: 'Danh gia tu duy',
                        type: 'competency',
                        requiredAverage: 8.1,
                        difficulty: 4,
                        description: 'Nhanh voi bai toan logic, doc hieu va xu ly du lieu.',
                    },
                ],
            },
        ],
    },
    {
        id: 'neu',
        name: 'DH Kinh Te Quoc Dan',
        city: 'Ha Noi',
        majors: [
            {
                id: 'business-admin',
                name: 'Quan tri kinh doanh',
                field: 'business',
                admissionMethods: [
                    {
                        id: 'thpt-d01',
                        name: 'THPT - Toan Van Anh',
                        type: 'thpt',
                        requiredAverage: 8.0,
                        difficulty: 4,
                        description: 'Can kha nang tong hop Toan, Van va Tieng Anh.',
                    },
                    {
                        id: 'transcript-business',
                        name: 'Xet hoc ba',
                        type: 'transcript',
                        requiredAverage: 8.2,
                        difficulty: 3,
                        description: 'Tap trung vao su on dinh va tien bo qua tung hoc ky.',
                    },
                    {
                        id: 'competency-business',
                        name: 'Danh gia nang luc',
                        type: 'competency',
                        requiredAverage: 7.9,
                        difficulty: 3,
                        description: 'Danh gia kha nang phan tich, lap luan va doc hieu.',
                    },
                ],
            },
            {
                id: 'marketing',
                name: 'Marketing',
                field: 'business',
                admissionMethods: [
                    {
                        id: 'thpt-c00',
                        name: 'THPT - Van Su Dia',
                        type: 'thpt',
                        requiredAverage: 7.8,
                        difficulty: 3,
                        description: 'Phu hop hoc sinh co the manh giao tiep va xa hoi.',
                    },
                    {
                        id: 'transcript-marketing',
                        name: 'Xet hoc ba',
                        type: 'transcript',
                        requiredAverage: 8.0,
                        difficulty: 3,
                        description: 'Can bo ho so hoc tap va hoat dong ngoai khoa hop ly.',
                    },
                ],
            },
        ],
    },
    {
        id: 'ftu',
        name: 'DH Ngoai Thuong',
        city: 'Ha Noi',
        majors: [
            {
                id: 'international-business',
                name: 'Kinh doanh quoc te',
                field: 'business',
                admissionMethods: [
                    {
                        id: 'thpt-d07',
                        name: 'THPT - Toan Hoa Anh',
                        type: 'thpt',
                        requiredAverage: 8.4,
                        difficulty: 5,
                        description: 'Can nen tang hoc thuat cao va Tieng Anh tot.',
                    },
                    {
                        id: 'transcript-ftu',
                        name: 'Xet hoc ba ket hop',
                        type: 'transcript',
                        requiredAverage: 8.6,
                        difficulty: 5,
                        description: 'Thuong doi hoi hoc ba dep va minh chung nang luc bo sung.',
                    },
                    {
                        id: 'direct-ftu',
                        name: 'Tuyen thang ho so noi bat',
                        type: 'direct',
                        requiredAverage: 8.7,
                        difficulty: 5,
                        description: 'Can thanh tich hoc thuat va hoat dong vuot troi.',
                    },
                ],
            },
            {
                id: 'ecommerce',
                name: 'Thuong mai dien tu',
                field: 'business',
                admissionMethods: [
                    {
                        id: 'thpt-a01-ftu',
                        name: 'THPT - Toan Ly Anh',
                        type: 'thpt',
                        requiredAverage: 8.2,
                        difficulty: 4,
                        description: 'Can ket hop duoc tu duy dinh luong va ky nang ngon ngu.',
                    },
                    {
                        id: 'competency-ecommerce',
                        name: 'Danh gia nang luc',
                        type: 'competency',
                        requiredAverage: 8.0,
                        difficulty: 4,
                        description: 'Uu tien kha nang phan tich tinh huong va giai quyet van de.',
                    },
                ],
            },
        ],
    },
];

interface ResolvedCatalogOption {
    school: AdmissionSchool;
    major: AdmissionMajor;
    method: AdmissionMethod;
}

export class AdmissionServiceError extends Error {
    constructor(
        message: string,
        public statusCode: number = 400
    ) {
        super(message);
        this.name = 'AdmissionServiceError';
    }
}

function normalizeText(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function toAverageGrade(profile: StudentProfile | undefined): number | null {
    if (!profile) {
        return null;
    }

    const grades = [profile.grade10, profile.grade11, profile.grade12]
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

    if (grades.length === 0) {
        return null;
    }

    return grades.reduce((sum, value) => sum + value, 0) / grades.length;
}

function clampScore(value: number): number {
    return Math.max(0, Math.min(100, Math.round(value)));
}

function resolveChanceLevel(score: number): AdmissionChanceLevel {
    if (score >= 78) {
        return 'high';
    }

    if (score >= 58) {
        return 'medium';
    }

    return 'challenging';
}

export class AdmissionService {
    constructor(
        private cartRepository: AdmissionCartRepository,
        private profileRepository: StudentProfileRepository
    ) { }

    listCatalog(): AdmissionCatalogResult {
        return { schools: ADMISSION_CATALOG };
    }

    listCart(userId: number): AdmissionCartResult {
        const profile = this.profileRepository.findByUserId(userId);
        const items = this.cartRepository
            .listByUserId(userId)
            .map((item) => this.toViewItem(item, profile));

        return {
            profile: this.toProfileSnapshot(profile),
            items,
        };
    }

    addToCart(userId: number, input: CreateAdmissionCartItemInput): AdmissionCartItemResult {
        const sanitized = this.sanitizeCreateInput(input);
        const option = this.findCatalogOption(sanitized.schoolId, sanitized.majorId, sanitized.methodId);
        if (!option) {
            throw new AdmissionServiceError('School/major/admission method selection is invalid', 404);
        }

        const existing = this.cartRepository.findBySelection(
            userId,
            option.school.id,
            option.major.id,
            option.method.id
        );
        if (existing) {
            throw new AdmissionServiceError('This school-major-method is already in your cart', 409);
        }

        const created = this.cartRepository.create(userId, sanitized);
        if (!created) {
            throw new AdmissionServiceError('Unable to add item to admissions cart', 500);
        }

        const profile = this.profileRepository.findByUserId(userId);
        return {
            item: this.toViewItem(created, profile),
        };
    }

    removeFromCart(userId: number, id: number): { message: string } {
        const deleted = this.cartRepository.delete(id, userId);
        if (!deleted) {
            throw new AdmissionServiceError('Admissions cart item not found', 404);
        }

        return { message: 'Admissions cart item removed successfully' };
    }

    private sanitizeCreateInput(input: CreateAdmissionCartItemInput): CreateAdmissionCartItemInput {
        const schoolId = (input.schoolId ?? '').trim();
        const majorId = (input.majorId ?? '').trim();
        const methodId = (input.methodId ?? '').trim();

        if (!schoolId || !majorId || !methodId) {
            throw new AdmissionServiceError('schoolId, majorId and methodId are required', 400);
        }

        return {
            schoolId,
            majorId,
            methodId,
        };
    }

    private toProfileSnapshot(profile: StudentProfile | undefined): AdmissionProfileSnapshot {
        return {
            fullName: profile?.fullName ?? null,
            averageGrade: toAverageGrade(profile),
            favoriteSubjects: profile?.favoriteSubjects ?? [],
            targetMajor: profile?.targetMajor ?? null,
            targetUniversity: profile?.targetUniversity ?? null,
        };
    }

    private toViewItem(item: AdmissionCartItem, profile: StudentProfile | undefined): AdmissionCartViewItem {
        const option = this.findCatalogOption(item.schoolId, item.majorId, item.methodId);
        if (!option) {
            return {
                id: item.id,
                createdAt: item.createdAt,
                school: {
                    id: item.schoolId,
                    name: item.schoolId,
                    city: 'Unknown',
                },
                major: {
                    id: item.majorId,
                    name: item.majorId,
                    field: 'social',
                },
                method: {
                    id: item.methodId,
                    name: item.methodId,
                    type: 'direct',
                    requiredAverage: 8.0,
                    description: 'Catalog data changed. Please remove and re-add this option.',
                },
                evaluation: {
                    chanceScore: 40,
                    chanceLevel: 'challenging',
                    comment: 'Cannot evaluate this item because the catalog option no longer exists.',
                },
                orientation: 'Please remove this outdated item and add a valid option from the current catalog.',
                studyPlan: [
                    'Update your cart with a valid school-major-method option.',
                    'Re-run evaluation after refreshing your admissions cart.',
                ],
            };
        }

        const evaluation = this.buildEvaluation(profile, option);
        return {
            id: item.id,
            createdAt: item.createdAt,
            school: {
                id: option.school.id,
                name: option.school.name,
                city: option.school.city,
            },
            major: {
                id: option.major.id,
                name: option.major.name,
                field: option.major.field,
            },
            method: {
                id: option.method.id,
                name: option.method.name,
                type: option.method.type,
                requiredAverage: option.method.requiredAverage,
                description: option.method.description,
            },
            evaluation,
            orientation: this.buildOrientation(profile, option),
            studyPlan: this.buildStudyPlan(profile, option, evaluation.chanceLevel),
        };
    }

    private findCatalogOption(
        schoolId: string,
        majorId: string,
        methodId: string
    ): ResolvedCatalogOption | undefined {
        for (const school of ADMISSION_CATALOG) {
            if (school.id !== schoolId) {
                continue;
            }

            for (const major of school.majors) {
                if (major.id !== majorId) {
                    continue;
                }

                for (const method of major.admissionMethods) {
                    if (method.id === methodId) {
                        return { school, major, method };
                    }
                }
            }
        }

        return undefined;
    }

    private buildEvaluation(profile: StudentProfile | undefined, option: ResolvedCatalogOption) {
        const averageGrade = toAverageGrade(profile);
        if (!profile || averageGrade === null) {
            return {
                chanceScore: 55,
                chanceLevel: 'medium' as const,
                comment: `Complete your profile grades to get a more accurate estimate for ${option.major.name}.`,
            };
        }

        const baseScore = (averageGrade / 10) * 65;
        const benchmarkGapScore = (averageGrade - option.method.requiredAverage) * 12;
        const subjectBonus = this.calculateSubjectBonus(profile.favoriteSubjects, option.major.field);
        const targetBonus = this.calculateTargetBonus(profile, option.major.name, option.school.name);
        const methodBonus = this.getMethodBonus(option.method.type, profile);
        const difficultyPenalty = option.method.difficulty * 2;

        const chanceScore = clampScore(
            baseScore
            + benchmarkGapScore
            + subjectBonus
            + targetBonus
            + methodBonus
            - difficultyPenalty
            + 20
        );

        const chanceLevel = resolveChanceLevel(chanceScore);
        const comparison = averageGrade - option.method.requiredAverage;
        const comparisonText = comparison >= 0
            ? `above reference by ${comparison.toFixed(2)}`
            : `below reference by ${Math.abs(comparison).toFixed(2)}`;

        let commentTone = 'Your current profile is in the competitive zone for this option.';
        if (chanceLevel === 'medium') {
            commentTone = 'Your profile is close to the competitive threshold; consistent effort can improve your chance.';
        } else if (chanceLevel === 'challenging') {
            commentTone = 'This is an ambitious option; focus on score improvement and add safer alternatives.';
        }

        return {
            chanceScore,
            chanceLevel,
            comment: `Average grade ${averageGrade.toFixed(2)} is ${comparisonText} (${option.method.name}). ${commentTone}`,
        };
    }

    private buildOrientation(profile: StudentProfile | undefined, option: ResolvedCatalogOption): string {
        const baseByField: Record<AdmissionMajor['field'], string> = {
            engineering: 'Develop strong quantitative thinking, coding fundamentals, and project execution skills.',
            business: 'Develop analytical business thinking, communication, and market problem-solving skills.',
            health: 'Develop scientific rigor, discipline, and evidence-based learning habits.',
            social: 'Develop communication, critical reading, and societal problem analysis skills.',
        };

        const baseText = baseByField[option.major.field];
        const parts = [baseText];

        if (profile?.targetMajor && normalizeText(profile.targetMajor).includes(normalizeText(option.major.name))) {
            parts.push('This major aligns directly with your declared target major.');
        }

        if (profile?.targetUniversity && normalizeText(profile.targetUniversity).includes(normalizeText(option.school.name))) {
            parts.push('This school aligns with your declared target university.');
        }

        if (profile && profile.favoriteSubjects.length > 0) {
            parts.push(`Leverage your strengths in ${profile.favoriteSubjects.slice(0, 3).join(', ')}.`);
        }

        return parts.join(' ');
    }

    private buildStudyPlan(
        profile: StudentProfile | undefined,
        option: ResolvedCatalogOption,
        chanceLevel: AdmissionChanceLevel
    ): string[] {
        const averageGrade = toAverageGrade(profile);
        const methodSpecificStep = this.getMethodSpecificStep(option.method.type, option.major.name);
        const scoreGap = averageGrade === null
            ? option.method.requiredAverage
            : Math.max(0, option.method.requiredAverage - averageGrade);

        const scoreFocus = scoreGap <= 0.1
            ? 'Maintain current performance with weekly revision checkpoints.'
            : `Increase your average by about ${scoreGap.toFixed(1)} through focused subject practice.`;

        const riskControl = chanceLevel === 'challenging'
            ? 'Add 1-2 backup options with lower benchmark while keeping this aspiration target.'
            : 'Keep at least one balanced backup option to reduce admission risk.';

        return [
            `Weeks 1-3: ${scoreFocus}`,
            `Weeks 4-7: ${methodSpecificStep}`,
            `Weeks 8-10: Build an application timeline and prepare required documents for ${option.school.name}.`,
            `Weeks 11-12: Simulate final exam/admission conditions and review weak topics. ${riskControl}`,
        ];
    }

    private calculateSubjectBonus(
        favoriteSubjects: string[],
        field: AdmissionMajor['field']
    ): number {
        const normalizedSubjects = favoriteSubjects.map(normalizeText);
        if (normalizedSubjects.length === 0) {
            return 0;
        }

        const keywordMap: Record<AdmissionMajor['field'], string[]> = {
            engineering: ['toan', 'math', 'tin', 'vat ly', 'physics', 'hoa', 'chemistry'],
            business: ['toan', 'math', 'anh', 'english', 'van', 'economics', 'kinh te'],
            health: ['sinh', 'biology', 'hoa', 'chemistry', 'toan', 'math'],
            social: ['van', 'history', 'su', 'dia', 'english', 'anh'],
        };

        const keywords = keywordMap[field];
        const matchedCount = normalizedSubjects.filter((subject) =>
            keywords.some((keyword) => subject.includes(keyword))
        ).length;

        return Math.min(12, matchedCount * 4);
    }

    private calculateTargetBonus(
        profile: StudentProfile,
        majorName: string,
        schoolName: string
    ): number {
        let bonus = 0;

        if (profile.targetMajor && normalizeText(profile.targetMajor).includes(normalizeText(majorName))) {
            bonus += 6;
        }

        if (profile.targetUniversity && normalizeText(profile.targetUniversity).includes(normalizeText(schoolName))) {
            bonus += 6;
        }

        return bonus;
    }

    private getMethodBonus(methodType: AdmissionMethodType, profile: StudentProfile): number {
        switch (methodType) {
            case 'thpt':
                return 2;
            case 'transcript': {
                const hasEnoughGrades = [profile.grade10, profile.grade11, profile.grade12]
                    .filter((value) => typeof value === 'number' && Number.isFinite(value)).length >= 2;
                return hasEnoughGrades ? 6 : 2;
            }
            case 'competency':
                return 4;
            case 'direct':
                return 5;
            default:
                return 2;
        }
    }

    private getMethodSpecificStep(methodType: AdmissionMethodType, majorName: string): string {
        switch (methodType) {
            case 'thpt':
                return `Complete at least 3 full-length exam sets per week for the subject combination of ${majorName}.`;
            case 'transcript':
                return 'Keep every semester score stable, and organize certificates/activities as supporting evidence.';
            case 'competency':
                return 'Practice logic, reading comprehension, and timed problem-solving drills 4 times each week.';
            case 'direct':
                return 'Prepare portfolio, personal statement, and highlight-impact extracurricular activities.';
            default:
                return 'Practice consistent revision and weekly progress tracking.';
        }
    }
}
