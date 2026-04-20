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
        prompt: 'In a group project, you usually take the lead to start discussions.',
        dimension: 'E/I',
        optionA: 'Yes, I often start and keep the discussion active.',
        optionB: 'No, I prefer to think first and speak after.',
    },
    {
        id: 'q2',
        prompt: 'You recharge energy by spending time with many people.',
        dimension: 'E/I',
        optionA: 'True for me.',
        optionB: 'I recharge better when I am alone.',
    },
    {
        id: 'q3',
        prompt: 'When learning, you trust concrete facts more than abstract ideas.',
        dimension: 'S/N',
        optionA: 'Concrete facts are more important to me.',
        optionB: 'I like patterns and abstract concepts.',
    },
    {
        id: 'q4',
        prompt: 'You prefer practical examples over theories.',
        dimension: 'S/N',
        optionA: 'Practical examples first.',
        optionB: 'Theories and big-picture first.',
    },
    {
        id: 'q5',
        prompt: 'When making decisions, you prioritize objective logic.',
        dimension: 'T/F',
        optionA: 'Objective logic and consistency first.',
        optionB: 'People impact and harmony first.',
    },
    {
        id: 'q6',
        prompt: 'In conflict, you are more likely to be direct than diplomatic.',
        dimension: 'T/F',
        optionA: 'Direct and explicit.',
        optionB: 'Diplomatic and empathetic.',
    },
    {
        id: 'q7',
        prompt: 'You like to make plans and follow clear structure.',
        dimension: 'J/P',
        optionA: 'I prefer planning and fixed timelines.',
        optionB: 'I prefer flexibility and adaptation.',
    },
    {
        id: 'q8',
        prompt: 'You finish tasks early rather than close to deadline.',
        dimension: 'J/P',
        optionA: 'Usually early and organized.',
        optionB: 'Usually closer to deadline.',
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
            throw new PersonalityServiceError('Unable to save personality submission', 500);
        }

        return { submission };
    }

    getLatest(userId: number): PersonalityLatestResult {
        const submission = this.repository.findLatestByUserId(userId) ?? null;
        return { submission };
    }

    private validateAnswers(input: Record<string, PersonalityAnswer> | undefined): Record<string, PersonalityAnswer> {
        if (!input || typeof input !== 'object' || Array.isArray(input)) {
            throw new PersonalityServiceError('Answers are required', 400);
        }

        const answers: Record<string, PersonalityAnswer> = {};

        for (const question of QUESTIONS) {
            const answer = input[question.id];
            if (answer !== 'A' && answer !== 'B') {
                throw new PersonalityServiceError(`Missing or invalid answer for ${question.id}`, 400);
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
