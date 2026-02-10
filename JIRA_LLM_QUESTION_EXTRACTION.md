# Jira Ticket: LLM Question Extraction

## Title

**Implement LLM-based Question Extraction for Survey Excel Uploads**

---

## Type

Feature

---

## Priority

High

---

## Labels

- `backend`
- `llm`
- `survey`
- `feature-flag`
- `database`

---

## Story Points

10 (Large)

---

## Epic Link

Survey Management

---

## Description

### Summary

Integrate the fully automatic LLM extraction pipeline (Approach 1) to automatically extract questions, answer options, help text, conditional inputs, and dependencies from uploaded Excel survey files. The service architecture uses a Strategy pattern so it can be extended to Approach 4 (multi-step pipeline) if higher accuracy is needed, without changing the database or API layers.

### User Story

**As a** survey administrator  
**I want** questions to be automatically extracted from uploaded Excel files  
**So that** I can quickly set up surveys without manual data entry

### Background

Currently, when users upload Excel survey files, questions must be manually entered into the system. This is time-consuming for large surveys (100+ questions) and error-prone. The LLM extraction pipeline has been prototyped and validated in a POC, demonstrating high accuracy for various survey formats including multi-sheet ESG questionnaires with embedded checkboxes.

### Technical Approach

The feature uses Approach 1 (Fully Automatic) with an extensible architecture:

1. **Checkbox Preprocessing** (optional) — Extract checkbox labels from VML drawings and write to a new column so MarkItDown can see them
2. **MarkItDown Conversion** — Convert the full Excel file to Markdown
3. **Per-Sheet Splitting** — Split Markdown by `## SheetName` headers to avoid LLM output token truncation
4. **LLM Extraction** — Send each sheet independently to the LLM; receive structured XML
5. **Normalization** — Parse XML, generate GUIDs, resolve dependencies (two-pass)
6. **DB Persistence** — Create Question, QuestionOption, QuestionDependency, QuestionConditionalInput records

The Strategy pattern allows switching to Approach 4 (structure analysis + filtered extraction) via config change (`approach: "pipeline"`) when accuracy improvements are needed.

See `LLM_EXTRACTION_IMPLEMENTATION_PLAN.md` for full technical details.  
See `backend/app/services/APPROACH_1.md` for detailed Approach 1 pipeline documentation.

### Feature Flag

**Name:** `survey_llm_question_extraction`

- Controls whether extraction runs automatically on Excel upload
- Per-tenant configurable
- Default: disabled

---

## Acceptance Criteria

### Feature Flag (sub-ticket: [`TICKET_FEATURE_FLAG.md`](TICKET_FEATURE_FLAG.md))

- [ ] Feature flag `survey_llm_question_extraction` is registered in LaunchDarkly
- [ ] Flag is linked to this Jira ticket in LaunchDarkly
- [ ] Flag can be toggled per-tenant
- [ ] When disabled, upload flow works as before (manual question entry)
- [ ] Flag is tagged with: `survey`, `llm`, `backend`
- [ ] Frontend flag endpoint investigated and documented

### Configuration (sub-ticket: [`TICKET_EXTRACTION_CONFIG.md`](TICKET_EXTRACTION_CONFIG.md))

- [ ] Single merged `ExtractionConfig` Pydantic settings class exists
- [ ] Config supports model configuration as flat fields:
  - [ ] `model_id`, `inference_profile_arn`, `max_output_tokens`, `temperature`
- [ ] Config supports approach selection:
  - [ ] `approach` field with values `"auto"` (Approach 1) and `"pipeline"` (Approach 4, future)
  - [ ] Default: `"auto"`
- [ ] Config supports preprocessing toggle:
  - [ ] `checkbox_preprocessing_enabled` (bool, default: true)
- [ ] Config supports global settings:
  - [ ] `enabled` (bool)
  - [ ] `require_review` (bool)
  - [ ] `extraction_timeout_seconds` (int)
  - [ ] `max_retries` (int)
  - [ ] `save_intermediate_results` (bool)
- [ ] Config can be overridden via environment variables with `EXTRACTION_` prefix

### Database (sub-ticket: [`TICKET_DB_MIGRATION_AND_MODELS.md`](TICKET_DB_MIGRATION_AND_MODELS.md))

- [ ] Migration creates `question_type_enum` PostgreSQL enum type
- [ ] Migration creates `question_options` table with columns:
  - `option_id` (UUID, PK)
  - `question_id` (UUID, FK to questions)
  - `option_text` (TEXT, NOT NULL)
  - `option_order` (INT, NOT NULL)
  - `tenant_id` (UUID, NOT NULL)
  - `created_at`, `updated_at` timestamps
- [ ] Migration creates `question_dependencies` table with columns:
  - `dependency_id` (UUID, PK)
  - `question_id` (UUID, FK to questions)
  - `depends_on_question_id` (UUID, FK to questions)
  - `depends_on_answer_value` (TEXT)
  - `condition_type` (TEXT, default 'equals')
  - `dependency_action` (TEXT, NOT NULL)
  - `tenant_id` (UUID, NOT NULL)
  - `created_at`, `updated_at` timestamps
- [ ] Migration creates `question_conditional_inputs` table with columns:
  - `conditional_id` (UUID, PK)
  - `question_id` (UUID, FK to questions)
  - `trigger_answer_value` (TEXT, NOT NULL)
  - `input_prompt` (TEXT, NOT NULL)
  - `tenant_id` (UUID, NOT NULL)
  - `created_at`, `updated_at` timestamps
- [ ] Migration adds columns to `questions` table:
  - `help_text` (TEXT, nullable)
  - `source_row_index` (INT, nullable)
  - `source_sheet_name` (TEXT, nullable)
  - `extraction_confidence` (FLOAT, nullable)
  - `extraction_status` (TEXT, default 'approved')
- [ ] Migration adds columns to `surveys` table:
  - `extraction_status` (TEXT, default 'not_started')
  - `extraction_metadata` (JSONB, nullable)
  - `extraction_run_id` (UUID, nullable)
  - `require_extraction_review` (BOOL, default true)
- [ ] All migrations are reversible (down migrations work)
- [ ] Migrations include appropriate indexes for foreign keys
- [ ] Schema is forward-compatible with Approach 4 (no changes needed on upgrade)

### Models (sub-ticket: [`TICKET_DB_MIGRATION_AND_MODELS.md`](TICKET_DB_MIGRATION_AND_MODELS.md))

- [ ] `QuestionOption` POPO model created with all fields
- [ ] `QuestionDependency` POPO model created with all fields
- [ ] `QuestionConditionalInput` POPO model created with all fields
- [ ] `Question` model updated with new fields
- [ ] `Survey` model updated with new fields
- [ ] `QuestionType` enum created with values: open_ended, single_choice, multiple_choice, yes_no, numeric, integer, decimal

### Repositories

- [ ] `QuestionOptionRepository` implements CRUD operations
- [ ] `QuestionDependencyRepository` implements CRUD operations
- [ ] `QuestionConditionalInputRepository` implements CRUD operations
- [ ] `QuestionRepository` updated to handle new fields
- [ ] `SurveyRepository` updated to handle new fields
- [ ] Bulk insert methods available for options, dependencies, conditional inputs

### Checkbox Preprocessing

- [ ] `CheckboxPreprocessor` service created
- [ ] Extracts checkbox labels from VML drawings (`vmlDrawing*.xml`) inside `.xlsx` ZIP
- [ ] Writes labels to a new "Checkbox Alt texts" column in a temporary copy
- [ ] Handles all sheets (not just one hardcoded sheet)
- [ ] Handles all rows with checkboxes (no hardcoded row range)
- [ ] Operates on a temp copy (never modifies original upload)
- [ ] No-op when file has no VML checkboxes (returns original path)
- [ ] XML-escapes special characters in labels (`&`, `<`, `>`, `"`)

### Extraction Service

- [ ] `ExtractionStrategy` protocol defined with `extract()` method
- [ ] `AutoExtractionStrategy` class implements `ExtractionStrategy` (Approach 1)
- [ ] `ExtractionOrchestrator` coordinates preprocessing, strategy execution, and persistence
- [ ] Orchestrator selects strategy based on `config.approach`
- [ ] Service converts Excel to Markdown using MarkItDown
- [ ] Service splits Markdown by `## SheetName` headers into per-sheet chunks
- [ ] Service sends one LLM call per sheet for question extraction
- [ ] Service parses XML responses using BeautifulSoup
- [ ] Each question receives a unique GUID during normalization (two-pass)
- [ ] Dependencies reference target questions by GUID (resolved from seq numbers)
- [ ] Sheet names are correctly injected into each question (not generic "Sheet1")
- [ ] Service handles multi-sheet Excel files correctly (28+ sheets tested in POC)
- [ ] Service saves intermediate results when `config.save_intermediate_results=true`
- [ ] Service supports inference profile ARN when configured
- [ ] Per-sheet failure is isolated (other sheets' results preserved)

### Shared Components

- [ ] `MarkdownConverter` wraps MarkItDown with NaN cleanup and CSV fallback
- [ ] `XmlResponseParser` handles XML parsing, GUID generation, and dependency resolution
- [ ] `QuestionPersister` handles bulk DB writes for all question-related entities
- [ ] All shared components are reusable by future Approach 4 implementation

### Question Type Extraction

- [ ] Correctly extracts `open_ended` questions
- [ ] Correctly extracts `single_choice` questions with all options
- [ ] Correctly extracts `multiple_choice` questions with all options
- [ ] Correctly extracts `yes_no` questions
- [ ] Correctly extracts `numeric`/`integer`/`decimal` questions
- [ ] Detects conditional inputs (e.g., "Yes, please provide detail")
- [ ] Creates `QuestionConditionalInput` records for detected conditional inputs

### Dependency Detection

- [ ] Detects follow-up questions based on text patterns:
  - "If you can not...", "If no...", "If not..."
  - "Please explain...", "Please detail...", "Please provide..."
- [ ] Creates correct `QuestionDependency` relationships
- [ ] Dependencies use GUID references (not seq numbers or row numbers)
- [ ] Supports both "show" and "skip" dependency actions
- [ ] Supports condition types: "equals", "contains", "not_empty"

### Upload Integration

- [ ] When feature flag is ON: extraction runs automatically on Excel upload
- [ ] `survey.extraction_status` is set to "in_progress" when extraction starts
- [ ] `survey.extraction_status` is set to "completed" when extraction succeeds
- [ ] `survey.extraction_status` is set to "failed" when extraction fails after retries
- [ ] `survey.extraction_status` is set to "partial" when extraction partially succeeds
- [ ] `survey.extraction_run_id` is populated for debugging
- [ ] `survey.extraction_metadata` contains LLM metrics (llm_time_ms, total_llm_calls, tokens)
- [ ] On extraction failure, survey is still created (allows manual entry fallback)
- [ ] `survey.question_count` is updated after extraction

### Review Workflow

- [ ] When `survey.require_extraction_review=true`: questions created with status `pending_review`
- [ ] When `survey.require_extraction_review=false`: questions created with status `approved`
- [ ] `require_extraction_review` is configurable per tenant (from feature flag variation)
- [ ] Approve endpoint changes question status from `pending_review` to `approved`
- [ ] Reject endpoint changes question status from `pending_review` to `rejected`
- [ ] Reject endpoint records rejection reason

### API Endpoints

- [ ] `GET /surveys/{survey_id}/extraction/status` returns:
  - `extraction_status`
  - `extraction_run_id`
  - `extraction_metadata` (including metrics)
- [ ] `POST /surveys/{survey_id}/extraction/retry` triggers re-extraction
- [ ] `GET /surveys/{survey_id}/questions/pending-review` returns questions with status `pending_review`
- [ ] `POST /surveys/{survey_id}/questions/approve` accepts list of question_ids
- [ ] `POST /surveys/{survey_id}/questions/reject` accepts list of question_ids and reason
- [ ] `GET /surveys/{survey_id}/questions` includes:
  - `options` (list of QuestionOption)
  - `dependencies` (list of QuestionDependency)
  - `conditional_inputs` (list of QuestionConditionalInput)
  - `help_text`, `extraction_confidence`, `extraction_status`

### Error Handling

- [ ] LLM timeout results in retry (up to `config.max_retries`)
- [ ] After max retries, `extraction_status` is set to "failed"
- [ ] Partial extraction saves extracted questions, marks survey as "partial"
- [ ] Per-sheet failure is isolated (other sheets still contribute questions)
- [ ] Incomplete XML is recovered by appending `</questions>` closing tag
- [ ] Invalid Excel format returns validation error before extraction starts
- [ ] All errors are logged with survey_id, tenant_id, extraction_run_id
- [ ] Bedrock client errors are caught and logged appropriately

### Observability

- [ ] Extraction duration logged (total and per-sheet)
- [ ] LLM call count logged (per-sheet granularity)
- [ ] Questions extracted count logged
- [ ] Model ID and approach used logged
- [ ] Checkbox preprocessing duration logged (when applicable)
- [ ] Errors logged with structured context
- [ ] Metrics emitted (if metrics system available)

### Testing

- [ ] Unit tests for `ExtractionConfig` validation and defaults
- [ ] Unit tests for `CheckboxPreprocessor` (VML extraction, temp file management)
- [ ] Unit tests for `MarkdownConverter` (MarkItDown + NaN cleanup + CSV)
- [ ] Unit tests for per-sheet splitting (regex, single-sheet fallback)
- [ ] Unit tests for GUID generation in normalization (two-pass)
- [ ] Unit tests for dependency resolution (seq-to-GUID mapping)
- [ ] Unit tests for XML parsing edge cases (truncated, missing tags, unknown types)
- [ ] Unit tests for question type mapping
- [ ] Integration test for full extraction pipeline (with mock Bedrock)
- [ ] Integration test for checkbox preprocessing with real Excel files
- [ ] Integration test for feature flag ON/OFF behavior
- [ ] Integration test for review workflow (approve/reject)
- [ ] Integration test for multi-sheet Excel handling
- [ ] Integration test for strategy selection (config.approach = "auto")
- [ ] Test coverage >= 80% for new code

### Documentation

- [ ] `APPROACH_1.md` created with full pipeline documentation
- [ ] `LLM_EXTRACTION_IMPLEMENTATION_PLAN.md` updated for Approach 1
- [ ] API endpoint documentation updated
- [ ] Feature flag documented in LaunchDarkly

---

## Implementation Tasks

### Parallelizable Sub-tickets (Phase 0)

The following three tasks have been split into independent sub-tickets that can be worked on in parallel by different developers:

| Sub-ticket | Description | File |
|------------|-------------|------|
| **Database Migration + Models** | Alembic migrations (6 migrations) and Python model classes (QuestionType enum, QuestionOption, QuestionDependency, QuestionConditionalInput, updated Question/Survey) | [`TICKET_DB_MIGRATION_AND_MODELS.md`](TICKET_DB_MIGRATION_AND_MODELS.md) |
| **Feature Flag** | Register `survey_llm_question_extraction` in LaunchDarkly, verify frontend flag endpoint | [`TICKET_FEATURE_FLAG.md`](TICKET_FEATURE_FLAG.md) |
| **Extraction Configuration** | Create merged `ExtractionConfig` Pydantic settings class with env var overrides | [`TICKET_EXTRACTION_CONFIG.md`](TICKET_EXTRACTION_CONFIG.md) |

### 1. Infrastructure Setup (remaining after Phase 0)

- [ ] Set up environment variables for local development
- [ ] Define `ExtractionStrategy` protocol

### 4. Repository Layer

- [ ] Create `QuestionOptionRepository`
- [ ] Create `QuestionDependencyRepository`
- [ ] Create `QuestionConditionalInputRepository`
- [ ] Update `QuestionRepository` for new fields
- [ ] Update `SurveyRepository` for new fields (including `update_extraction_status`)
- [ ] Create repository unit tests

### 5. Shared Components

- [ ] Create `CheckboxPreprocessor` service (port from `checkbox_label_poc.py`)
  - [ ] Generalize to all sheets (remove hardcoded sheet name)
  - [ ] Generalize to all rows (remove hardcoded row range)
  - [ ] Add temp file management
  - [ ] Add unit tests
- [ ] Create `MarkdownConverter` service (wraps MarkItDown + NaN cleanup)
- [ ] Create `XmlResponseParser` service (XML parsing + GUID generation + dependency resolution)
- [ ] Create `QuestionPersister` service (bulk DB writes)

### 6. Extraction Strategy

- [ ] Port `approach_auto.py` to `AutoExtractionStrategy`
- [ ] Adapt for production Bedrock client (with inference profile support)
- [ ] Implement config-driven model selection
- [ ] Add structured logging with survey_id, tenant_id, run_id
- [ ] Add per-sheet error handling and retry logic
- [ ] Create strategy unit tests

### 7. Orchestrator

- [ ] Create `ExtractionOrchestrator`
- [ ] Implement preprocessing + strategy + persistence coordination
- [ ] Implement strategy selection based on `config.approach`
- [ ] Implement `approve_questions` method
- [ ] Implement `reject_questions` method
- [ ] Create orchestrator integration tests

### 8. API Layer

- [ ] Integrate extraction into survey upload endpoint
- [ ] Create `GET /extraction/status` endpoint
- [ ] Create `POST /extraction/retry` endpoint
- [ ] Create `GET /questions/pending-review` endpoint
- [ ] Create `POST /questions/approve` endpoint
- [ ] Create `POST /questions/reject` endpoint
- [ ] Update `GET /questions` to include related entities
- [ ] Create API integration tests

### 9. Testing and QA

- [ ] Write unit tests (target 80% coverage)
- [ ] Write integration tests
- [ ] Manual testing with various Excel formats (including checkbox-based surveys)
- [ ] Performance testing with large files (500+ questions, 20+ sheets)
- [ ] Error scenario testing (malformed Excel, LLM failures, Bedrock timeouts)

### 10. Documentation

- [ ] Create `APPROACH_1.md` with pipeline documentation
- [ ] Update `LLM_EXTRACTION_IMPLEMENTATION_PLAN.md` for Approach 1
- [ ] Update API documentation
- [ ] Document feature flag in LaunchDarkly

---

## Dependencies

- AWS Bedrock access with Claude Sonnet 4.5 model
- LaunchDarkly feature flag service
- Python libraries:
  - `markitdown` - Excel to Markdown conversion
  - `openpyxl` - Excel parsing (metadata, filtered markdown)
  - `beautifulsoup4` - XML response parsing
  - `pydantic-settings` - Configuration management

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| LLM produces inaccurate extractions | Medium | Medium | Review workflow, human validation, upgrade path to Approach 4 |
| Bedrock latency causes timeouts | Low | Medium | Configurable timeout, retry logic, per-sheet isolation |
| Large files exceed token limits | Low | Low | Per-sheet splitting prevents output truncation |
| Checkbox labels not extracted | Medium | Low | VML preprocessing + fallback to raw TRUE/FALSE values |
| Migration breaks existing data | Low | High | Reversible migrations, staging testing |

---

## Future Extension: Approach 4

If extraction accuracy needs improvement for specific file formats, the architecture supports upgrading to Approach 4 (Multi-Step Pipeline) with minimal changes:

**What to add:**
- `PipelineExtractionStrategy` class implementing `ExtractionStrategy` protocol
- Per-step model configs (`step1_structure_analysis`, `step2_coverage_validation`, `step3_question_extraction`)
- `ExcelMetadataService` for pandas-based column metadata
- `FilteredMarkdownGenerator` for column-filtered tables

**What to change:**
- Config: Set `approach: "pipeline"`
- Orchestrator: Register the new strategy

**What stays the same:**
- Database schema (all fields already supported)
- API endpoints (same request/response shapes)
- Feature flag, review workflow, observability
- Shared components (CheckboxPreprocessor, XmlResponseParser, QuestionPersister)

See `backend/app/services/APPROACH_4.md` for detailed Approach 4 documentation.

---

## Definition of Done

- [ ] All acceptance criteria met
- [ ] All implementation tasks completed
- [ ] Code reviewed and approved
- [ ] Tests passing (unit + integration)
- [ ] Migrations tested in staging
- [ ] Feature flag working correctly
- [ ] Documentation updated
- [ ] No critical bugs
- [ ] Product owner sign-off

---

## Related Documents

- `LLM_EXTRACTION_IMPLEMENTATION_PLAN.md` - Full technical implementation plan
- `backend/app/services/APPROACH_1.md` - Approach 1 detailed pipeline documentation
- `backend/app/services/APPROACH_4.md` - Approach 4 pipeline documentation (future reference)
- `backend/app/services/approach_auto.py` - POC Approach 1 implementation reference
- `backend/checkbox_label_poc.py` - POC checkbox preprocessing reference

### Sub-tickets (Parallelizable)

- `TICKET_DB_MIGRATION_AND_MODELS.md` - Database migrations and model classes
- `TICKET_FEATURE_FLAG.md` - Feature flag registration and frontend endpoint investigation
- `TICKET_EXTRACTION_CONFIG.md` - Extraction configuration Pydantic settings class
