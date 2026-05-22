import type { PersonalityQuestion } from '@/services/personalityService';

export type AssessmentTestId = 'mbti';

export const assessmentTests = [
    {
        id: 'mbti' as const,
        title: 'MBTI 28 câu',
        description: 'Bài đánh giá 4 nhóm E/I, S/N, T/F, J/P với bốn lựa chọn A/B/C/D.',
    },
];

export function mapBackendQuestion(question: PersonalityQuestion) {
    return {
        id: question.id,
        prompt: question.prompt,
        dimension: question.dimension,
        choices: question.choices,
    };
}
