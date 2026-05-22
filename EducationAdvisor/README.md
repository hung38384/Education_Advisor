# AI-Powered University Admission Planner

Repo này là một ứng dụng tư vấn tuyển sinh đại học dùng FastAPI, MongoDB,
LangGraph/LangChain, Google Gemini/Groq và ChromaDB. Backend hiện là phần chính
của dự án; frontend mới có cấu hình Next.js ban đầu trong `frontend/package.json`.

## Giới thiệu repo

`AI-Powered University Admission Planner` được xây dựng để hỗ trợ học sinh tra cứu
thông tin tuyển sinh, phân tích hồ sơ cá nhân và nhận gợi ý định hướng ngành/trường
dựa trên dữ liệu đề án tuyển sinh, điểm chuẩn lịch sử và workflow AI AGENTS.

Repo tập trung vào ba năng lực chính:

- Chuẩn hóa dữ liệu tuyển sinh: crawl điểm chuẩn, ingest PDF đề án tuyển sinh,
  clean nội dung Markdown bằng Gemini và xây dựng vector database bằng Chroma.
- Truy vấn và tư vấn bằng AI: workflow LangGraph phối hợp nhiều node/agent để hiểu
  yêu cầu người dùng, tra cứu quy định tuyển sinh, lấy điểm chuẩn lịch sử và tạo
  câu trả lời theo ngữ cảnh.
- Gợi ý định hướng cá nhân: module ML recommender dùng TabNet để hỗ trợ phân tích
  hồ sơ và đề xuất hướng ngành/nghề phù hợp.

Về mặt kỹ thuật, backend là trung tâm của hệ thống. FastAPI chịu trách nhiệm khởi
tạo API và kết nối MongoDB, các script trong `backend/scripts/` xử lý dữ liệu đầu
vào, còn các module trong `backend/app/ai/` triển khai RAG, LLM tools, workflow
multi-agent và recommender. Frontend Next.js hiện mới ở mức cấu hình ban đầu, vì
vậy cách chạy chính trong repo hiện tại là chạy backend và các pipeline dữ liệu
trực tiếp.

## Nội dung chính

- Backend FastAPI chạy tại `backend/app/main.py`.
- Kết nối MongoDB bằng Motor/PyMongo.
- Multi-agent workflow dùng LangGraph tại `backend/app/ai/graph/workflow.py`.
- RAG/vector search dùng Chroma và Google Generative AI Embeddings.
- Pipeline xử lý PDF đề án tuyển sinh sang Markdown.
- ML recommender dùng TabNet tại `backend/app/ai/ml/`.
- Frontend Next.js đang ở trạng thái scaffold tối thiểu.

## Cấu trúc thư mục

```text
.
├── backend/
│   ├── app/
│   │   ├── main.py                    # FastAPI entrypoint
│   │   ├── core/                      # Config, constants
│   │   ├── db/                        # MongoDB connection
│   │   ├── schemas/                   # Pydantic schemas
│   │   ├── utils/                     # Taxonomy/fuzzy matching
│   │   └── ai/
│   │       ├── graph/                 # LangGraph workflow
│   │       ├── nodes/                 # Agent nodes
│   │       ├── prompts/               # System prompts
│   │       ├── tools/                 # RAG/database tools
│   │       ├── ml/                    # TabNet recommender
│   │       └── university_registry.py
│   ├── data/
│   │   ├── raw_pdfs/                  # PDF đề án tuyển sinh
│   │   ├── processed_rules/           # Markdown sau xử lý
│   │   └── chroma_db/                 # Vector DB local nếu đã build
│   ├── scripts/                       # Script crawl, ingest, clean, build vector DB
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   └── package.json
├── docker-compose.yml
└── README.md
```

## Yêu cầu môi trường

- Python 3.10+ hoặc 3.11.
- Node.js 18+ nếu chạy frontend.
- MongoDB local hoặc MongoDB URI từ dịch vụ bên ngoài.
- API key tùy tính năng:
  - `GOOGLE_API_KEY`: embedding, clean rules bằng Gemini.
  - `GEMINI_API_KEY`: workflow hiện đang đọc biến này cho `ChatGoogleGenerativeAI`.
  - `GROQ_API_KEY`: fallback/LLM nhanh trong workflow.
  - `LLAMA_CLOUD_API_KEY`: parser bảng PDF qua LlamaParse, không bắt buộc nhưng nên có.

## Cài đặt backend

Chạy các lệnh từ thư mục gốc repo:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Nếu dùng Command Prompt thay vì PowerShell:

```bat
cd backend
python -m venv .venv
.venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Nếu dùng macOS/Linux:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

## Cấu hình biến môi trường

Tạo file `.env` trong thư mục `backend` từ file mẫu:

```powershell
cd backend
Copy-Item .env.example .env
```

Các biến quan trọng:

```env
ENVIRONMENT=development
DEBUG=True

MONGODB_URL=mongodb://localhost:27017
MONGODB_DB_NAME=admission_planner_db

REDIS_URL=redis://localhost:6379
CHROMA_HOST=localhost
CHROMA_PORT=8001

GOOGLE_API_KEY=your-google-api-key
GEMINI_API_KEY=your-google-api-key
GROQ_API_KEY=your-groq-api-key
LLAMA_CLOUD_API_KEY=your-llama-cloud-api-key

SECRET_KEY=change-this-secret
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
LOG_LEVEL=INFO
```

Lưu ý: `.env.example` hiện có `DB_NAME`, nhưng code đang dùng
`MONGODB_DB_NAME`. Nên dùng `MONGODB_DB_NAME` trong `.env`.

## Chạy MongoDB

Backend sẽ ping MongoDB khi khởi động, nên cần có MongoDB chạy trước.

Nếu đã cài MongoDB trên máy, chạy service MongoDB theo cách của hệ điều hành.

Nếu muốn chạy MongoDB bằng Docker:

```powershell
docker run --name admission_planner_mongo -p 27017:27017 -d mongo:7
```

Sau đó giữ cấu hình:

```env
MONGODB_URL=mongodb://localhost:27017
MONGODB_DB_NAME=admission_planner_db
```

## Chạy backend API

Từ thư mục `backend`, sau khi đã activate virtual environment:

```powershell
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Hoặc:

```powershell
python -m app.main
```

Kiểm tra API:

- Health check: `http://localhost:8000/health`
- Swagger UI: `http://localhost:8000/api/docs`
- OpenAPI JSON: `http://localhost:8000/api/openapi.json`

Nếu backend lỗi lúc startup với MongoDB, kiểm tra lại `MONGODB_URL`,
`MONGODB_DB_NAME` và đảm bảo MongoDB đang chạy.

## Chạy frontend

Frontend hiện chỉ có `package.json`, chưa có thư mục source Next.js như
`app/`, `pages/` hoặc `src/`. Nếu bổ sung source frontend, có thể chạy:

```powershell
cd frontend
npm install
npm run dev
```

URL mặc định của Next.js là:

```text
http://localhost:3000
```

Các script frontend có sẵn:

```powershell
npm run dev
npm run build
npm run start
npm run lint
npm run type-check
```

## Chạy workflow AI trực tiếp

Có thể test workflow tuyển sinh không qua API:

```powershell
cd backend
python -m app.ai.graph.workflow --uni BKA
```

Đổi mã trường bằng tham số `--uni`, ví dụ:

```powershell
python -m app.ai.graph.workflow --uni TMU
```

Workflow cần các API key tương ứng trong `.env`, đặc biệt là `GEMINI_API_KEY`
và/hoặc `GROQ_API_KEY`.

## Pipeline dữ liệu tuyển sinh

### 1. Crawl dữ liệu điểm chuẩn

```powershell
cd backend
python scripts/crawl_tuyensinh247.py
```

Script này dùng MongoDB để lưu dữ liệu crawl được.

### 2. Ingest PDF sang Markdown

Đặt PDF vào:

```text
backend/data/raw_pdfs/
```

Chạy toàn bộ thư mục:

```powershell
cd backend
python scripts/ingest_pdf.py
```

Chạy một file hoặc glob cụ thể:

```powershell
python scripts/ingest_pdf.py --pdf "data/raw_pdfs/BKA_DeAn2024.pdf"
python scripts/ingest_pdf.py --pdf "data/raw_pdfs/*.pdf"
```

Kết quả được ghi vào:

```text
backend/data/processed_rules/
```

### 3. Clean Markdown bằng Gemini

Clean một file:

```powershell
cd backend
python scripts/clean_rules_llm.py --file BKA_DeAn2024.md
```

Ghi đè file clean đã tồn tại:

```powershell
python scripts/clean_rules_llm.py --file BKA_DeAn2024.md --force
```

Clean batch:

```powershell
python scripts/clean_rules_batch.py
```

Clean theo mã trường:

```powershell
python scripts/clean_rules_batch.py --pattern BKA
```

Dry run để xem danh sách file, không gọi Gemini:

```powershell
python scripts/clean_rules_batch.py --dry-run
```

### 4. Build Chroma vector database

Script này đọc các file `*_clean.md` trong `backend/data/processed_rules/`,
tạo embedding bằng Google Generative AI và ghi Chroma DB local.

```powershell
cd backend
python scripts/build_vector_db.py
```

Cần có:

```env
GOOGLE_API_KEY=your-google-api-key
```

## Test và kiểm tra chất lượng code

Chạy toàn bộ test Python:

```powershell
cd backend
pytest
```

Chạy một test file:

```powershell
pytest test_ml_integration.py
pytest scripts/test_api.py
```

Format code:

```powershell
black app scripts tests
isort app scripts tests
```

Lint/type-check:

```powershell
flake8 app scripts tests
mypy app
```

## Docker

Repo có `docker-compose.yml`, nhưng trạng thái hiện tại chưa chạy được ngay vì:

- `docker-compose.yml` tham chiếu `backend/Dockerfile` và `frontend/Dockerfile`,
  nhưng hai file này chưa tồn tại.
- Backend thực tế dùng MongoDB, trong khi compose hiện khai báo PostgreSQL,
  Redis và Chroma nhưng chưa khai báo MongoDB.
- Frontend chưa có source Next.js đầy đủ.

Vì vậy cách chạy khuyến nghị hiện tại là chạy local theo các bước ở trên.
Chỉ dùng Docker sau khi bổ sung Dockerfile và service MongoDB vào compose.

## Sự cố thường gặp

### Backend không khởi động vì MongoDB

Kiểm tra MongoDB đang chạy:

```powershell
docker ps
```

Hoặc kiểm tra lại `.env`:

```env
MONGODB_URL=mongodb://localhost:27017
MONGODB_DB_NAME=admission_planner_db
```

### Lỗi thiếu API key Gemini hoặc Google

Một số script dùng `GOOGLE_API_KEY`, trong khi workflow dùng `GEMINI_API_KEY`.
Để đơn giản, có thể đặt cả hai biến cùng một key Google AI Studio:

```env
GOOGLE_API_KEY=your-google-api-key
GEMINI_API_KEY=your-google-api-key
```

### Không tìm thấy dữ liệu RAG

Kiểm tra đã có file clean:

```text
backend/data/processed_rules/*_clean.md
```

Sau đó build lại vector DB:

```powershell
cd backend
python scripts/build_vector_db.py
```

### Frontend không chạy

Frontend hiện chưa có source Next.js đầy đủ. Cần bổ sung thư mục app/pages/src
trước khi `npm run dev` có thể chạy thành công.

## Tài liệu bổ sung

- `AGENTIC_WORKFLOW_DOCUMENTATION.md`: tài liệu chi tiết workflow multi-agent.
- `AGENTIC_WORKFLOW_DIAGRAMS.md`: sơ đồ workflow.
- `FIX_REPORT_IELTS_BONUS.md`: báo cáo fix logic IELTS bonus.

## License

Proprietary - All rights reserved.
