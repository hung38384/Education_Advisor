"use client";

import { FormEvent, useMemo, useState } from "react";

import { requestAdvice } from "@/services/advisor";
import type { AdviceRequest } from "@/types/advisor";

const UNIVERSITY_OPTIONS = [
  { label: "Bach Khoa Ha Noi (BKA)", value: "BKA" },
  { label: "Thuong Mai University (TMU)", value: "TMU" },
  { label: "National Economics University (KHA)", value: "KHA" },
  { label: "Hanoi Law University (LPH)", value: "LPH" },
];

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [targetUniversity, setTargetUniversity] = useState("BKA");
  const [targetYear, setTargetYear] = useState("2024");
  const [targetMajor, setTargetMajor] = useState("");
  const [ielts, setIelts] = useState("");
  const [tsaScore, setTsaScore] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const canSubmit = useMemo(
    () => query.trim().length > 0 && !isLoading,
    [isLoading, query],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    setIsLoading(true);
    setError("");
    setAnswer("");

    const payload: AdviceRequest = {
      query: query.trim(),
      target_university: targetUniversity || undefined,
      target_year: targetYear.trim() || undefined,
      target_major: targetMajor.trim() || undefined,
      ielts: ielts.trim() ? Number(ielts) : undefined,
      tsa_score: tsaScore.trim() ? Number(tsaScore) : undefined,
    };

    try {
      const result = await requestAdvice(payload);
      setAnswer(result.advice);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Unable to reach the advisor service.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="advisor-shell">
      <section className="advisor-panel">
        <div className="advisor-header">
          <div>
            <p className="eyebrow">AI Admission Advisor</p>
            <h1>University guidance workspace</h1>
          </div>
          <div className="status-pill">Backend: localhost:8000</div>
        </div>

        <form className="advisor-form" onSubmit={handleSubmit}>
          <label className="field field-wide">
            <span>Question</span>
            <textarea
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Example: Em co IELTS 7.0 va diem HSA 85, muon xet tuyen KHA nganh Quan tri kinh doanh. Hay tinh diem va danh gia co hoi do."
              rows={7}
            />
          </label>

          <label className="field">
            <span>Target university</span>
            <select
              value={targetUniversity}
              onChange={(event) => setTargetUniversity(event.target.value)}
            >
              {UNIVERSITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Target year</span>
            <input
              value={targetYear}
              onChange={(event) => setTargetYear(event.target.value)}
              placeholder="2024"
            />
          </label>

          <label className="field">
            <span>Major code</span>
            <input
              value={targetMajor}
              onChange={(event) => setTargetMajor(event.target.value)}
              placeholder="IT1, TM04, 7340101..."
            />
          </label>

          <label className="field">
            <span>IELTS</span>
            <input
              type="number"
              min="0"
              max="9"
              step="0.5"
              value={ielts}
              onChange={(event) => setIelts(event.target.value)}
              placeholder="7.0"
            />
          </label>

          <label className="field">
            <span>TSA/HSA score</span>
            <input
              type="number"
              min="0"
              step="0.1"
              value={tsaScore}
              onChange={(event) => setTsaScore(event.target.value)}
              placeholder="85"
            />
          </label>

          <button className="submit-button" type="submit" disabled={!canSubmit}>
            {isLoading ? "Thinking..." : "Submit"}
          </button>
        </form>
      </section>

      <section className="response-panel" aria-live="polite">
        <div className="response-header">
          <h2>Advisor response</h2>
          {isLoading && <span>Running LangGraph workflow</span>}
        </div>

        {error ? <div className="error-box">{error}</div> : null}

        <article className="response-content">
          {answer ? (
            <pre>{answer}</pre>
          ) : (
            <p className="empty-state">
              Submit a question to see the synthesized AI guidance here.
            </p>
          )}
        </article>
      </section>
    </main>
  );
}
