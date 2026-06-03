# Tổng quan dự án Education Advisor

<!-- AUTO-GENERATED:START -->

Tài liệu này tổng hợp kiến trúc, module chức năng, công nghệ sử dụng, lệnh phát triển và cấu hình môi trường của dự án `Education Advisor`. Nội dung được đối chiếu từ các nguồn sự thật trong mã nguồn hiện tại như `CLAUDE.md`, `frontend/package.json`, `backend/package.json`, `EducationAdvisor/backend/requirements*.txt`, các file route trong `backend/src/routes/*`, `EducationAdvisor/backend/app/api/routes/*`, `.env.example` và cấu hình khởi động ứng dụng.

## 1. Mục tiêu hệ thống

`Education Advisor` là hệ thống tư vấn tuyển sinh và định hướng học tập/nghề nghiệp. Dự án kết hợp một ứng dụng web Next.js, một API web Express/TypeScript dùng SQLite để quản lý người dùng và dữ liệu nghiệp vụ, cùng một AI sidecar FastAPI/LangGraph xử lý tư vấn tuyển sinh, hỏi đáp Q&A, tìm kiếm quy chế/điểm chuẩn và dự đoán nhóm ngành/nghề nghiệp. Người dùng có thể đăng ký/đăng nhập, tạo hồ sơ học sinh, làm bài kiểm tra tính cách MBTI, xem đánh giá hồ sơ, hỏi đáp tuyển sinh, tra cứu danh mục tuyển sinh và lưu các lựa chọn yêu thích.

## 2. Cấu trúc repository

```text
D:\Education_Advisor
├── frontend/                    # Frontend chính: Next.js 15 App Router
├── backend/                     # Backend web chính: Express + TypeScript + SQLite
└── EducationAdvisor/
    ├── backend/                 # AI sidecar: FastAPI + LangGraph + ML/RAG
    ├── frontend/                # Frontend cũ: Next.js 14 scaffold
    └── docker-compose.yml       # Docker Compose cho stack standalone/cũ
```

Stack đang hoạt động của dự án gồm frontend chính ở `frontend/`, web backend Express ở `backend/` và AI backend FastAPI ở `EducationAdvisor/backend/`. Phần `EducationAdvisor/frontend/` là scaffold cũ, chỉ nên dùng khi có yêu cầu rõ ràng.

## 3. Kiến trúc tổng thể

Hệ thống được chia thành ba lớp chính:

1. **Frontend chính (`frontend/`)**: giao diện người dùng Next.js 15 App Router, gọi API Express thông qua Axios client và route constants.
2. **Web backend (`backend/`)**: Express API viết bằng TypeScript, lưu dữ liệu nghiệp vụ vào SQLite, xác thực JWT, phân quyền, cache Redis có fallback bộ nhớ và làm cầu nối tới AI sidecar.
3. **AI sidecar (`EducationAdvisor/backend/`)**: FastAPI service dùng LangGraph/LangChain, công cụ tra cứu quy chế tuyển sinh, điểm chuẩn lịch sử, MongoDB/Chroma/Redis và các thành phần ML để phục vụ tư vấn AI.

Luồng chính của các nghiệp vụ không-AI:

```text
Next.js page
  -> frontend/src/hooks/*
  -> frontend/src/services/*
  -> frontend/src/config/axios.ts
  -> Express route/controller/service/repository
  -> SQLite
```

Luồng Q&A/tư vấn AI:

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

Luồng đánh giá hồ sơ và tuyển sinh:

```text
Frontend profile/personality/review/admissions pages
  -> Express review/admission services
  -> SQLite repositories + cache
  -> AI clients gọi FastAPI /api/v1/admissions/search, /api/v1/predict-fast hoặc /api/v1/advisor
```

## 4. Công nghệ sử dụng

### 4.1 Frontend chính: `frontend/`

| Nhóm | Công nghệ | Phiên bản/ghi chú |
|------|-----------|-------------------|
| Framework UI | Next.js | `15.5.9`, App Router |
| Runtime UI | React, React DOM | `18.3.1` |
| Ngôn ngữ | TypeScript | `^5.9.3` |
| Styling | Tailwind CSS | `^3.4.1`, PostCSS, Autoprefixer |
| Data fetching/cache client | TanStack React Query | `^5.90.16` |
| State management | Jotai | `^2.16.1` |
| HTTP client | Axios | `^1.13.2` |
| E2E test | Playwright | `@playwright/test ^1.53.0` |
| Lint | ESLint + eslint-config-next | ESLint `8.57.0`, Next config `15.5.9` |
| Build/dev | npm scripts | `dev`, `build`, `start`, `lint`, `test:e2e` |

### 4.2 Web backend chính: `backend/`

| Nhóm | Công nghệ | Phiên bản/ghi chú |
|------|-----------|-------------------|
| Runtime/API | Node.js + Express | Express `^4.21.2` |
| Ngôn ngữ | TypeScript | `^5.9.3` |
| Dev runtime | ts-node, nodemon | `ts-node ^10.9.2`, `nodemon ^3.1.11` |
| Database cục bộ | SQLite | `better-sqlite3 ^12.5.0`, `sqlite3 ^5.1.7` |
| Cache | Redis | Node Redis client `^4.7.0`, có fallback in-memory |
| Auth | JWT + bcryptjs | `jsonwebtoken ^9.0.3`, `bcryptjs ^2.4.3` |
| CORS/env | cors, dotenv | `cors ^2.8.5`, `dotenv ^17.2.3` |
| ID tiện ích | uuid | `^13.0.0` |
| Test | Node test runner + Supertest | `supertest ^7.1.1`; tests chạy từ `dist/**/*.test.js` |
| Observability | Custom middleware | request logging và `/api/metrics` khi bật `METRICS_ENABLED` |

Backend này tuân theo layering rõ ràng:

```text
routes -> controllers -> services -> repositories -> models/database
```

Các module nghiệp vụ chính:

| Module | File/chức năng tiêu biểu |
|--------|--------------------------|
| Auth | `auth.routes.ts`, `auth.controller.ts`, `auth.service.ts`, JWT Bearer token, reset password |
| Admin user | Quản trị người dùng, role/status, yêu cầu `superadmin` |
| Student profile | Hồ sơ học sinh, điểm học tập, sở thích, mục tiêu ngành/trường |
| Personality | Bộ câu hỏi MBTI, submit kết quả, latest, history |
| Review | Chạy đánh giá hồ sơ, lưu kết quả đánh giá |
| Q&A | Hội thoại, tin nhắn, hỏi đáp AI, advise |
| Admissions | Danh mục tuyển sinh, danh sách yêu thích |
| Cache | Redis-backed cache với fallback memory trong `cache-store.ts` |
| Metrics | `/api/metrics`, request metrics store |

### 4.3 AI sidecar: `EducationAdvisor/backend/`

| Nhóm | Công nghệ | Phiên bản/ghi chú |
|------|-----------|-------------------|
| API framework | FastAPI | `0.110.0` |
| ASGI server | Uvicorn | `uvicorn[standard] 0.29.0` |
| Ngôn ngữ | Python | Theo môi trường cài đặt, package qua `requirements.txt` |
| Validation/config | Pydantic, pydantic-settings | `pydantic 2.7.4`, `pydantic-settings 2.3.4` |
| Database async | MongoDB | `pymongo`, `motor` |
| Cache | Redis | `redis 5.0.4`, Q&A cache namespace/TTL |
| Vector database | ChromaDB | `chromadb 0.5.0`, `langchain-chroma` |
| AI orchestration | LangChain, LangGraph | LangChain `0.2.x`, LangGraph `>=0.2.16,<0.3.0` |
| LLM providers | OpenAI, Google Gemini, Groq, DeepSeek config | `openai`, `langchain-openai`, `langchain-google-genai`, `langchain-groq`; DeepSeek env có trong config |
| PDF/rule parsing | MarkItDown, LlamaParse | `markitdown`, `llama-parse` |
| ML runtime | PyTorch, pytorch-tabnet, scikit-learn, NumPy, joblib | phục vụ dự đoán nhóm nghề/ngành |
| Fuzzy matching | thefuzz, python-Levenshtein | Chuẩn hóa/khớp thực thể tuyển sinh |
| HTTP client | httpx, requests | Gọi dịch vụ/nguồn dữ liệu ngoài |
| Test/dev tools | pytest, pytest-asyncio, pytest-cov, black, flake8, mypy, isort | Có trong requirements đầy đủ |

### 4.4 Frontend cũ: `EducationAdvisor/frontend/`

Đây là scaffold cũ, chỉ nên chỉnh sửa khi tác vụ chỉ rõ. Công nghệ gồm Next.js `^14.0.0`, React `^18.2.0`, TypeScript `^5.3.0`, Axios `^1.6.0`, Zustand `^4.4.0`, ESLint và `eslint-config-next`.

### 4.5 Hạ tầng và dữ liệu ngoài

| Thành phần | Vai trò |
|------------|---------|
| SQLite | Lưu dữ liệu web backend: user, reset token, profile, personality, review, Q&A conversation/message, admission favorites |
| Redis | Cache đa lớp cho Q&A, admissions catalog, conversations/messages, AI sidecar Q&A |
| MongoDB | Database async cho AI sidecar, dùng bởi FastAPI qua Motor/PyMongo |
| ChromaDB | Vector database phục vụ retrieval/RAG |
| PostgreSQL | Có trong `EducationAdvisor/docker-compose.yml` cũ/standalone, không phải database chính của root Express stack |
| Docker Compose | Stack standalone trong `EducationAdvisor/docker-compose.yml`: frontend cũ, FastAPI backend, PostgreSQL, Redis, Chroma |
| PDF/Markdown tuyển sinh | Dữ liệu quy chế tuyển sinh trong `EducationAdvisor/backend/data/raw_pdfs` và `processed_rules` |

## 5. Chức năng chính

### 5.1 Xác thực và phân quyền

Backend Express cung cấp đăng ký, đăng nhập, quên mật khẩu, đặt lại mật khẩu, đổi mật khẩu và lấy thông tin người dùng hiện tại. Xác thực dùng Bearer token trong `localStorage` phía frontend, Axios interceptor gắn token vào request, Express middleware `createAuthenticateToken` xác minh JWT. Phân quyền quản trị dùng role `user`, `admin`, `superadmin`; các API quản trị người dùng yêu cầu `superadmin`.

### 5.2 Hồ sơ học sinh

Người dùng có thể tạo/cập nhật hồ sơ cá nhân gồm họ tên, điện thoại, giới tính, ngày sinh, tỉnh/thành, trường, điểm lớp 10/11/12, học bạ, chứng chỉ, môn yêu thích, ngành/trường mục tiêu và mô tả bản thân. Dữ liệu lưu trong bảng SQLite `student_profile`.

### 5.3 Kiểm tra tính cách

Frontend cung cấp luồng bài test tính cách, backend lưu các lần nộp trong `personality_submission`, trả về câu hỏi, kết quả mới nhất và lịch sử. Endpoint `latest` được dùng làm ngữ cảnh AI/dự đoán; khi thêm lịch sử không làm thay đổi mục đích của endpoint latest.

### 5.4 Đánh giá hồ sơ

Module review tổng hợp hồ sơ học sinh, kết quả tính cách và dữ liệu tuyển sinh/AI để tạo điểm tổng quan, tóm tắt và khuyến nghị. Kết quả lưu trong bảng `review_result`.

### 5.5 Q&A tuyển sinh

Module Q&A quản lý danh sách hội thoại, tin nhắn và request hỏi đáp. Express lưu conversation/message trong SQLite, lấy ngữ cảnh hồ sơ/tính cách/review, dùng cache Redis/memory và gọi FastAPI sidecar qua `/api/ai/qa/ask`. FastAPI sidecar dùng LangGraph/tools để tra cứu quy chế tuyển sinh, điểm chuẩn lịch sử và trả lời theo ngữ cảnh.

### 5.6 Danh mục tuyển sinh và yêu thích

Module admissions cho phép lấy catalog tuyển sinh, thêm/xóa/xem danh sách yêu thích. Express dùng `AdmissionService`, `SQLiteAdmissionCartRepository`, AI admissions client và cache catalog.


## 6. Database và schema chính

Web backend dùng SQLite qua `better-sqlite3`. File mặc định là `backend/data/educationadvisor-web.sqlite`, có thể đổi bằng `SQLITE_DB_PATH`. Schema được tạo/migrate khi backend khởi động trong `backend/src/config/database.ts`.

Các bảng chính:

| Bảng | Vai trò |
|------|---------|
| `user` | Tài khoản, mật khẩu hash, role, trạng thái, token version, soft-delete |
| `password_reset_token` | Token đặt lại mật khẩu, hash, hạn dùng, trạng thái đã dùng |
| `student_profile` | Hồ sơ học sinh |
| `personality_submission` | Lịch sử bài test MBTI |
| `admission_cart_item` | Các lựa chọn tuyển sinh yêu thích |
| `review_result` | Kết quả đánh giá hồ sơ |
| `qa_conversation` | Hội thoại Q&A |
| `qa_message` | Tin nhắn user/assistant trong Q&A |

AI sidecar dùng MongoDB qua Motor/PyMongo cho các phần dữ liệu AI, ChromaDB cho vector retrieval và Redis cho cache.

## 7. Cache và quan sát hệ thống

Dự án có cache ở cả Express backend và AI sidecar.

Ở Express backend, `backend/src/cache-store.ts` tạo `RedisBackedCacheStore`. Khi Redis khả dụng, dữ liệu được lưu bằng Redis với TTL; khi Redis lỗi, cache fallback về in-memory map trong tiến trình Node.js. Các namespace cache chính gồm Q&A answer, Q&A conversations, Q&A messages và admissions catalog.

Ở AI sidecar, `app/ai/qa_service.py` dùng `QAResponseCache` trên Redis cho câu trả lời Q&A. Nếu cache bị tắt hoặc Redis bootstrap/runtime lỗi, service chuyển sang cache disabled/noop để không làm hỏng luồng trả lời.

Express backend có request observability middleware và endpoint `/api/metrics` khi `METRICS_ENABLED=true`.

## 8. Lệnh phát triển

### 8.1 Frontend chính (`frontend/`)

| Command | Mô tả |
|---------|-------|
| `npm install` | Cài dependencies frontend |
| `npm run dev` | Chạy Next.js dev server |
| `npm run build` | Build production frontend |
| `npm run start` | Chạy Next.js production server sau khi build |
| `npm run lint` | Chạy ESLint |
| `npm run test:e2e` | Chạy Playwright E2E tests |

### 8.2 Express backend (`backend/`)

| Command | Mô tả |
|---------|-------|
| `npm install` | Cài dependencies backend |
| `npm run dev` | Chạy full dev stack, tự orchestration FastAPI sidecar + Express |
| `npm run dev:lite` | Chạy dev stack với AI lite dependencies |
| `npm run dev:api` | Chạy riêng Express API bằng nodemon |
| `npm run build` | Build TypeScript sang `dist/` |
| `npm test` | Xóa `dist`, build rồi chạy Node test runner trên `dist/**/*.test.js` |
| `npm run start` | Chạy `ts-node src/server.ts` |

### 8.3 AI sidecar (`EducationAdvisor/backend/`)

| Command | Mô tả |
|---------|-------|
| `pip install -r requirements.txt` | Cài đầy đủ dependencies AI sidecar |
| `pip install -r requirements.dev-lite.txt` | Cài profile nhẹ cho tích hợp web/dev |
| `uvicorn app.main:app --reload --port 8000` | Chạy FastAPI sidecar trực tiếp |
| `pytest` | Chạy test Python |
| `pytest tests/test_internal_ai_qa_route.py -q` | Chạy riêng test route Q&A nội bộ |


## 9. Quy trình chạy local đề xuất

1. Cài dependencies cho frontend chính:

```powershell
cd frontend
npm install
```

2. Cài dependencies cho Express backend:

```powershell
cd backend
npm install
```

3. Cài dependencies AI sidecar. Nếu chỉ cần profile nhẹ để tích hợp web:

```powershell
cd EducationAdvisor/backend
pip install -r requirements.dev-lite.txt
```

Hoặc cài đầy đủ để dùng RAG/PDF/vector DB/dev tools:

```powershell
cd EducationAdvisor/backend
pip install -r requirements.txt
```

4. Chuẩn bị file môi trường từ các `.env.example` tương ứng.

5. Chạy backend full stack từ `backend/`:

```powershell
npm run dev
```

6. Chạy frontend từ `frontend/`:

```powershell
npm run dev
```

Mặc định frontend chạy ở `http://localhost:3000`, Express API ở `http://localhost:5001`, AI sidecar ở `http://localhost:8000`.

## 10. Kiểm thử và chất lượng mã

| Khu vực | Công cụ | Lệnh |
|---------|---------|------|
| Frontend | ESLint | `cd frontend && npm run lint` |
| Frontend | Playwright E2E | `cd frontend && npm run test:e2e` |
| Express backend | TypeScript compiler | `cd backend && npm run build` |
| Express backend | Node test runner + Supertest | `cd backend && npm test` |
| AI sidecar | pytest | `cd EducationAdvisor/backend && pytest` |
| AI sidecar | black/flake8/mypy/isort | Có trong `requirements.txt`, chạy theo nhu cầu chất lượng mã |

## 11. Ghi chú triển khai/hạ tầng

`EducationAdvisor/docker-compose.yml` mô tả stack standalone gồm frontend cũ, FastAPI backend, PostgreSQL, Redis và Chroma. Tuy nhiên theo hướng dẫn hiện hành của repo, stack đang phát triển chính dùng frontend root `frontend/`, Express root `backend/` với SQLite và AI sidecar `EducationAdvisor/backend/`. Vì vậy khi triển khai hoặc chạy local cần phân biệt rõ `backend/` là web backend Express, còn `EducationAdvisor/backend/` là AI backend FastAPI.

Nếu bật internal API key cho AI sidecar, đặt cùng giá trị ở hai nơi:

```text
EducationAdvisor/backend/.env: INTERNAL_API_KEY=<secret>
backend/.env: AI_SERVICE_API_KEY=<secret>
```

FastAPI sẽ kiểm tra header `X-Internal-Api-Key` tại endpoint `/api/ai/qa/ask` khi `INTERNAL_API_KEY` không rỗng.


<!-- AUTO-GENERATED:END -->
