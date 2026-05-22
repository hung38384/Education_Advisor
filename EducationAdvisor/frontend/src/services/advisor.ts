import axios from "axios";

import type { AdviceRequest, AdviceResponse } from "@/types/advisor";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export async function requestAdvice(
  payload: AdviceRequest,
): Promise<AdviceResponse> {
  const response = await axios.post<AdviceResponse>(
    `${API_BASE_URL}/api/v1/advise`,
    payload,
    {
      timeout: 190_000,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );

  return response.data;
}
