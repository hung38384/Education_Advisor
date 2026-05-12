export type AdviceRequest = {
  query: string;
  target_university?: string;
  target_major?: string;
  target_major_name?: string;
  target_year?: string;
  mbti?: string;
  ielts?: number;
  tsa_score?: number;
  transcript?: Record<string, number>;
};

export type AdviceResponse = {
  status: string;
  advice: string;
};
