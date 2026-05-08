import {
    PersonalityAnswer,
    PersonalityQuestion,
    PersonalityScores,
    PersonalitySubmission,
    SubmitPersonalityInput,
} from '../model/personality.model';
import { PersonalityRepository } from '../repository/personality.repository';

const QUESTIONS: PersonalityQuestion[] = [
    {
        id: 'q1',
        prompt: 'Trong dự án nhóm, bạn thường chủ động bắt đầu cuộc thảo luận.',
        dimension: 'E/I',
        optionA: 'Đúng, em thường khởi xướng và giữ cho cuộc thảo luận sôi nổi.',
        optionB: 'Không, em thích suy nghĩ trước rồi mới phát biểu.',
    },
    {
        id: 'q2',
        prompt: 'Bạn cảm thấy nạp lại năng lượng khi dành thời gian với nhiều người.',
        dimension: 'E/I',
        optionA: 'Đúng với em.',
        optionB: 'Em nạp lại năng lượng tốt hơn khi ở một mình.',
    },
    {
        id: 'q3',
        prompt: 'Khi học tập, bạn tin vào dữ kiện cụ thể hơn là ý tưởng trừu tượng.',
        dimension: 'S/N',
        optionA: 'Dữ kiện cụ thể quan trọng hơn với em.',
        optionB: 'Em thích nhận ra quy luật và các khái niệm trừu tượng.',
    },
    {
        id: 'q4',
        prompt: 'Bạn thích ví dụ thực tế hơn là lý thuyết.',
        dimension: 'S/N',
        optionA: 'Em muốn xem ví dụ thực tế trước.',
        optionB: 'Em muốn hiểu lý thuyết và bức tranh tổng thể trước.',
    },
    {
        id: 'q5',
        prompt: 'Khi ra quyết định, bạn ưu tiên logic khách quan.',
        dimension: 'T/F',
        optionA: 'Em ưu tiên logic khách quan và sự nhất quán.',
        optionB: 'Em ưu tiên tác động đến con người và sự hài hòa.',
    },
    {
        id: 'q6',
        prompt: 'Khi có mâu thuẫn, bạn thường nói thẳng hơn là nói vòng vo.',
        dimension: 'T/F',
        optionA: 'Em thích trao đổi trực tiếp và rõ ràng.',
        optionB: 'Em thích trao đổi khéo léo và thấu cảm.',
    },
    {
        id: 'q7',
        prompt: 'Bạn thích lập kế hoạch và làm theo cấu trúc rõ ràng.',
        dimension: 'J/P',
        optionA: 'Em thích kế hoạch và mốc thời gian cố định.',
        optionB: 'Em thích linh hoạt và thích nghi theo tình huống.',
    },
    {
        id: 'q8',
        prompt: 'Bạn thường hoàn thành nhiệm vụ sớm thay vì sát hạn.',
        dimension: 'J/P',
        optionA: 'Em thường hoàn thành sớm và có tổ chức.',
        optionB: 'Em thường hoàn thành gần sát hạn.',
    },
];

type DimensionPair = PersonalityQuestion['dimension'];

const DIMENSION_LETTERS: Record<DimensionPair, [keyof PersonalityScores, keyof PersonalityScores]> = {
    'E/I': ['E', 'I'],
    'S/N': ['S', 'N'],
    'T/F': ['T', 'F'],
    'J/P': ['J', 'P'],
};

export interface PersonalityQuestionsResult {
    questions: PersonalityQuestion[];
}

export interface PersonalityLatestResult {
    submission: PersonalitySubmission | null;
}

export interface SubmitPersonalityResult {
    submission: PersonalitySubmission;
}

export class PersonalityServiceError extends Error {
    constructor(
        message: string,
        public statusCode: number = 400
    ) {
        super(message);
        this.name = 'PersonalityServiceError';
    }
}

export class PersonalityService {
    constructor(private repository: PersonalityRepository) { }

    getQuestions(): PersonalityQuestionsResult {
        return { questions: QUESTIONS };
    }

    submit(userId: number, input: SubmitPersonalityInput): SubmitPersonalityResult {
        const answers = this.validateAnswers(input.answers);
        const scores = this.calculateScores(answers);
        const mbtiType = this.buildMbtiType(scores);

        const submission = this.repository.create({
            userId,
            answers,
            mbtiType,
            scores,
        });

        if (!submission) {
            throw new PersonalityServiceError('Không thể lưu bài đánh giá tính cách', 500);
        }

        return { submission };
    }

    getLatest(userId: number): PersonalityLatestResult {
        const submission = this.repository.findLatestByUserId(userId) ?? null;
        return { submission };
    }

    private validateAnswers(input: Record<string, PersonalityAnswer> | undefined): Record<string, PersonalityAnswer> {
        if (!input || typeof input !== 'object' || Array.isArray(input)) {
            throw new PersonalityServiceError('Vui lòng trả lời đầy đủ câu hỏi', 400);
        }

        const answers: Record<string, PersonalityAnswer> = {};

        for (const question of QUESTIONS) {
            const answer = input[question.id];
            if (answer !== 'A' && answer !== 'B') {
                throw new PersonalityServiceError(`Thiếu hoặc sai câu trả lời cho ${question.id}`, 400);
            }

            answers[question.id] = answer;
        }

        return answers;
    }

    private calculateScores(answers: Record<string, PersonalityAnswer>): PersonalityScores {
        const scores: PersonalityScores = {
            E: 0,
            I: 0,
            S: 0,
            N: 0,
            T: 0,
            F: 0,
            J: 0,
            P: 0,
        };

        for (const question of QUESTIONS) {
            const [first, second] = DIMENSION_LETTERS[question.dimension];
            if (answers[question.id] === 'A') {
                scores[first] += 1;
            } else {
                scores[second] += 1;
            }
        }

        return scores;
    }

    private buildMbtiType(scores: PersonalityScores): string {
        const ei = scores.E >= scores.I ? 'E' : 'I';
        const sn = scores.S >= scores.N ? 'S' : 'N';
        const tf = scores.T >= scores.F ? 'T' : 'F';
        const jp = scores.J >= scores.P ? 'J' : 'P';
        return `${ei}${sn}${tf}${jp}`;
    }
}
