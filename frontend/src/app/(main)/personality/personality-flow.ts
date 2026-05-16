import type { PersonalityAnswer } from '@/services/personalityService';

export type PersonalityQuizMode = 'loading' | 'error' | 'empty' | 'quiz' | 'result';

interface QuizModeInput {
    questionsCount: number;
    submittedResult: unknown | null;
    latestSubmission: unknown | null;
    isLoading: boolean;
    isError: boolean;
}

export function getPersonalityQuizMode(input: QuizModeInput): PersonalityQuizMode {
    if (input.isLoading) {
        return 'loading';
    }

    if (input.isError) {
        return 'error';
    }

    if (input.questionsCount === 0) {
        return 'empty';
    }

    return input.submittedResult ? 'result' : 'quiz';
}

export function canAdvanceFromQuestion(answers: Record<string, PersonalityAnswer>, questionId: string): boolean {
    return Boolean(answers[questionId]);
}

export function getNextQuestionIndex(
    currentIndex: number,
    questionsCount: number,
    currentQuestionId: string,
    answers: Record<string, PersonalityAnswer>
): number {
    if (!canAdvanceFromQuestion(answers, currentQuestionId)) {
        return currentIndex;
    }

    return Math.min(currentIndex + 1, Math.max(questionsCount - 1, 0));
}

export function canSubmitQuiz(answers: Record<string, PersonalityAnswer>, questionIds: string[]): boolean {
    return questionIds.length > 0 && questionIds.every((questionId) => Boolean(answers[questionId]));
}

export function canSubmitCurrentStep(isLastQuestion: boolean, canSubmit: boolean): boolean {
    return isLastQuestion && canSubmit;
}
