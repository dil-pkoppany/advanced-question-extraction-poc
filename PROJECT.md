# Project Technical Reference

## File Structure

```
advanced-question-extraction-poc/
├── README.md                          # Quick overview
├── PROJECT.md                         # This file
├── start.sh                           # Launch script (AWS SSO + servers)
│
├── backend/
│   ├── app/
│   │   ├── main.py                    # FastAPI entry point
│   │   ├── config.py                  # Settings and model configuration
│   │   ├── routes/
│   │   │   ├── upload.py              # File upload endpoints
│   │   │   ├── extraction.py          # Extraction endpoints
│   │   │   ├── comparison.py          # Comparison endpoints
│   │   │   └── ground_truth.py        # Ground truth CRUD + comparison
│   │   ├── services/
│   │   │   ├── excel_parser.py        # Excel/CSV parsing utilities
│   │   │   ├── approach_auto.py       # Approach 1: Fully automatic
│   │   │   ├── approach_guided.py     # Approach 2: User-guided
│   │   │   ├── approach_judge.py      # Approach 3: Deterministic + judge
│   │   │   ├── approach_pipeline.py   # Approach 4: Multi-step pipeline
│   │   │   ├── APPROACHES.md          # Approaches overview
│   │   │   └── APPROACH_4.md          # Approach 4 detailed documentation
│   │   ├── schemas/
│   │   │   └── models.py              # Pydantic models
│   │   └── evaluation/
│   │       ├── deepeval_runner.py     # DeepEval integration
│   │       └── metrics.py             # Custom metrics
│   ├── tests/
│   │   └── test_approaches.py         # Approach unit tests
│   └── requirements.txt               # Python dependencies
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx                    # Main app with navigation
│   │   ├── main.tsx                   # Entry point
│   │   ├── index.css                  # Global styles
│   │   ├── api/
│   │   │   └── client.ts              # API client functions
│   │   ├── types/
│   │   │   └── index.ts               # TypeScript definitions
│   │   └── components/
│   │       ├── Wizard/
│   │       │   ├── UploadStep.tsx     # File upload
│   │       │   ├── ApproachStep.tsx   # Approach selection
│   │       │   ├── ConfigStep.tsx     # Column configuration
│   │       │   ├── ResultsStep.tsx    # Results display + GT comparison
│   │       │   └── EXTRACTION_FLOW.md # Wizard documentation
│   │       ├── History/
│   │       │   ├── HistoryPage.tsx    # Historical runs viewer + GT tab
│   │       │   └── HISTORY.md         # History feature documentation
│   │       └── GroundTruth/
│   │           ├── GroundTruthPage.tsx    # Ground truth list/editor
│   │           ├── GroundTruthEditor.tsx  # Create/edit ground truths
│   │           └── GROUND_TRUTH.md        # Ground truth documentation
│   └── package.json                   # Node dependencies
│
├── output/
│   ├── runs/                          # Extraction run results
│   │   └── run_{timestamp}_{id}/
│   │       ├── metadata.json
│   │       ├── approach_X_result.json
│   │       ├── comparison.json
│   │       └── prompts/
│   ├── comparisons/                   # Standalone comparisons
│   └── ground_truth/                  # Ground truth files
│       └── gt_{timestamp}_{id}.json
│
└── docs/                              # Sample Excel/CSV files for testing
```

## LLM Models

All models accessed via **AWS Bedrock**.

| Model | ID | Purpose | Settings |
|-------|-----|---------|----------|
| **Claude Opus 4.5** | `us.anthropic.claude-opus-4-5-20251101-v1:0` | Primary extraction (Approaches 1, 2 & 4) | temp: 0.1, max_tokens: 32768 |
| **Claude Sonnet 4.5** | `us.anthropic.claude-sonnet-4-5-20250929-v1:0` | Faster extraction + Judge model (Approach 3) | temp: 0.1 / 0.0 (judge), max_tokens: 32768 / 16384 (judge) |

### Model Selection

- **Opus 4.5**: Default for complex extractions, highest quality
- **Sonnet 4.5**: Use when speed matters more than marginal quality gains; also used as the judge model for Approach 3 validation (temp: 0.0, max_tokens: 16384)

## Dependencies

### Backend (Python 3.11+)

| Package | Version | Purpose |
|---------|---------|---------|
| fastapi | >=0.128.0 | Web framework |
| uvicorn | >=0.40.0 | ASGI server |
| pydantic | >=2.12.5 | Data validation |
| boto3 | >=1.42.0 | AWS SDK (Bedrock) |
| openpyxl | >=3.1.5 | Excel file reading |
| markitdown | >=0.1.3 | Excel to Markdown conversion |
| beautifulsoup4 | >=4.12.0 | XML response parsing |
| deepeval | >=3.8.0 | LLM evaluation (optional) |

### Frontend (Node 20+)

| Package | Version | Purpose |
|---------|---------|---------|
| react | ^19.2.0 | UI framework |
| react-dom | ^19.2.0 | React DOM bindings |
| vite | ^7.3.0 | Build tool |
| typescript | ^5.7.0 | Type checking |
| @tanstack/react-query | ^5.90.0 | Data fetching |
| axios | ^1.13.0 | HTTP client |
| react-dropzone | ^14.3.8 | File upload |

## Output Structure

```
output/runs/{run_id}/
├── metadata.json                              # Run configuration and timestamp
├── approach_1_result.json                     # Approach 1 extraction result
├── approach_2_result.json                     # Approach 2 extraction result
├── approach_3_result.json                     # Approach 3 extraction result
├── approach_4_result.json                     # Approach 4 extraction result
├── comparison.json                            # Side-by-side comparison data
├── prompts/
│   └── approach_1_prompt.txt                  # Legacy single prompt (if any)
└── intermediate_results/
    ├── excel_as_markdown.md                   # Full MarkItDown output (Approach 1)
    ├── approach_1_sheet_1_prompt.txt          # Per-sheet prompts (Approach 1)
    ├── approach_1_sheet_1_response.xml        # Per-sheet responses (Approach 1)
    ├── approach_1_parsed_questions.json       # Combined parsed questions (Approach 1)
    ├── step1_structure_analysis_prompt.txt    # Structure analysis (Approach 4)
    ├── step1_structure_analysis_response.xml
    ├── structure_analysis.json
    ├── step2_coverage_validation_prompt.txt   # Coverage validation (Approach 4)
    ├── coverage_validation.json
    ├── step3_extraction_batch_N_prompt.txt    # Per-sheet extraction (Approach 4)
    ├── step3_question_extraction_batch_N.xml
    ├── step3_question_extraction_combined.xml
    └── normalized_questions.json              # Final normalized output (Approach 4)
```

With model comparison enabled, result files are named `approach_X_{model}_result.json`.

## Feature Documentation Index

| Feature | Documentation Path |
|---------|-------------------|
| Frontend Wizard Flow | [frontend/src/components/Wizard/EXTRACTION_FLOW.md](frontend/src/components/Wizard/EXTRACTION_FLOW.md) |
| Extraction Approaches | [backend/app/services/APPROACHES.md](backend/app/services/APPROACHES.md) |
| Approach 4 (Pipeline) | [backend/app/services/APPROACH_4.md](backend/app/services/APPROACH_4.md) |
| Output JSON Schema | [backend/app/schemas/OUTPUT_SCHEMA.md](backend/app/schemas/OUTPUT_SCHEMA.md) |
| History Feature | [frontend/src/components/History/HISTORY.md](frontend/src/components/History/HISTORY.md) |
| Ground Truth | [frontend/src/components/GroundTruth/GROUND_TRUTH.md](frontend/src/components/GroundTruth/GROUND_TRUTH.md) |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/upload/` | Upload Excel or CSV file |
| GET | `/api/upload/{file_id}` | Get file metadata |
| POST | `/api/extract/` | Run extraction |
| GET | `/api/extract/runs` | List all runs |
| GET | `/api/extract/runs/{run_id}` | Get run details |
| GET | `/api/compare/{comparison_id}` | Get comparison |
| POST | `/api/ground-truth/` | Create ground truth |
| GET | `/api/ground-truth/` | List all ground truths |
| GET | `/api/ground-truth/{id}` | Get ground truth |
| PUT | `/api/ground-truth/{id}` | Update ground truth |
| DELETE | `/api/ground-truth/{id}` | Delete ground truth |
| GET | `/api/ground-truth/by-filename/{name}` | Find by filename |
| POST | `/api/ground-truth/compare/{filename}` | Compare with ground truth |
