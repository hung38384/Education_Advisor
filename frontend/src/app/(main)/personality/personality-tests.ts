import type { PersonalityAnswer, PersonalityQuestion } from '@/services/personalityService';

export type AssessmentTestId = 'mbti' | 'eq' | 'disc';
type DiscValue = 'D' | 'I' | 'S' | 'C';

export type AssessmentChoice = {
    value: string;
    label: string;
};

export type AssessmentQuestion = {
    id: string;
    prompt: string;
    choices: AssessmentChoice[];
    dimension?: PersonalityQuestion['dimension'];
};

export type AssessmentResult = {
    title: string;
    summary: string;
    recommendation: string;
};

export type AssessmentTest = {
    id: AssessmentTestId;
    name: string;
    description: string;
};

export const ASSESSMENT_TESTS: AssessmentTest[] = [
    {
        id: 'mbti',
        name: 'MBTI',
        description: 'Khám phá xu hướng năng lượng, cách tiếp nhận thông tin, ra quyết định và tổ chức cuộc sống.',
    },
    {
        id: 'eq',
        name: 'EQ',
        description: 'Đánh giá khả năng nhận diện cảm xúc, kiểm soát phản ứng và thấu hiểu người khác.',
    },
    {
        id: 'disc',
        name: 'DISC',
        description: 'Nhận diện phong cách hành vi nổi bật khi học tập, giao tiếp và làm việc nhóm.',
    },
];

const EQ_CHOICES: AssessmentChoice[] = [
    { value: '1', label: 'Rất không đúng với em' },
    { value: '2', label: 'Không đúng với em' },
    { value: '3', label: 'Phân vân' },
    { value: '4', label: 'Đúng với em' },
    { value: '5', label: 'Rất đúng với em' },
];

const DISC_CHOICES: AssessmentChoice[] = [
    { value: 'D', label: 'Chủ động dẫn dắt và quyết nhanh' },
    { value: 'I', label: 'Thích trao đổi, truyền cảm hứng cho người khác' },
    { value: 'S', label: 'Kiên nhẫn, ổn định và hỗ trợ nhóm' },
    { value: 'C', label: 'Cẩn thận, phân tích kỹ trước khi làm' },
];

export const LOCAL_TEST_QUESTIONS: Record<Exclude<AssessmentTestId, 'mbti'>, AssessmentQuestion[]> = {
    eq: [
        {
            id: 'eq-1',
            prompt: 'Khi gặp áp lực học tập, em nhận ra cảm xúc của mình khá nhanh.',
            choices: EQ_CHOICES,
        },
        {
            id: 'eq-2',
            prompt: 'Em có thể bình tĩnh trao đổi khi bất đồng quan điểm với bạn bè hoặc gia đình.',
            choices: EQ_CHOICES,
        },
        {
            id: 'eq-3',
            prompt: 'Em thường hiểu được người khác đang cần hỗ trợ điều gì.',
            choices: EQ_CHOICES,
        },
    ],
    disc: [
        {
            id: 'disc-1',
            prompt: 'Khi nhận một bài tập nhóm mới, phản ứng tự nhiên nhất của em là gì?',
            choices: DISC_CHOICES,
        },
        {
            id: 'disc-2',
            prompt: 'Khi phải chọn cách giải quyết vấn đề, em thường ưu tiên điều gì?',
            choices: DISC_CHOICES,
        },
        {
            id: 'disc-3',
            prompt: 'Trong môi trường học tập, người khác thường thấy em như thế nào?',
            choices: DISC_CHOICES,
        },
    ],
};

export function toMbtiAssessmentQuestions(questions: PersonalityQuestion[]): AssessmentQuestion[] {
    return questions.map((question) => ({
        id: question.id,
        prompt: question.prompt,
        dimension: question.dimension,
        choices: [
            { value: 'A', label: question.optionA },
            { value: 'B', label: question.optionB },
        ],
    }));
}

function getMbtiResult(questions: AssessmentQuestion[], answers: Record<string, string>, backendType?: string): AssessmentResult {
    if (backendType) {
        return {
            title: `Nhóm tính cách ${backendType}`,
            summary: `Kết quả MBTI của bạn nghiêng về nhóm ${backendType}. Nhóm này phản ánh cách bạn nạp năng lượng, xử lý thông tin, ra quyết định và sắp xếp công việc.`,
            recommendation: 'Hãy chọn ngành học có môi trường phù hợp với cách bạn học tốt nhất, đồng thời kết hợp thêm điểm mạnh môn học và mục tiêu nghề nghiệp.',
        };
    }

    const scores: Record<string, number> = { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 };

    questions.forEach((question) => {
        if (!question.dimension) {
            return;
        }

        const [first, second] = question.dimension.split('/');
        const answer = answers[question.id];
        if (answer === 'A') {
            scores[first] += 1;
        }
        if (answer === 'B') {
            scores[second] += 1;
        }
    });

    const type = `${scores.E >= scores.I ? 'E' : 'I'}${scores.S >= scores.N ? 'S' : 'N'}${scores.T >= scores.F ? 'T' : 'F'}${scores.J >= scores.P ? 'J' : 'P'}`;

    return {
        title: `Nhóm tính cách ${type}`,
        summary: `Bạn có xu hướng thuộc nhóm ${type}. Kết quả này cho thấy phong cách học tập và ra quyết định nổi bật của bạn trong các tình huống quen thuộc.`,
        recommendation: 'Dùng kết quả này như một gợi ý ban đầu, sau đó đối chiếu với điểm mạnh môn học và các ngành bạn đang quan tâm.',
    };
}

function getEqResult(answers: Record<string, string>): AssessmentResult {
    const values = Object.values(answers)
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value));
    const average = values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);

    if (average >= 4) {
        return {
            title: 'EQ nổi bật',
            summary: 'Bạn có khả năng nhận diện cảm xúc tốt, biết điều chỉnh phản ứng và thường quan tâm đến cảm nhận của người khác.',
            recommendation: 'Bạn có thể phù hợp với các ngành cần giao tiếp, tư vấn, quản trị, giáo dục hoặc làm việc nhóm thường xuyên.',
        };
    }

    if (average >= 3) {
        return {
            title: 'EQ cân bằng',
            summary: 'Bạn có nền tảng cảm xúc khá ổn định nhưng vẫn có thể rèn thêm khả năng diễn đạt cảm xúc và xử lý áp lực.',
            recommendation: 'Hãy luyện phản hồi bình tĩnh, ghi chú cảm xúc khi học căng thẳng và chọn môi trường học có hỗ trợ từ thầy cô, bạn bè.',
        };
    }

    return {
        title: 'EQ cần rèn luyện thêm',
        summary: 'Bạn có thể gặp khó khăn khi gọi tên cảm xúc hoặc giữ bình tĩnh trong tình huống áp lực.',
        recommendation: 'Nên bắt đầu bằng thói quen tự đánh giá cảm xúc mỗi ngày và chọn mục tiêu học tập nhỏ để giảm áp lực.',
    };
}

function getDiscResult(answers: Record<string, string>): AssessmentResult {
    const counts: Record<DiscValue, number> = { D: 0, I: 0, S: 0, C: 0 };
    Object.values(answers).forEach((value) => {
        if (value === 'D' || value === 'I' || value === 'S' || value === 'C') {
            counts[value] += 1;
        }
    });

    const top = (Object.entries(counts) as Array<[DiscValue, number]>).sort((left, right) => right[1] - left[1])[0]?.[0] ?? 'S';

    const resultMap: Record<DiscValue, AssessmentResult> = {
        D: {
            title: 'DISC nhóm D - Chủ động',
            summary: 'Bạn có xu hướng quyết đoán, thích mục tiêu rõ ràng và muốn tạo ảnh hưởng nhanh trong nhóm.',
            recommendation: 'Bạn có thể hợp với môi trường có thử thách, dự án thực tế, quản trị, kinh doanh hoặc kỹ thuật có mục tiêu đo lường rõ.',
        },
        I: {
            title: 'DISC nhóm I - Kết nối',
            summary: 'Bạn có xu hướng cởi mở, thích trao đổi ý tưởng và tạo năng lượng tích cực cho người xung quanh.',
            recommendation: 'Bạn có thể hợp với truyền thông, marketing, giáo dục, dịch vụ, ngoại ngữ hoặc các ngành cần thuyết trình nhiều.',
        },
        S: {
            title: 'DISC nhóm S - Ổn định',
            summary: 'Bạn có xu hướng kiên nhẫn, đáng tin cậy và thích môi trường học tập rõ ràng, ít thay đổi đột ngột.',
            recommendation: 'Bạn có thể hợp với giáo dục, chăm sóc sức khỏe, nhân sự, vận hành hoặc các ngành cần sự bền bỉ.',
        },
        C: {
            title: 'DISC nhóm C - Phân tích',
            summary: 'Bạn có xu hướng cẩn thận, thích dữ liệu rõ ràng và muốn hiểu kỹ trước khi quyết định.',
            recommendation: 'Bạn có thể hợp với công nghệ, dữ liệu, tài chính, kỹ thuật, nghiên cứu hoặc các ngành cần độ chính xác cao.',
        },
    };

    return resultMap[top];
}

export function scoreAssessment(
    testId: AssessmentTestId,
    questions: AssessmentQuestion[],
    answers: Record<string, string>,
    backendMbtiType?: string
): AssessmentResult {
    if (testId === 'mbti') {
        return getMbtiResult(questions, answers, backendMbtiType);
    }

    if (testId === 'eq') {
        return getEqResult(answers);
    }

    return getDiscResult(answers);
}

export function toMbtiPayload(answers: Record<string, string>): Record<string, PersonalityAnswer> {
    return Object.fromEntries(
        Object.entries(answers).filter((entry): entry is [string, PersonalityAnswer] => entry[1] === 'A' || entry[1] === 'B')
    );
}
