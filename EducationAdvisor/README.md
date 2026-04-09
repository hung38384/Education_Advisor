# AI-Powered University Admission & Study Planner

An enterprise-grade full-stack web application combining modern frontend technologies with advanced AI capabilities for university admission guidance and study planning.

## Tech Stack

### Frontend
- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **State Management**: Zustand/Redux
- **Styling**: CSS Modules / Tailwind CSS
- **HTTP Client**: Axios / Fetch API

### Backend
- **Framework**: FastAPI
- **AI/LLM Orchestration**: LangGraph
- **Database**: MongoDB / PostgreSQL
- **Vector DB**: Chroma / Pinecone
- **Task Queue**: Celery (optional)

## Project Structure

```
root/
├── frontend/                  # Next.js Frontend
│   ├── src/
│   │   ├── app/              # Next.js App Router
│   │   ├── components/       # Reusable UI Components
│   │   ├── lib/              # Utilities
│   │   ├── services/         # API Client Services
│   │   ├── types/            # TypeScript Interfaces
│   │   └── store/            # Global State Management
│   └── package.json
│
└── backend/                  # FastAPI + LangGraph
    ├── app/
    │   ├── main.py           # FastAPI Entry Point
    │   ├── api/routes/       # API Endpoints
    │   ├── core/             # Config & Security
    │   ├── schemas/          # Pydantic Models
    │   ├── db/               # Database Logic
    │   └── ai/               # AI & LangGraph Module
    ├── data/                 # Data Storage
    ├── scripts/              # Utility Scripts
    ├── tests/                # Test Suite
    └── requirements.txt
```

## Quick Start

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Features (Planned)

- Student profile & achievement analysis
- University recommendations based on AI profiling
- Study plan generation and optimization
- Personalized counseling agent
- RAG-based knowledge retrieval
- Course recommendations

## Contributing

Please follow the git workflow and code standards defined in the project documentation.

## License

Proprietary - All rights reserved
