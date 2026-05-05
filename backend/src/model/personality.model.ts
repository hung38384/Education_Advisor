export interface PersonalityQuestion {
    id: string;
    prompt: string;
    dimension: 'E/I' | 'S/N' | 'T/F' | 'J/P';
    optionA: string;
    optionB: string;
}

export type PersonalityAnswer = 'A' | 'B';

export interface PersonalityScores {
    E: number;
    I: number;
    S: number;
    N: number;
    T: number;
    F: number;
    J: number;
    P: number;
}

export interface PersonalitySubmission {
    id: number;
    userId: number;
    answers: Record<string, PersonalityAnswer>;
    mbtiType: string;
    scores: PersonalityScores;
    createdAt: string;
}

export interface SubmitPersonalityInput {
    answers: Record<string, PersonalityAnswer>;
}
