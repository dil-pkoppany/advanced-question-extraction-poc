# Question Extraction Testing Framework

A POC testing framework for comparing different approaches to extract questions from Excel files using LLMs.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    React Frontend (Vite)                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │  Upload  │→│ Approach │→│ Configure│→│ Results  │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    FastAPI Backend                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                   3 Approaches                       │   │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐         │   │
│  │  │ Auto LLM  │ │  Guided   │ │  Judge    │         │   │
│  │  │(Approach 1)│ │(Approach 2)│ │(Approach 3)│         │   │
│  │  └───────────┘ └───────────┘ └───────────┘         │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Structured Output                           │
│  output/runs/     output/comparisons/    output/benchmarks/ │
└─────────────────────────────────────────────────────────────┘
```

## Three Extraction Approaches

| Approach | Method | User Input | Speed | Use Case |
|----------|--------|------------|-------|----------|
| **1. Auto LLM** | MarkItDown → LLM | None | Slow | Quick analysis |
| **2. Guided** | User maps columns → LLM with context | Column mappings | Medium | Better accuracy |
| **3. Judge** | Deterministic parse → LLM confidence | Column mappings | Fast | Validation |

## Quick Start

### Backend Setup

```bash
cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure AWS (for Bedrock)
export AWS_PROFILE=your-profile
export AWS_REGION=us-west-2

# Run server
uvicorn app.main:app --reload --port 8000
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Run dev server
npm run dev
```

Open http://localhost:5173

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/upload/` | Upload Excel file |
| GET | `/api/upload/{file_id}` | Get file metadata |
| POST | `/api/extract/` | Run extraction |
| GET | `/api/extract/runs` | List all runs |
| GET | `/api/extract/runs/{run_id}` | Get run details |
| GET | `/api/comparisons/` | List comparisons |
| GET | `/api/comparisons/{id}` | Get comparison |

## Configuration

Environment variables (prefix with `QE_`):

```bash
# AWS
QE_AWS_REGION=us-west-2
QE_BEDROCK_MODEL_ID=arn:aws:bedrock:...

# LLM Settings
QE_MAX_TOKENS=8192
QE_TEMPERATURE=0.1

# Judge model (smaller/faster)
QE_BEDROCK_JUDGE_MODEL_ID=arn:aws:bedrock:...claude-3-haiku...
QE_JUDGE_MAX_TOKENS=1024

# Confidence threshold for Approach 3
QE_CONFIDENCE_THRESHOLD=0.7
```

## Output Structure

```
output/
├── runs/
│   └── run_20260125_143022_abc123/
│       ├── metadata.json
│       ├── approach_1_result.json
│       ├── approach_2_result.json
│       ├── approach_3_result.json
│       └── comparison.json
├── comparisons/
│   └── cmp_20260125_143022.json
└── benchmarks/
    └── benchmark_20260125.json
```

## Comparison Metrics

| Metric | Description | Approaches |
|--------|-------------|------------|
| `extraction_count` | Total questions extracted | All |
| `expected_count` | Row count from columns | 2, 3 |
| `accuracy` | extracted / expected | 2, 3 |
| `llm_time_ms` | LLM call duration | 1, 2 |
| `avg_confidence` | Mean judge confidence | 3 |
| `low_confidence_count` | Items below threshold | 3 |

## Optional: DeepEval Integration

For advanced LLM output quality evaluation:

```bash
pip install deepeval>=3.8.0
```

Provides metrics:
- **AnswerRelevancy**: Are extracted questions relevant?
- **Faithfulness**: Does extraction match source?
- **Question Completeness**: Custom metric for validation

## Development

### Run Tests

```bash
cd backend
pytest tests/ -v
```

### Project Structure

```
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app
│   │   ├── config.py            # Settings
│   │   ├── routes/              # API endpoints
│   │   ├── services/            # Extraction logic
│   │   ├── evaluation/          # Metrics & comparison
│   │   └── schemas/             # Pydantic models
│   ├── tests/
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/Wizard/   # Wizard steps
│   │   ├── api/                 # API client
│   │   └── types/               # TypeScript types
│   └── package.json
├── output/                      # Results storage
└── docs/                        # Test Excel files
```

## License

Internal POC - Swift Survey Development Team
