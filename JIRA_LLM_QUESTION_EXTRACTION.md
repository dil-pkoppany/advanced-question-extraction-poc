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

13 (Large)

---

## Epic Link

Survey Management

---

## Description

### Summary

Integrate the multi-step LLM pipeline (Approach 4) to automatically extract questions, answer options, and dependencies from uploaded Excel survey files. This feature will significantly reduce manual data entry and improve survey setup time.

### User Story

**As a** survey administrator  
**I want** questions to be automatically extracted from uploaded Excel files  
**So that** I can quickly set up surveys without manual data entry

### Background

Currently, when users upload Excel survey files, questions must be manually entered into the system. This is time-consuming for large surveys (100+ questions) and error-prone. The LLM extraction pipeline has been prototyped and validated in a POC, demonstrating high accuracy for various survey formats.

### Technical Approach

The feature uses a 4-step pipeline:
1. **Structure Analysis** - LLM identifies question/answer columns
2. **Coverage Validation** - LLM validates structure completeness
3. **Question Extraction** - LLM extracts questions with types, options, dependencies
4. **Normalization** - Convert to database models with GUIDs

See `LLM_EXTRACTION_IMPLEMENTATION_PLAN.md` for full technical details.

### Feature Flag

**Name:** `survey_llm_question_extraction`

- Controls whether extraction runs automatically on Excel upload
- Per-tenant configurable
- Default: disabled

---

## Acceptance Criteria

### Feature Flag

- [ ] Feature flag `survey_llm_question_extraction` is registered in LaunchDarkly
- [ ] Flag is linked to this Jira ticket in LaunchDarkly
- [ ] Flag can be toggled per-tenant
- [ ] When disabled, upload flow works as before (manual question entry)
- [ ] Flag is tagged with: `survey`, `llm`, `backend`

### Configuration

- [ ] Pydantic config file `extraction_config.py` exists
- [ ] Config supports per-step model configuration:
  - [ ] `step1_structure_analysis` with model_id, inference_profile_arn, max_output_tokens, temperature
  - [ ] `step2_coverage_validation` with model_id, inference_profile_arn, max_output_tokens, temperature
  - [ ] `step3_question_extraction` with model_id, inference_profile_arn, max_output_tokens, temperature
- [ ] Config supports global settings:
  - [ ] `enabled` (bool)
  - [ ] `require_review` (bool)
  - [ ] `extraction_timeout_seconds` (int)
  - [ ] `max_retries` (int)
  - [ ] `save_intermediate_results` (bool)
- [ ] Config can be overridden via environment variables with `EXTRACTION_` prefix

### Database

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

### Models

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

### Extraction Service

- [ ] `QuestionExtractionService` class created
- [ ] Service implements 4-step pipeline:
  - [ ] Step 1: Structure Analysis using config.step1_structure_analysis
  - [ ] Step 2: Coverage Validation using config.step2_coverage_validation
  - [ ] Step 3: Question Extraction using config.step3_question_extraction
  - [ ] Step 4: Normalization (no LLM)
- [ ] Each question receives a unique GUID during normalization
- [ ] Dependencies reference target questions by GUID
- [ ] Sheet names are correctly populated (not generic "Sheet1")
- [ ] Service handles multi-sheet Excel files correctly
- [ ] Service saves intermediate results when `config.save_intermediate_results=true`
- [ ] Service sets `extraction_confidence` for each question
- [ ] Service supports inference profile ARN when configured

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
- [ ] Dependencies use GUID references (not row numbers)
- [ ] Supports both "show" and "skip" dependency actions
- [ ] Supports condition types: "equals", "contains", "not_empty"

### Upload Integration

- [ ] When feature flag is ON: extraction runs automatically on Excel upload
- [ ] `survey.extraction_status` is set to "in_progress" when extraction starts
- [ ] `survey.extraction_status` is set to "completed" when extraction succeeds
- [ ] `survey.extraction_status` is set to "failed" when extraction fails after retries
- [ ] `survey.extraction_status` is set to "partial" when extraction partially succeeds
- [ ] `survey.extraction_run_id` is populated for debugging
- [ ] `survey.extraction_metadata` contains LLM metrics
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
- [ ] Invalid Excel format returns validation error before extraction starts
- [ ] All errors are logged with survey_id, tenant_id, extraction_run_id
- [ ] Bedrock client errors are caught and logged appropriately

### Observability

- [ ] Extraction duration logged (total and per-step)
- [ ] LLM call count logged
- [ ] Questions extracted count logged
- [ ] Model ID used logged
- [ ] Errors logged with structured context
- [ ] Metrics emitted (if metrics system available)

### Testing

- [ ] Unit tests for `ExtractionPipelineConfig` validation
- [ ] Unit tests for GUID generation in normalization
- [ ] Unit tests for dependency resolution
- [ ] Unit tests for XML parsing edge cases
- [ ] Unit tests for question type mapping
- [ ] Integration test for full extraction pipeline (with mock Bedrock)
- [ ] Integration test for feature flag ON/OFF behavior
- [ ] Integration test for review workflow (approve/reject)
- [ ] Integration test for multi-sheet Excel handling
- [ ] Test coverage >= 80% for new code

### Documentation

- [ ] `APPROACH_4.md` updated with GUID documentation
- [ ] `LLM_EXTRACTION_IMPLEMENTATION_PLAN.md` created
- [ ] API endpoint documentation updated
- [ ] Feature flag documented in LaunchDarkly

---

## Implementation Tasks

### 1. Infrastructure Setup

- [ ] Register feature flag `survey_llm_question_extraction` in LaunchDarkly
- [ ] Create `config/extraction_config.py` with Pydantic settings
- [ ] Set up environment variables for local development

### 2. Database Layer

- [ ] Write migration: `add_question_type_enum`
- [ ] Write migration: `create_question_options_table`
- [ ] Write migration: `create_question_dependencies_table`
- [ ] Write migration: `create_question_conditional_inputs_table`
- [ ] Write migration: `alter_questions_add_extraction_fields`
- [ ] Write migration: `alter_surveys_add_extraction_fields`
- [ ] Run migrations in dev/staging environments

### 3. Model Layer

- [ ] Create `QuestionOption` POPO model
- [ ] Create `QuestionDependency` POPO model
- [ ] Create `QuestionConditionalInput` POPO model
- [ ] Update `Question` model with new fields
- [ ] Update `Survey` model with new fields
- [ ] Create/update model unit tests

### 4. Repository Layer

- [ ] Create `QuestionOptionRepository`
- [ ] Create `QuestionDependencyRepository`
- [ ] Create `QuestionConditionalInputRepository`
- [ ] Update `QuestionRepository` for new fields
- [ ] Update `SurveyRepository` for new fields
- [ ] Create repository unit tests

### 5. Service Layer

- [ ] Port `approach_pipeline.py` to `QuestionExtractionService`
- [ ] Adapt for production Bedrock client
- [ ] Implement config-driven model selection
- [ ] Implement inference profile support
- [ ] Add structured logging
- [ ] Add error handling and retries
- [ ] Implement `approve_questions` method
- [ ] Implement `reject_questions` method
- [ ] Create service unit tests

### 6. API Layer

- [ ] Integrate extraction into survey upload endpoint
- [ ] Create `GET /extraction/status` endpoint
- [ ] Create `POST /extraction/retry` endpoint
- [ ] Create `GET /questions/pending-review` endpoint
- [ ] Create `POST /questions/approve` endpoint
- [ ] Create `POST /questions/reject` endpoint
- [ ] Update `GET /questions` to include related entities
- [ ] Create API integration tests

### 7. Testing and QA

- [ ] Write unit tests (target 80% coverage)
- [ ] Write integration tests
- [ ] Manual testing with various Excel formats
- [ ] Performance testing with large files
- [ ] Error scenario testing

### 8. Documentation

- [ ] Update APPROACH_4.md (completed in POC)
- [ ] Create implementation plan document
- [ ] Update API documentation
- [ ] Document feature flag in LaunchDarkly

---

## Dependencies

- AWS Bedrock access with Claude Sonnet 4.5 model
- LaunchDarkly feature flag service
- Python libraries:
  - `openpyxl` - Excel parsing
  - `beautifulsoup4` - XML parsing
  - `pydantic-settings` - Configuration management

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| LLM produces inaccurate extractions | Medium | Medium | Review workflow, confidence scores, human validation |
| Bedrock latency causes timeouts | Low | Medium | Configurable timeout, retry logic |
| Large files exceed token limits | Low | Low | Sheet-based batching already implemented |
| Migration breaks existing data | Low | High | Reversible migrations, staging testing |

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
- `backend/app/services/APPROACH_4.md` - Pipeline documentation
- `backend/app/services/approach_pipeline.py` - POC implementation reference
