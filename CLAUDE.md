# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout (current working stack)

- `frontend/`: Next.js 15 (App Router) UI.
- `backend/`: Express + TypeScript API with SQLite persistence.
- `EducationAdvisor/backend/`: FastAPI + LangGraph AI service used by Express Q&A (`/api/ai/qa/ask`).
- `EducationAdvisor/frontend/`: older Next.js 14 frontend scaffold; only touch when tasks explicitly target it.

## Common development commands

### Frontend (`frontend/`)
- Install: `npm install`
- Dev server: `npm run dev`
- Build: `npm run build`
- Lint: `npm run lint`
- E2E tests: `npm run test:e2e`
- Single Playwright test: `npx playwright test path/to/spec.ts`

### Express API (`backend/`)
- Install: `npm install`
- Full dev stack (starts FastAPI sidecar + Express): `npm run dev`
- Lite dev stack (AI lite deps): `npm run dev:lite`
- Express-only dev (no sidecar orchestration): `npm run dev:api`
- Build TypeScript: `npm run build`
- Tests: `npm test`
- Single integration test: `npm run build && node --test dist/qa-ai.integration.test.js`

### AI sidecar (`EducationAdvisor/backend/`)
- Install full deps: `pip install -r requirements.txt`
- Install lite deps: `pip install -r requirements.dev-lite.txt`
- Run directly: `uvicorn app.main:app --reload --port 8000`
- Tests: `pytest`
- Single test: `pytest tests/test_internal_ai_qa_route.py -q`

## Runtime and environment wiring

- Frontend calls Express via `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:5001/api`).
- Express listens on `PORT` (default `5001`) and calls AI service via:
  - `AI_SERVICE_BASE_URL` (default `http://localhost:8000`)
  - `AI_SERVICE_QA_ENDPOINT_PATH` (default `/api/ai/qa/ask`)
  - optional `AI_SERVICE_API_KEY` -> sent as `X-Internal-Api-Key`
- FastAPI validates `X-Internal-Api-Key` when `INTERNAL_API_KEY` is set.

## High-level architecture

### Main request flow (non-AI features)
1. Next.js page uses hooks in `frontend/src/hooks/*`.
2. Hooks call service layer in `frontend/src/services/*`.
3. Services use shared Axios client (`frontend/src/config/axios.ts`) and route constants (`frontend/src/config/api-collection.ts`).
4. Express routes (`backend/src/routes/*.routes.ts`) -> controllers -> services -> repositories -> SQLite.
5. SQLite schema + migration-at-startup logic lives in `backend/src/config/database.ts`.

### Q&A flow (cross-service)
1. Frontend Q&A UI (`frontend/src/app/(main)/qa/page.tsx`) -> `useQa` hooks -> `qaService`.
2. Express Q&A module (`qa.routes.ts` -> `qa.controller.ts` -> `qa.service.ts`).
3. `QAService` stores conversation/messages in SQLite and calls `QAInferenceClient` (`backend/src/clients/ai.client.ts`).
4. FastAPI route `EducationAdvisor/backend/app/api/routes/ai_qa.py` handles `/api/ai/qa/ask`.
5. AI logic in `EducationAdvisor/backend/app/ai/qa_service.py` uses LangGraph/tools, with local retrieval fallback when graph/model is unavailable.

## Project conventions to follow

- Backend layering is explicit: `routes -> controllers -> services -> repository -> model`.
- Keep API paths centralized in `frontend/src/config/api-collection.ts`.
- Frontend styling guidance (from README): prefer Tailwind utility classes in-place for one-off styles; extract repeated UI into `src/components/ui`; avoid new inline styles.
- Auth pattern: Bearer token in `localStorage` + Axios request interceptor; protected Express endpoints use `createAuthenticateToken` middleware.
- Observability: request metrics middleware in Express; metrics endpoint at `/api/metrics` when enabled.

## Testing notes

- Express tests are Node test runner + Supertest files in `backend/src/*.test.ts`; tests run from compiled `dist/` output.
- AI sidecar tests are pytest files in `EducationAdvisor/backend/tests/`.
- Frontend currently uses Playwright command wiring (`test:e2e`) for browser flows.
