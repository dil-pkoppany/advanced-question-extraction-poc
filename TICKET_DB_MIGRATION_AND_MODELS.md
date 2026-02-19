# Ticket: Database Migration and Model Classes

## Title

**Create Database Migrations and Model Classes for LLM Question Extraction**

---

## Type

Sub-task

## Priority

High

## Labels

- `backend`
- `database`
- `migration`

## Parent Ticket

LLM Question Extraction (see `JIRA_LLM_QUESTION_EXTRACTION.md`)

---

## Description

Create the Alembic database migrations and corresponding Python model classes needed to support the LLM question extraction feature. This includes new tables for question options, dependencies, and conditional inputs, as well as new columns on the existing `questions` and `surveys` tables.

This ticket is **scoped strictly to the database and model layers**. No repositories, services, or API endpoints are included.

### What to Create

**New tables:**
- `question_options` — predefined answer choices for a question
- `question_dependencies` — conditional logic between questions (e.g., show question B only if question A is answered "No")
- `question_conditional_inputs` — additional input prompts triggered by specific answers (e.g., "Yes, please provide detail")

**New enum type:**
- `question_type_enum` — PostgreSQL enum for question types

**Altered tables:**
- `questions` — add extraction-related columns (help_text, source tracking, confidence, status)
- `surveys` — add extraction status tracking columns

**Python model classes:**
- `QuestionType` enum
- `QuestionOption` model
- `QuestionDependency` model
- `QuestionConditionalInput` model
- Updated `Question` model (new fields)
- Updated `Survey` model (new fields)

### Target State ER Diagram

```mermaid
erDiagram
    Survey ||--o{ Question : contains
    Question ||--o{ QuestionOption : has_options
    Question ||--o{ QuestionDependency : depends_on
    Question ||--o{ QuestionConditionalInput : has_conditional
    Question ||--o{ Answer : receives
    QuestionOption ||--o{ QuestionDependency : triggers
    QuestionOption ||--o{ QuestionConditionalInput : triggers

    Survey {
        uuid survey_id PK
        string title
        string extraction_status
        jsonb extraction_metadata
        string extraction_run_id
        boolean require_extraction_review
        string answering_status
        timestamp extraction_started_at
        timestamp answering_started_at
        string extraction_error
        string answering_error
    }

    Question {
        uuid question_id PK
        uuid survey_id FK
        string question_text
        string question_type
        string help_text
        int question_order
        int source_row_index
        string source_sheet_name
        float extraction_confidence
        string extraction_status
    }

    QuestionOption {
        uuid option_id PK
        uuid question_id FK
        string option_text
        int option_order
    }

    QuestionDependency {
        uuid dependency_id PK
        uuid question_id FK
        uuid depends_on_question_id FK
        uuid depends_on_option_id FK "nullable"
        string depends_on_answer_value "nullable"
        string condition_type
        string dependency_action
    }

    QuestionConditionalInput {
        uuid conditional_id PK
        uuid question_id FK
        uuid trigger_option_id FK "nullable"
        string trigger_answer_value "nullable"
        string input_prompt
    }
```

---

## Acceptance Criteria

### Migrations

- [ ] Migration creates `question_type_enum` PostgreSQL enum type with values: `open_ended`, `single_choice`, `multiple_choice`, `yes_no`, `numeric`, `integer`, `decimal`
- [ ] Migration creates `question_options` table with columns:
  - `option_id` (UUID, PK)
  - `question_id` (UUID, FK to questions, NOT NULL)
  - `option_text` (TEXT, NOT NULL)
  - `option_order` (INT, NOT NULL)
  - `created_at`, `updated_at` timestamps
- [ ] Migration creates `question_dependencies` table with columns:
  - `dependency_id` (UUID, PK)
  - `question_id` (UUID, FK to questions, NOT NULL)
  - `depends_on_question_id` (UUID, FK to questions, NOT NULL)
  - `depends_on_option_id` (UUID, FK to question_options, nullable) -- specific option that triggers this dependency
  - `depends_on_answer_value` (TEXT, nullable) -- fallback text match for open-ended questions
  - `condition_type` (TEXT, default `'equals'`)
  - `dependency_action` (TEXT, NOT NULL)
  - `created_at`, `updated_at` timestamps
- [ ] Migration creates `question_conditional_inputs` table with columns:
  - `conditional_id` (UUID, PK)
  - `question_id` (UUID, FK to questions, NOT NULL)
  - `trigger_option_id` (UUID, FK to question_options, nullable) -- specific option that triggers this input
  - `trigger_answer_value` (TEXT, nullable) -- fallback text match for open-ended questions
  - `input_prompt` (TEXT, NOT NULL)
  - `created_at`, `updated_at` timestamps
- [ ] CHECK constraint: at least one of `depends_on_option_id` or `depends_on_answer_value` must be non-null in `question_dependencies`
- [ ] CHECK constraint: at least one of `trigger_option_id` or `trigger_answer_value` must be non-null in `question_conditional_inputs`
- [ ] Migration adds columns to `questions` table:
  - `help_text` (TEXT, nullable)
  - `source_row_index` (INT, nullable)
  - `source_sheet_name` (TEXT, nullable)
  - `extraction_confidence` (FLOAT, nullable)
  - `extraction_status` (TEXT, default `'approved'`)
- [ ] Migration adds columns to `surveys` table:
  - `extraction_status` (TEXT, default `'not_started'`)
  - `extraction_metadata` (JSONB, nullable)
  - `extraction_run_id` (UUID, nullable)
  - `require_extraction_review` (BOOL, default `true`)
  - `answering_status` (TEXT, default `'not_started'`) -- for future auto-answering phase
  - `extraction_started_at` (TIMESTAMP, nullable) -- when extraction started; used for stale job recovery and frontend timeout
  - `answering_started_at` (TIMESTAMP, nullable) -- when answering started; same purpose
  - `extraction_error` (TEXT, nullable) -- human-readable error message for frontend display
  - `answering_error` (TEXT, nullable) -- human-readable error message for frontend display
- [ ] All migrations are reversible (down migrations work correctly)
- [ ] Foreign key columns have appropriate indexes
- [ ] Schema is forward-compatible with Approach 4 (no changes will be needed on upgrade)

### Model Classes

- [ ] `QuestionType` enum created with values: `open_ended`, `single_choice`, `multiple_choice`, `yes_no`, `numeric`, `integer`, `decimal`
- [ ] `QuestionOption` model created with fields: `option_id`, `question_id`, `option_text`, `option_order`
- [ ] `QuestionDependency` model created with fields: `dependency_id`, `question_id`, `depends_on_question_id`, `depends_on_option_id`, `depends_on_answer_value`, `condition_type`, `dependency_action`
- [ ] `QuestionConditionalInput` model created with fields: `conditional_id`, `question_id`, `trigger_option_id`, `trigger_answer_value`, `input_prompt`
- [ ] `Question` model updated with new fields: `help_text`, `source_row_index`, `source_sheet_name`, `extraction_confidence`, `extraction_status`
- [ ] `Survey` model updated with new fields: `extraction_status`, `extraction_metadata`, `extraction_run_id`, `require_extraction_review`, `answering_status`, `extraction_started_at`, `answering_started_at`, `extraction_error`, `answering_error`
- [ ] Unit tests for model creation and field validation

### Out of Scope

- Repositories (CRUD operations) — separate ticket
- Services, orchestrator, extraction logic — separate ticket
- API endpoints — separate ticket
- Feature flag setup — see `TICKET_FEATURE_FLAG.md`
- Configuration file — see `TICKET_EXTRACTION_CONFIG.md`

---

## Migration Order

| Order | Migration Name | Description |
|-------|---------------|-------------|
| 1 | `add_question_type_enum` | Create `question_type_enum` PostgreSQL enum |
| 2 | `create_question_options_table` | New table for answer choices |
| 3 | `create_question_dependencies_table` | New table for conditional logic |
| 4 | `create_question_conditional_inputs_table` | New table for "if yes, provide detail" |
| 5 | `alter_questions_add_extraction_fields` | Add help_text, source tracking, confidence to questions |
| 6 | `alter_surveys_add_extraction_fields` | Add extraction_status, metadata to surveys |

---

## Technical Notes

- Follow existing project patterns for model base classes
- Tenant isolation is handled at the database schema level (per-tenant schema), so no `tenant_id` column is needed in any table
- The `question_type_enum` replaces the current generic string `question_type` on the `questions` table
- `extraction_status` on questions uses string values: `pending_review`, `approved`, `rejected`
- `extraction_status` on surveys uses string values: `not_started`, `in_progress`, `completed`, `failed`, `partial`
- `answering_status` on surveys uses the same string values as `extraction_status` (added now to avoid a future migration when auto-answering is implemented)
- `extraction_started_at` and `answering_started_at` are set when the respective phase begins; used by stale job recovery (server restart detection) and by the frontend to calculate elapsed time and enforce polling timeout
- `extraction_error` and `answering_error` store human-readable error messages set by the top-level try/catch or timeout handler; displayed to the user in the frontend when status is `failed`
- `depends_on_option_id` and `trigger_option_id` are nullable FKs to `question_options`. For choice-based questions (`single_choice`, `multiple_choice`, `yes_no`), these point to the specific option that triggers the dependency/conditional input. For `open_ended`/`numeric` questions (no options), the text fields (`depends_on_answer_value`, `trigger_answer_value`) are used as a fallback. This enables the auto-answering LLM to return option IDs instead of free text, making answer matching deterministic and dependency resolution precise.
- All UUID primary keys should use `uuid_generate_v4()` as default

---

## Related Documents

- `LLM_EXTRACTION_IMPLEMENTATION_PLAN.md` — Full implementation plan (see Database Migrations and New Database Models sections)
- `JIRA_LLM_QUESTION_EXTRACTION.md` — Parent Jira ticket
- `ARCHITECTURE.md` — Architecture decision (API background task + future auto-answering)
- `backend/app/services/APPROACH_1.md` — Approach 1 pipeline documentation
