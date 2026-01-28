# Output JSON Schema

This document describes the JSON files produced by extraction runs.

## Output Directory Structure

```
output/
├── runs/
│   └── run_{timestamp}_{uuid}/
│       ├── metadata.json              # Run configuration
│       ├── approach_1_result.json     # Approach 1 results
│       ├── approach_2_result.json     # Approach 2 results
│       ├── approach_3_result.json     # Approach 3 results
│       ├── comparison.json            # Side-by-side comparison
│       └── prompts/
│           ├── approach_1_prompt.txt  # Full prompt sent to LLM
│           ├── approach_2_prompt.txt
│           └── approach_3_prompt.txt
│
├── comparisons/
│   └── cmp_{timestamp}.json           # Standalone comparison files
│
└── ground_truth/
    └── gt_{timestamp}_{uuid}.json     # Ground truth files
```

### With Model Comparison

When `compare_models: true`, result files include model suffix:

```
run_{timestamp}_{uuid}/
├── approach_1_opus_4_5_result.json
├── approach_1_sonnet_4_result.json
├── approach_2_opus_4_5_result.json
├── approach_2_sonnet_4_result.json
└── prompts/
    ├── approach_1_opus_4_5_prompt.txt
    └── approach_1_sonnet_4_prompt.txt
```

---

## metadata.json

Run configuration and identifiers.

```json
{
  "run_id": "run_20260127_205546_5287b285",
  "file_name": "sample_survey.xlsx",
  "file_id": "file_20260127_205151_edcfc3ce",
  "timestamp": "2026-01-27T19:57:54.343897",
  "approaches_run": [1, 2, 3],
  "config": {
    "approach": 1,
    "column_mappings": [...],
    "question_types": [],
    "run_all_approaches": true,
    "model": "opus-4.5",
    "compare_models": true
  }
}
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `run_id` | string | Unique run identifier: `run_{timestamp}_{uuid}` |
| `file_name` | string | **Original Excel filename** (used for ground truth matching) |
| `file_id` | string | Internal file identifier from upload |
| `timestamp` | ISO 8601 | When extraction started |
| `approaches_run` | int[] | List of approach numbers executed |
| `config` | object | Full `ExtractionConfig` used |

**Note:** The `file_name` stores the original filename (e.g., `sample_survey.xlsx`) which is used for matching with ground truths. A separate `.meta.json` file is created during upload to preserve this information.

### Config Object

| Field | Type | Description |
|-------|------|-------------|
| `approach` | 1 \| 2 \| 3 | Primary approach selected |
| `column_mappings` | array \| null | User-defined column mappings |
| `question_types` | string[] | Expected question types |
| `run_all_approaches` | boolean | Run all 3 approaches |
| `model` | string | `"opus-4.5"` or `"sonnet-4"` |
| `compare_models` | boolean | Run with both models |

---

## approach_X_result.json

Individual approach extraction results.

```json
{
  "approach": 1,
  "model": "opus-4.5",
  "success": true,
  "error": null,
  "questions": [
    {
      "question_text": "What is your company name?",
      "question_type": "open_ended",
      "answers": null,
      "confidence": null,
      "is_valid_question": null,
      "row_index": null,
      "sheet_name": null
    },
    {
      "question_text": "Select your industry (Manufacturing|Services|Technology|Other)",
      "question_type": "single_choice",
      "answers": ["Manufacturing", "Services", "Technology", "Other"],
      "confidence": null,
      "is_valid_question": null,
      "row_index": null,
      "sheet_name": null
    }
  ],
  "metrics": {
    "extraction_count": 126,
    "expected_count": null,
    "accuracy": null,
    "llm_time_ms": 45231,
    "total_time_ms": 46892,
    "tokens_input": 12500,
    "tokens_output": 8900,
    "avg_confidence": null,
    "low_confidence_count": null
  },
  "prompt": "Extract ALL questions from this survey...",
  "raw_response": "<questions><q type=\"open_ended\">..."
}
```

### Top-Level Fields

| Field | Type | Description |
|-------|------|-------------|
| `approach` | 1 \| 2 \| 3 | Which approach was used |
| `model` | string \| null | Model used (`"opus-4.5"`, `"sonnet-4"`) |
| `success` | boolean | Whether extraction succeeded |
| `error` | string \| null | Error message if failed |
| `questions` | array | Extracted questions |
| `metrics` | object \| null | Performance metrics |
| `prompt` | string \| null | Full interpolated prompt |
| `raw_response` | string \| null | Raw LLM response |

### ExtractedQuestion

| Field | Type | Approaches | Description |
|-------|------|------------|-------------|
| `question_text` | string | All | The question content |
| `question_type` | enum | All | See Question Types below |
| `answers` | string[] \| null | All | Answer options if present |
| `confidence` | float \| null | 3 only | Judge confidence (0.0-1.0) |
| `is_valid_question` | boolean \| null | 3 only | Judge validity assessment |
| `row_index` | int \| null | 2, 3 | Source row in Excel |
| `sheet_name` | string \| null | 2, 3 | Source sheet name |

### Question Types

```typescript
enum QuestionType {
  "open_ended"        // Free text, no options
  "single_choice"     // Select one option
  "multiple_choice"   // Select multiple options
  "grouped_question"  // Parent:child question format
  "yes_no"            // Yes/No only
}
```

### ExtractionMetrics

| Field | Type | Approaches | Description |
|-------|------|------------|-------------|
| `extraction_count` | int | All | Questions extracted |
| `expected_count` | int \| null | 2, 3 | Expected from row count |
| `accuracy` | float \| null | 2 | `extraction_count / expected_count` |
| `llm_time_ms` | int \| null | All | LLM call duration |
| `total_time_ms` | int | All | Total processing time |
| `tokens_input` | int \| null | 1, 2 | Approximate input tokens |
| `tokens_output` | int \| null | 1, 2 | Approximate output tokens |
| `avg_confidence` | float \| null | 3 | Mean judge confidence |
| `low_confidence_count` | int \| null | 3 | Items below 0.7 threshold |

---

## comparison.json

Side-by-side comparison of all approaches in a run.

```json
{
  "comparison_id": "cmp_20260127_205754",
  "run_id": "run_20260127_205546_5287b285",
  "timestamp": "2026-01-27T19:57:54.567000",
  "results": {
    "approach_1_opus_4_5": { ... },
    "approach_1_sonnet_4": { ... },
    "approach_2_opus_4_5": { ... },
    "approach_3_opus_4_5": { ... }
  },
  "winner": {
    "count": 1,
    "speed": 3,
    "accuracy": 2,
    "confidence": 3
  }
}
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `comparison_id` | string | Unique comparison ID |
| `run_id` | string | Associated run ID |
| `timestamp` | ISO 8601 | When comparison was created |
| `results` | object | Map of approach key → `ExtractionResult` |
| `winner` | object | Best approach by each criterion |

### Result Keys

Keys follow the pattern: `approach_{num}` or `approach_{num}_{model}`

Examples:
- `approach_1` - Approach 1, default model
- `approach_2_opus_4_5` - Approach 2, Opus 4.5
- `approach_3_sonnet_4` - Approach 3, Sonnet 4

### Winner Criteria

| Criterion | Description |
|-----------|-------------|
| `count` | Most questions extracted |
| `speed` | Fastest `total_time_ms` |
| `accuracy` | Highest accuracy (Approach 2 only) |
| `confidence` | Highest `avg_confidence` (Approach 3 only) |

---

## prompts/*.txt

Plain text files containing the full prompt sent to the LLM.

### Format

```
================================================================================
PROMPT FOR: approach_1_opus_4_5
Approach: 1
Model: opus-4.5
Success: True
Questions Extracted: 126
================================================================================

Extract ALL questions from this survey content.

EXTRACTION RULES
...
```

### Header Fields

| Field | Description |
|-------|-------------|
| `PROMPT FOR` | Result key (e.g., `approach_1_opus_4_5`) |
| `Approach` | Approach number (1, 2, or 3) |
| `Model` | Model used |
| `Success` | Whether extraction succeeded |
| `Questions Extracted` | Count of questions found |

---

## ColumnMapping Schema

Used in `config.column_mappings`:

```json
{
  "sheet_name": "ESG DDQ",
  "question_column": "Column_5",
  "answer_column": "Column_6",
  "type_column": null,
  "question_types": [],
  "start_row": 2,
  "end_row": null
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sheet_name` | string | Yes | Excel sheet name |
| `question_column` | string | Yes | Column with question text |
| `answer_column` | string | No | Column with answer options |
| `type_column` | string | No | Column with question type |
| `question_types` | string[] | No | Expected types filter |
| `start_row` | int | Yes | First data row (default: 2) |
| `end_row` | int | No | Last row (null = all) |

---

## API Response Schema

### ExtractionResponse

Returned by `POST /api/extract/`:

```json
{
  "run_id": "run_20260127_205546_5287b285",
  "results": {
    "approach_1": { ... },
    "approach_2": { ... }
  },
  "comparison": { ... }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `run_id` | string | Unique run identifier |
| `results` | object | Map of approach key → `ExtractionResult` |
| `comparison` | object \| null | `ComparisonResult` if multiple approaches |

---

## Ground Truth Schema

### gt_{timestamp}_{uuid}.json

Validated question set for accuracy comparison.

```json
{
  "ground_truth_id": "gt_20260128_143540_af83d244",
  "file_name": "sample_survey.xlsx",
  "file_name_normalized": "sample_survey.xlsx",
  "created_by": "John Doe",
  "created_at": "2026-01-28T13:35:40.000000",
  "updated_at": "2026-01-28T14:45:00.000000",
  "version": 2,
  "notes": "Validated against original survey",
  "sheets": [
    {
      "sheet_name": "Questions",
      "questions": [
        {
          "id": "Q001",
          "question_text": "What is your company name?",
          "question_type": "open_ended",
          "answers": null,
          "row_index": 2
        },
        {
          "id": "Q002",
          "question_text": "Select your industry",
          "question_type": "single_choice",
          "answers": ["Manufacturing", "Services", "Technology"],
          "row_index": 3
        }
      ]
    }
  ],
  "total_question_count": 25
}
```

### Ground Truth Fields

| Field | Type | Description |
|-------|------|-------------|
| `ground_truth_id` | string | Unique ID: `gt_{timestamp}_{uuid}` |
| `file_name` | string | Original Excel filename |
| `file_name_normalized` | string | Lowercase filename for matching |
| `created_by` | string | Creator name |
| `created_at` | ISO 8601 | Creation timestamp |
| `updated_at` | ISO 8601 | Last modification timestamp |
| `version` | int | Version number (incremented on update) |
| `notes` | string \| null | Optional notes |
| `sheets` | array | List of sheets with questions |
| `total_question_count` | int | Total questions across all sheets |

### Ground Truth Question

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Question identifier (e.g., "Q001") |
| `question_text` | string | The question content |
| `question_type` | string | Question type (same enum as extraction) |
| `answers` | string[] \| null | Answer options if applicable |
| `row_index` | int \| null | Source row in Excel |

---

## Ground Truth Comparison Result

Returned by `POST /api/ground-truth/compare/{filename}`:

```json
{
  "approach_1": {
    "ground_truth_id": "gt_20260128_143540_af83d244",
    "ground_truth_file_name": "sample_survey.xlsx",
    "approach_key": "approach_1",
    "model": "opus-4.5",
    "ground_truth_count": 25,
    "extracted_count": 23,
    "exact_matches": 20,
    "fuzzy_matches": 2,
    "missed_questions": 3,
    "extra_questions": 1,
    "precision": 0.9565,
    "recall": 0.88,
    "f1_score": 0.9167,
    "matched_questions": ["Q001", "Q002", ...],
    "missed_question_ids": ["Q024", "Q025"]
  }
}
```

### Comparison Fields

| Field | Type | Description |
|-------|------|-------------|
| `ground_truth_count` | int | Total questions in ground truth |
| `extracted_count` | int | Questions extracted by approach |
| `exact_matches` | int | Questions matching exactly |
| `fuzzy_matches` | int | Questions matching >80% similarity |
| `missed_questions` | int | Ground truth questions not found |
| `extra_questions` | int | Extracted but not in ground truth |
| `precision` | float | exact + fuzzy matches / extracted |
| `recall` | float | exact + fuzzy matches / ground truth |
| `f1_score` | float | Harmonic mean of precision & recall |
| `matched_questions` | string[] | List of matched question IDs |
| `missed_question_ids` | string[] | Ground truth IDs not found |
