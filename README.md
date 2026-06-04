# Education Advisor Project Overview

<!-- AUTO-GENERATED:START -->

This document summarizes the architecture, feature modules, technology stack, development commands, and environment configuration of the `Education Advisor` project. The content is cross-checked against current source-of-truth files in the codebase, including `CLAUDE.md`, `frontend/package.json`, `backend/package.json`, `EducationAdvisor/backend/requirements*.txt`, route files under `backend/src/routes/*`, `EducationAdvisor/backend/app/api/routes/*`, `.env.example`, and application startup configuration.

## 1. System Goals

`Education Advisor` is an admissions counseling and study/career orientation system. The project combines a Next.js web application, an Express/TypeScript web API using SQLite for user and business data, and a FastAPI/LangGraph AI sidecar that handles admissions counseling, Q&A, admissions-rule and benchmark-score search, and major/career-group prediction. Users can register and log in, create student profiles, take an MBTI personality test, view profile reviews, ask admissions questions, browse admissions catalogs, and save favorite options.

## 2. Repository Structure

```text
D:\Education_Advisor
+-- frontend/                    # Main frontend: Next.js 15 App Router
+-- backend/                     # Main web backend: Express + TypeScript + SQLite
`-- EducationAdvisor/
    +-- backend/                 # AI sidecar: FastAPI + LangGraph + ML/RAG
    +-- frontend/                # Legacy frontend: Next.js 14 scaffold
    `-- docker-compose.yml       # Docker Compose for the standalone/legacy stack
```

The active project stack consists of the main frontend in `frontend/`, the Express web backend in `backend/`, and the FastAPI AI backend in `EducationAdvisor/backend/`. The `EducationAdvisor/frontend/` directory is a legacy scaffold and should only be used when explicitly required.

## 3. Overall Architecture

The system is split into three main layers:

1. **Main frontend (`frontend/`)**: a Next.js 15 App Router user interface that calls the Express API through an Axios client and route constants.
2. **Web backend (`backend/`)**: an Express API written in TypeScript, storing business data in SQLite, handling JWT authentication, authorization, Redis cache with an in-memory fallback, and acting as the bridge to the AI sidecar.
3. **AI sidecar (`EducationAdvisor/backend/`)**: a FastAPI service using LangGraph/LangChain, admissions-rule lookup tools, historical benchmark-score lookup, MongoDB/Chroma/Redis, and ML components for AI counseling.

Main non-AI business flow:

```text
Next.js page
  -> frontend/src/hooks/*
  -> frontend/src/services/*
  -> frontend/src/config/axios.ts
  -> Express route/controller/service/repository
  -> SQLite
```

AI Q&A/counseling flow:

```text
frontend/src/app/(main)/qa/page.tsx
  -> useQa hook
  -> qaService
  -> Express /api/qa/*
  -> QAService + SQLite conversation/message storage
  -> QAInferenceClient
  -> FastAPI /api/ai/qa/ask
  -> LangGraph/tools/RAG/local fallback
```

Profile review and admissions flow:

```text
Frontend profile/personality/review/admissions pages
  -> Express review/admission services
  -> SQLite repositories + cache
  -> AI clients calling FastAPI /api/v1/admissions/search, /api/v1/predict-fast, or /api/v1/advisor
```

## 4. Technology Stack

### 4.1 Main Frontend: `frontend/`

| Group | Technology | Version/notes |
|------|------------|---------------|
| UI framework | Next.js | `15.5.9`, App Router |
| UI runtime | React, React DOM | `18.3.1` |
| Language | TypeScript | `^5.9.3` |
| Styling | Tailwind CSS | `^3.4.1`, PostCSS, Autoprefixer |
| Data fetching/client cache | TanStack React Query | `^5.90.16` |
| State management | Jotai | `^2.16.1` |
| HTTP client | Axios | `^1.13.2` |
| E2E testing | Playwright | `@playwright/test ^1.53.0` |
| Linting | ESLint + eslint-config-next | ESLint `8.57.0`, Next config `15.5.9` |
| Build/dev | npm scripts | `dev`, `build`, `start`, `lint`, `test:e2e` |

### 4.2 Main Web Backend: `backend/`

| Group | Technology | Version/notes |
|------|------------|---------------|
| Runtime/API | Node.js + Express | Express `^4.21.2` |
| Language | TypeScript | `^5.9.3` |
| Dev runtime | ts-node, nodemon | `ts-node ^10.9.2`, `nodemon ^3.1.11` |
| Local database | SQLite | `better-sqlite3 ^12.5.0`, `sqlite3 ^5.1.7` |
| Cache | Redis | Node Redis client `^4.7.0`, with in-memory fallback |
| Auth | JWT + bcryptjs | `jsonwebtoken ^9.0.3`, `bcryptjs ^2.4.3` |
| CORS/env | cors, dotenv | `cors ^2.8.5`, `dotenv ^17.2.3` |
| Utility IDs | uuid | `^13.0.0` |
| Testing | Node test runner + Supertest | `supertest ^7.1.1`; tests run from `dist/**/*.test.js` |
| Observability | Custom middleware | request logging and `/api/metrics` when `METRICS_ENABLED` is enabled |

This backend follows a clear layered architecture:

```text
routes -> controllers -> services -> repositories -> models/database
```

Main business modules:

| Module | Representative files/features |
|--------|--------------------------------|
| Auth | `auth.routes.ts`, `auth.controller.ts`, `auth.service.ts`, JWT Bearer token, password reset |
| Admin user | User administration, role/status management, requires `superadmin` |
| Student profile | Student profile, academic scores, interests, target majors/schools |
| Personality | MBTI question set, result submission, latest result, history |
| Review | Runs profile reviews and stores review results |
| Q&A | Conversations, messages, AI Q&A, advice |
| Admissions | Admissions catalog and favorites list |
| Cache | Redis-backed cache with memory fallback in `cache-store.ts` |
| Metrics | `/api/metrics`, request metrics store |

### 4.3 AI Sidecar: `EducationAdvisor/backend/`

| Group | Technology | Version/notes |
|------|------------|---------------|
| API framework | FastAPI | `0.110.0` |
| ASGI server | Uvicorn | `uvicorn[standard] 0.29.0` |
| Language | Python | Based on the installed environment; packages are installed from `requirements.txt` |
| Validation/config | Pydantic, pydantic-settings | `pydantic 2.7.4`, `pydantic-settings 2.3.4` |
| Async database | MongoDB | `pymongo`, `motor` |
| Cache | Redis | `redis 5.0.4`, Q&A cache namespace/TTL |
| Vector database | ChromaDB | `chromadb 0.5.0`, `langchain-chroma` |
| AI orchestration | LangChain, LangGraph | LangChain `0.2.x`, LangGraph `>=0.2.16,<0.3.0` |
| LLM providers | OpenAI, Google Gemini, Groq, DeepSeek config | `openai`, `langchain-openai`, `langchain-google-genai`, `langchain-groq`; DeepSeek env config is present |
| PDF/rule parsing | MarkItDown, LlamaParse | `markitdown`, `llama-parse` |
| ML runtime | PyTorch, pytorch-tabnet, scikit-learn, NumPy, joblib | Used for major/career-group prediction |
| Fuzzy matching | thefuzz, python-Levenshtein | Normalizes and matches admissions entities |
| HTTP client | httpx, requests | Calls external services/data sources |
| Test/dev tools | pytest, pytest-asyncio, pytest-cov, black, flake8, mypy, isort | Included in the full requirements |

### 4.4 Legacy Frontend: `EducationAdvisor/frontend/`

This is a legacy scaffold and should only be edited when the task explicitly targets it. It uses Next.js `^14.0.0`, React `^18.2.0`, TypeScript `^5.3.0`, Axios `^1.6.0`, Zustand `^4.4.0`, ESLint, and `eslint-config-next`.

### 4.5 Infrastructure and External Data

| Component | Role |
|-----------|------|
| SQLite | Stores web backend data: users, reset tokens, profiles, personality results, reviews, Q&A conversations/messages, and admission favorites |
| Redis | Multi-layer cache for Q&A, admissions catalog, conversations/messages, and AI sidecar Q&A |
| MongoDB | Async database for the AI sidecar, used by FastAPI through Motor/PyMongo |
| ChromaDB | Vector database for retrieval/RAG |
| PostgreSQL | Present in the legacy/standalone `EducationAdvisor/docker-compose.yml`; it is not the main database for the root Express stack |
| Docker Compose | Standalone stack in `EducationAdvisor/docker-compose.yml`: legacy frontend, FastAPI backend, PostgreSQL, Redis, Chroma |
| Admissions PDFs/Markdown | Admissions-rule data in `EducationAdvisor/backend/data/raw_pdfs` and `processed_rules` |

## 5. Main Features

### 5.1 Authentication and Authorization

The Express backend provides registration, login, forgot password, reset password, change password, and current-user retrieval. Authentication uses a Bearer token stored in frontend `localStorage`; an Axios interceptor attaches the token to requests, and the Express `createAuthenticateToken` middleware verifies the JWT. Admin authorization uses the `user`, `admin`, and `superadmin` roles; user-management admin APIs require `superadmin`.

### 5.2 Student Profiles

Users can create and update personal profiles containing full name, phone number, gender, date of birth, province/city, school, grade 10/11/12 scores, transcripts, certificates, favorite subjects, target majors/schools, and a self-description. Data is stored in the SQLite `student_profile` table.

### 5.3 Personality Test

The frontend provides a personality-test flow. The backend stores submissions in `personality_submission` and returns questions, the latest result, and history. The `latest` endpoint is used as AI/prediction context; adding history does not change the purpose of the latest-result endpoint.

### 5.4 Profile Review

The review module combines the student profile, personality result, and admissions/AI data to generate an overview score, summary, and recommendations. Results are stored in the `review_result` table.

### 5.5 Admissions Q&A

The Q&A module manages conversations, messages, and question-answering requests. Express stores conversations/messages in SQLite, gathers profile/personality/review context, uses Redis/memory cache, and calls the FastAPI sidecar through `/api/ai/qa/ask`. The FastAPI sidecar uses LangGraph/tools to look up admissions rules and historical benchmark scores, then returns context-aware answers.

### 5.6 Admissions Catalog and Favorites

The admissions module lets users fetch the admissions catalog and add, remove, or view favorite options. Express uses `AdmissionService`, `SQLiteAdmissionCartRepository`, the AI admissions client, and catalog cache.

## 6. Database and Main Schema

The web backend uses SQLite through `better-sqlite3`. The default database file is `backend/data/educationadvisor-web.sqlite`, and it can be changed with `SQLITE_DB_PATH`. The schema is created/migrated when the backend starts in `backend/src/config/database.ts`.

Main tables:

| Table | Role |
|------|------|
| `user` | Accounts, password hash, role, status, token version, soft delete |
| `password_reset_token` | Password-reset token, hash, expiration, used status |
| `student_profile` | Student profiles |
| `personality_submission` | MBTI test history |
| `admission_cart_item` | Favorite admissions options |
| `review_result` | Profile review results |
| `qa_conversation` | Q&A conversations |
| `qa_message` | User/assistant Q&A messages |

The AI sidecar uses MongoDB through Motor/PyMongo for AI data, ChromaDB for vector retrieval, and Redis for cache.

## 7. Cache and Observability

The project includes cache layers in both the Express backend and the AI sidecar.

In the Express backend, `backend/src/cache-store.ts` creates `RedisBackedCacheStore`. When Redis is available, data is stored in Redis with TTL; when Redis fails, the cache falls back to an in-memory map inside the Node.js process. Main cache namespaces include Q&A answers, Q&A conversations, Q&A messages, and the admissions catalog.

In the AI sidecar, `app/ai/qa_service.py` uses `QAResponseCache` on Redis for Q&A answers. If cache is disabled or Redis fails during bootstrap/runtime, the service switches to disabled/no-op cache so the answer flow continues working.

The Express backend includes request observability middleware and exposes `/api/metrics` when `METRICS_ENABLED=true`.

## 8. Development Commands

### 8.1 Main Frontend (`frontend/`)

| Command | Description |
|---------|-------------|
| `npm install` | Install frontend dependencies |
| `npm run dev` | Run the Next.js dev server |
| `npm run build` | Build the production frontend |
| `npm run start` | Run the Next.js production server after build |
| `npm run lint` | Run ESLint |
| `npm run test:e2e` | Run Playwright E2E tests |

### 8.2 Express Backend (`backend/`)

| Command | Description |
|---------|-------------|
| `npm install` | Install backend dependencies |
| `npm run dev` | Run the full dev stack with orchestration for the FastAPI sidecar and Express |
| `npm run dev:lite` | Run the dev stack with lightweight AI dependencies |
| `npm run dev:api` | Run only the Express API with nodemon |
| `npm run build` | Build TypeScript into `dist/` |
| `npm test` | Remove `dist`, build, then run the Node test runner on `dist/**/*.test.js` |
| `npm run start` | Run `ts-node src/server.ts` |

### 8.3 AI Sidecar (`EducationAdvisor/backend/`)

| Command | Description |
|---------|-------------|
| `pip install -r requirements.txt` | Install the full AI sidecar dependencies |
| `pip install -r requirements.dev-lite.txt` | Install the lightweight profile for web/dev integration |
| `uvicorn app.main:app --reload --port 8000` | Run the FastAPI sidecar directly |
| `pytest` | Run Python tests |
| `pytest tests/test_internal_ai_qa_route.py -q` | Run only the internal Q&A route test |

## 9. Recommended Local Workflow

1. Install dependencies for the main frontend:

```powershell
cd frontend
npm install
```

2. Install dependencies for the Express backend:

```powershell
cd backend
npm install
```

3. Install AI sidecar dependencies. If you only need the lightweight profile for web integration:

```powershell
cd EducationAdvisor/backend
pip install -r requirements.dev-lite.txt
```

Or install the full set for RAG/PDF/vector DB/dev tools:

```powershell
cd EducationAdvisor/backend
pip install -r requirements.txt
```

4. Prepare environment files from the corresponding `.env.example` files.

5. Run the full backend stack from `backend/`:

```powershell
npm run dev
```

6. Run the frontend from `frontend/`:

```powershell
npm run dev
```

By default, the frontend runs at `http://localhost:3000`, the Express API at `http://localhost:5001`, and the AI sidecar at `http://localhost:8000`.

## 10. Testing and Code Quality

| Area | Tool | Command |
|------|------|---------|
| Frontend | ESLint | `cd frontend && npm run lint` |
| Frontend | Playwright E2E | `cd frontend && npm run test:e2e` |
| Express backend | TypeScript compiler | `cd backend && npm run build` |
| Express backend | Node test runner + Supertest | `cd backend && npm test` |
| AI sidecar | pytest | `cd EducationAdvisor/backend && pytest` |
| AI sidecar | black/flake8/mypy/isort | Included in `requirements.txt`; run as needed for code quality |

## 11. Deployment/Infrastructure Notes

`EducationAdvisor/docker-compose.yml` describes a standalone stack that includes the legacy frontend, FastAPI backend, PostgreSQL, Redis, and Chroma. However, according to the repository's current guidance, the main development stack uses the root `frontend/`, the root Express `backend/` with SQLite, and the AI sidecar `EducationAdvisor/backend/`. Therefore, when deploying or running locally, distinguish clearly between `backend/` as the Express web backend and `EducationAdvisor/backend/` as the FastAPI AI backend.

If the internal API key is enabled for the AI sidecar, set the same value in both places:

```text
EducationAdvisor/backend/.env: INTERNAL_API_KEY=<secret>
backend/.env: AI_SERVICE_API_KEY=<secret>
```

FastAPI checks the `X-Internal-Api-Key` header at the `/api/ai/qa/ask` endpoint when `INTERNAL_API_KEY` is not empty.

<!-- AUTO-GENERATED:END -->
