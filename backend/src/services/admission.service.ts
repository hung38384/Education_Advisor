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
        name: 'Đại học Bách khoa Hà Nội',
        city: 'Hà Nội',
        majors: [
            {
                id: 'software-engineering',
                name: 'Kỹ thuật phần mềm',
                field: 'engineering',
                admissionMethods: [
                    {
                        id: 'thpt-a00',
                        name: 'THPT - Toán Lý Hóa',
                        type: 'thpt',
                        requiredAverage: 8.6,
                        difficulty: 5,
                        description: 'Cần nền tảng Toán và Lý ổn định trong các kỳ thi tổng hợp.',
                    },
                    {
                        id: 'tsa',
                        name: 'Đánh giá tư duy',
                        type: 'competency',
                        requiredAverage: 8.2,
                        difficulty: 4,
                        description: 'Phù hợp học sinh có tư duy logic và khả năng giải quyết vấn đề.',
                    },
                    {
                        id: 'transcript-tech',
                        name: 'Xét học bạ',
                        type: 'transcript',
                        requiredAverage: 8.8,
                        difficulty: 5,
                        description: 'Ưu tiên kết quả học tập ổn định trong 3 năm THPT.',
                    },
                ],
            },
            {
                id: 'data-science',
                name: 'Khoa học dữ liệu',
                field: 'engineering',
                admissionMethods: [
                    {
                        id: 'thpt-a01',
                        name: 'THPT - Toán Lý Anh',
                        type: 'thpt',
                        requiredAverage: 8.5,
                        difficulty: 5,
                        description: 'Cần học đều Toán và Tiếng Anh để đáp ứng yêu cầu đầu vào.',
                    },
                    {
                        id: 'tsa-data',
                        name: 'Đánh giá tư duy',
                        type: 'competency',
                        requiredAverage: 8.1,
                        difficulty: 4,
                        description: 'Nhanh với bài toán logic, đọc hiểu và xử lý dữ liệu.',
                    },
                ],
            },
        ],
    },
    {
        id: 'neu',
        name: 'Đại học Kinh tế Quốc dân',
        city: 'Hà Nội',
        majors: [
            {
                id: 'business-admin',
                name: 'Quản trị kinh doanh',
                field: 'business',
                admissionMethods: [
                    {
                        id: 'thpt-d01',
                        name: 'THPT - Toán Văn Anh',
                        type: 'thpt',
                        requiredAverage: 8.0,
                        difficulty: 4,
                        description: 'Cần khả năng tổng hợp Toán, Văn và Tiếng Anh.',
                    },
                    {
                        id: 'transcript-business',
                        name: 'Xét học bạ',
                        type: 'transcript',
                        requiredAverage: 8.2,
                        difficulty: 3,
                        description: 'Tập trung vào sự ổn định và tiến bộ qua từng học kỳ.',
                    },
                    {
                        id: 'competency-business',
                        name: 'Đánh giá năng lực',
                        type: 'competency',
                        requiredAverage: 7.9,
                        difficulty: 3,
                        description: 'Đánh giá khả năng phân tích, lập luận và đọc hiểu.',
                    },
                ],
            },
            {
                id: 'marketing',
                name: 'Tiếp thị',
                field: 'business',
                admissionMethods: [
                    {
                        id: 'thpt-c00',
                        name: 'THPT - Văn Sử Địa',
                        type: 'thpt',
                        requiredAverage: 7.8,
                        difficulty: 3,
                        description: 'Phù hợp học sinh có thế mạnh giao tiếp và xã hội.',
                    },
                    {
                        id: 'transcript-marketing',
                        name: 'Xét học bạ',
                        type: 'transcript',
                        requiredAverage: 8.0,
                        difficulty: 3,
                        description: 'Cần bổ sung hồ sơ học tập và hoạt động ngoại khóa hợp lý.',
                    },
                ],
            },
        ],
    },
    {
        id: 'ftu',
        name: 'Đại học Ngoại thương',
        city: 'Hà Nội',
        majors: [
            {
                id: 'international-business',
                name: 'Kinh doanh quốc tế',
                field: 'business',
                admissionMethods: [
                    {
                        id: 'thpt-d07',
                        name: 'THPT - Toán Hóa Anh',
                        type: 'thpt',
                        requiredAverage: 8.4,
                        difficulty: 5,
                        description: 'Cần nền tảng học thuật cao và Tiếng Anh tốt.',
                    },
                    {
                        id: 'transcript-ftu',
                        name: 'Xét học bạ kết hợp',
                        type: 'transcript',
                        requiredAverage: 8.6,
                        difficulty: 5,
                        description: 'Thường đòi hỏi học bạ đẹp và minh chứng năng lực bổ sung.',
                    },
                    {
                        id: 'direct-ftu',
                        name: 'Tuyển thẳng hồ sơ nổi bật',
                        type: 'direct',
                        requiredAverage: 8.7,
                        difficulty: 5,
                        description: 'Cần thành tích học thuật và hoạt động vượt trội.',
                    },
                ],
            },
            {
                id: 'ecommerce',
                name: 'Thương mại điện tử',
                field: 'business',
                admissionMethods: [
                    {
                        id: 'thpt-a01-ftu',
                        name: 'THPT - Toán Lý Anh',
                        type: 'thpt',
                        requiredAverage: 8.2,
                        difficulty: 4,
                        description: 'Cần kết hợp được tư duy định lượng và kỹ năng ngôn ngữ.',
                    },
                    {
                        id: 'competency-ecommerce',
                        name: 'Đánh giá năng lực',
                        type: 'competency',
                        requiredAverage: 8.0,
                        difficulty: 4,
                        description: 'Ưu tiên khả năng phân tích tình huống và giải quyết vấn đề.',
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

    listCatalog(userId: number): AdmissionCatalogResult {
        const profile = this.profileRepository.findByUserId(userId);
        const schools = ADMISSION_CATALOG.map((school) => ({
            ...school,
            majors: school.majors.map((major) => ({
                ...major,
                name: this.resolveMajorDisplayName(major),
                admissionMethods: major.admissionMethods.map((method) => ({
                    ...method,
                    personalizedComment: this.buildCatalogMethodComment(profile, {
                        school,
                        major,
                        method,
                    }),
                })),
            })),
        }));

        return { schools };
    }

    listFavorites(userId: number): AdmissionCartResult {
        const profile = this.profileRepository.findByUserId(userId);
        const items = this.cartRepository
            .listByUserId(userId)
            .map((item) => this.toViewItem(item, profile));

        return {
            profile: this.toProfileSnapshot(profile),
            items,
        };
    }

    addToFavorites(userId: number, input: CreateAdmissionCartItemInput): AdmissionCartItemResult {
        const sanitized = this.sanitizeCreateInput(input);
        const option = this.findCatalogOption(sanitized.schoolId, sanitized.majorId, sanitized.methodId);
        if (!option) {
            throw new AdmissionServiceError('Lựa chọn trường, ngành hoặc phương thức xét tuyển không hợp lệ', 404);
        }

        const existing = this.cartRepository.findBySelection(
            userId,
            option.school.id,
            option.major.id,
            option.method.id
        );
        if (existing) {
            throw new AdmissionServiceError('Lựa chọn trường, ngành và phương thức này đã có trong danh sách yêu thích', 409);
        }

        const created = this.cartRepository.create(userId, sanitized);
        if (!created) {
            throw new AdmissionServiceError('Không thể thêm lựa chọn vào danh sách yêu thích xét tuyển', 500);
        }

        const profile = this.profileRepository.findByUserId(userId);
        return {
            item: this.toViewItem(created, profile),
        };
    }

    removeFromFavorites(userId: number, id: number): { message: string } {
        const deleted = this.cartRepository.delete(id, userId);
        if (!deleted) {
            throw new AdmissionServiceError('Không tìm thấy lựa chọn trong danh sách yêu thích xét tuyển', 404);
        }

        return { message: 'Đã xóa lựa chọn khỏi danh sách yêu thích xét tuyển' };
    }

    private sanitizeCreateInput(input: CreateAdmissionCartItemInput): CreateAdmissionCartItemInput {
        const schoolId = (input.schoolId ?? '').trim();
        const majorId = (input.majorId ?? '').trim();
        const methodId = (input.methodId ?? '').trim();

        if (!schoolId || !majorId || !methodId) {
            throw new AdmissionServiceError('Cần chọn đầy đủ trường, ngành và phương thức xét tuyển', 400);
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
                    city: 'Chưa xác định',
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
                    description: 'Dữ liệu danh mục đã thay đổi. Vui lòng xóa và thêm lại lựa chọn này.',
                },
                evaluation: {
                    chanceScore: 40,
                    chanceLevel: 'challenging',
                    comment: 'Không thể đánh giá lựa chọn này vì thông tin trong danh mục không còn tồn tại.',
                },
                orientation: 'Vui lòng xóa lựa chọn đã cũ này và thêm một lựa chọn hợp lệ từ danh mục hiện tại.',
                studyPlan: [
                    'Cập nhật danh sách yêu thích bằng một lựa chọn trường, ngành và phương thức hợp lệ.',
                    'Chạy lại đánh giá sau khi làm mới danh sách yêu thích xét tuyển.',
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
                name: this.resolveMajorDisplayName(option.major),
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

    private resolveMajorDisplayName(major: AdmissionMajor): string {
        if (major.id === 'marketing') {
            return 'Marketing';
        }

        return major.name;
    }

    private isTargetMajorMatched(targetMajor: string, major: AdmissionMajor): boolean {
        const normalizedTarget = normalizeText(targetMajor);
        const rawName = normalizeText(major.name);
        const displayName = normalizeText(this.resolveMajorDisplayName(major));
        return normalizedTarget.includes(rawName) || normalizedTarget.includes(displayName);
    }

    private buildCatalogMethodComment(profile: StudentProfile | undefined, option: ResolvedCatalogOption): string {
        const majorName = this.resolveMajorDisplayName(option.major);
        const averageGrade = toAverageGrade(profile);
        const targetMajorMatched = profile?.targetMajor
            ? this.isTargetMajorMatched(profile.targetMajor, option.major)
            : false;

        if (!profile || averageGrade === null) {
            return `Phương thức ${option.method.name} phù hợp để tham khảo cho ngành ${majorName}; hãy cập nhật điểm để nhận nhận xét chính xác hơn.`;
        }

        const gap = averageGrade - option.method.requiredAverage;
        const gapText = gap >= 0 ? 'đang khá phù hợp' : 'cần cải thiện thêm';
        const targetText = targetMajorMatched ? ' và trùng mục tiêu ngành của bạn' : '';

        return `Với mức điểm hiện tại, phương thức ${option.method.name} ${gapText} cho ngành ${majorName}${targetText}.`;
    }

    private buildEvaluation(profile: StudentProfile | undefined, option: ResolvedCatalogOption) {
        const averageGrade = toAverageGrade(profile);
        if (!profile || averageGrade === null) {
            return {
                chanceScore: 55,
                chanceLevel: 'medium' as const,
                comment: `Cập nhật điểm trong hồ sơ để ước tính chính xác hơn cho ngành ${this.resolveMajorDisplayName(option.major)}.`,
            };
        }

        const baseScore = (averageGrade / 10) * 65;
        const benchmarkGapScore = (averageGrade - option.method.requiredAverage) * 12;
        const subjectBonus = this.calculateSubjectBonus(profile.favoriteSubjects, option.major.field);
        const targetBonus = this.calculateTargetBonus(profile, option.major, option.school.name);
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
            ? `cao hơn mốc tham chiếu ${comparison.toFixed(2)} điểm`
            : `thấp hơn mốc tham chiếu ${Math.abs(comparison).toFixed(2)} điểm`;

        let commentTone = 'Hồ sơ hiện tại của bạn đang ở vùng cạnh tranh tốt cho lựa chọn này.';
        if (chanceLevel === 'medium') {
            commentTone = 'Hồ sơ của bạn gần đạt ngưỡng cạnh tranh; nỗ lực đều đặn có thể cải thiện cơ hội.';
        } else if (chanceLevel === 'challenging') {
            commentTone = 'Đây là lựa chọn nhiều thử thách; hãy tập trung cải thiện điểm và thêm phương án an toàn hơn.';
        }

        return {
            chanceScore,
            chanceLevel,
            comment: `Điểm trung bình ${averageGrade.toFixed(2)} ${comparisonText} (${option.method.name}). ${commentTone}`,
        };
    }

    private buildOrientation(profile: StudentProfile | undefined, option: ResolvedCatalogOption): string {
        const baseByField: Record<AdmissionMajor['field'], string> = {
            engineering: 'Phát triển tư duy định lượng, nền tảng lập trình và kỹ năng triển khai dự án.',
            business: 'Phát triển tư duy phân tích kinh doanh, giao tiếp và giải quyết vấn đề thị trường.',
            health: 'Rèn luyện tư duy khoa học, kỷ luật và thói quen học dựa trên bằng chứng.',
            social: 'Phát triển giao tiếp, đọc hiểu phản biện và phân tích vấn đề xã hội.',
        };

        const baseText = baseByField[option.major.field];
        const parts = [baseText];

        if (profile?.targetMajor && this.isTargetMajorMatched(profile.targetMajor, option.major)) {
            parts.push('Ngành này khớp trực tiếp với ngành mục tiêu bạn đã khai báo.');
        }

        if (profile?.targetUniversity && normalizeText(profile.targetUniversity).includes(normalizeText(option.school.name))) {
            parts.push('Trường này khớp với trường mục tiêu bạn đã khai báo.');
        }

        if (profile && profile.favoriteSubjects.length > 0) {
            parts.push(`Tận dụng thế mạnh ở các môn ${profile.favoriteSubjects.slice(0, 3).join(', ')}.`);
        }

        return parts.join(' ');
    }

    private buildStudyPlan(
        profile: StudentProfile | undefined,
        option: ResolvedCatalogOption,
        chanceLevel: AdmissionChanceLevel
    ): string[] {
        const averageGrade = toAverageGrade(profile);
        const methodSpecificStep = this.getMethodSpecificStep(option.method.type, this.resolveMajorDisplayName(option.major));
        const scoreGap = averageGrade === null
            ? option.method.requiredAverage
            : Math.max(0, option.method.requiredAverage - averageGrade);

        const scoreFocus = scoreGap <= 0.1
            ? 'Duy trì kết quả hiện tại bằng các mốc ôn tập hằng tuần.'
            : `Tăng điểm trung bình khoảng ${scoreGap.toFixed(1)} bằng cách luyện tập trọng tâm theo từng môn.`;

        const riskControl = chanceLevel === 'challenging'
            ? 'Thêm 1-2 phương án dự phòng có mốc thấp hơn trong khi vẫn giữ mục tiêu tham vọng này.'
            : 'Giữ ít nhất một phương án dự phòng cân bằng để giảm rủi ro xét tuyển.'

        return [
            `Tuần 1-3: ${scoreFocus}`,
            `Tuần 4-7: ${methodSpecificStep}`,
            `Tuần 8-10: Lập timeline nộp hồ sơ và chuẩn bị giấy tờ cần thiết cho ${option.school.name}.`,
            `Tuần 11-12: Mô phỏng điều kiện thi/xét tuyển cuối cùng và ôn lại các phần còn yếu. ${riskControl}`,
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
        major: AdmissionMajor,
        schoolName: string
    ): number {
        let bonus = 0;

        if (profile.targetMajor && this.isTargetMajorMatched(profile.targetMajor, major)) {
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
                return `Hoàn thành ít nhất 3 đề luyện thi đầy đủ mỗi tuần cho tổ hợp xét tuyển của ngành ${majorName}.`;
            case 'transcript':
                return 'Giữ điểm từng học kỳ ổn định và sắp xếp chứng chỉ/hoạt động làm minh chứng bổ sung.';
            case 'competency':
                return 'Luyện logic, đọc hiểu và giải quyết bài có giới hạn thời gian 4 buổi mỗi tuần.';
            case 'direct':
                return 'Chuẩn bị hồ sơ năng lực, bài giới thiệu bản thân và nhấn mạnh hoạt động ngoại khóa có tác động rõ ràng.';
            default:
                return 'Ôn tập đều đặn và theo dõi tiến độ hằng tuần.';
        }
    }
}
