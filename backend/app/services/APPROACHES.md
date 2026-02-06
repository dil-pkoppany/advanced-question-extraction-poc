# Extraction Approaches

This document details the four extraction approaches implemented in the backend.

## Overview

```mermaid
flowchart TB
    subgraph input [Input]
        Excel[Excel File]
        Mappings[Column Mappings]
    end

    subgraph approaches [Approaches]
        A1[Approach 1: Auto]
        A2[Approach 2: Guided]
        A3[Approach 3: Judge]
        A4[Approach 4: Pipeline]
    end

    subgraph llm [LLM Layer]
        Opus[Opus/Sonnet]
        Haiku[Haiku Judge]
    end

    Excel --> A1
    Excel --> A2
    Excel --> A3
    Excel --> A4
    Mappings --> A2
    Mappings --> A3

    A1 --> Opus
    A2 --> Opus
    A3 --> Haiku
    A4 --> Opus

    Opus --> XML[XML Response]
    Haiku --> JSON[JSON Scores]
```

## Approach 1: Fully Automatic (`approach_auto.py`)

**No user input required.**

### Process

1. Convert Excel to Markdown using `markitdown`
2. Split markdown into per-sheet chunks (by `## SheetName` headers)
3. Send each sheet to LLM independently with extraction prompt
4. Parse XML responses and combine questions from all sheets

### Per-Sheet Chunking

Large multi-sheet Excel files can produce LLM responses that exceed the output token limit (32K tokens), causing truncation mid-question. To avoid this, Approach 1 splits the MarkItDown output by sheet and processes each sheet as a separate LLM call:

- **Splitting**: MarkItDown uses `## SheetName` as sheet separators — the markdown is split at these headers
- **Independent calls**: Each sheet gets its own prompt and LLM response, keeping output within token limits
- **Sheet name injection**: The `sheet_name` is injected into each extracted question for comparison and display
- **Single-sheet files**: Files with one sheet (or CSVs) are processed in a single call as before

### When to Use

- Quick baseline extraction
- Unknown file structure
- First-time exploration of a questionnaire

### Prompt Template

Each sheet receives its own prompt:

```
Extract ALL questions from the sheet 'Section 1' from this survey content.

EXTRACTION RULES

1. ANALYZE THE STRUCTURE: Identify which columns/sections contain questions,
   answer options, and instructions.

2. EXTRACT EVERY QUESTION FULLY: Extract each question completely. This includes:
   - Interrogative sentences (e.g., "How satisfied are you...")
   - Imperative instructions (e.g., "List the main reasons...")
   - Any request for information

3. SEPARATE QUESTION TEXT FROM INSTRUCTIONS:
   - Put the actual question in <text>
   - Put instructions, comments, or help text in <help_text>

4. EXTRACT ALL ANSWER OPTIONS:
   - Put each answer option in a separate <option> tag within <answers>
   - Do NOT embed answers in the question text

5. DETECT FOLLOW-UP QUESTIONS AND DEPENDENCIES:
   - Text patterns: "If you can not...", "If no...", "Please explain..."
   - Create dependency to PREVIOUS question using its seq number

CONTENT:
{sheet_content}

OUTPUT FORMAT:
<questions>
  <q type="yes_no" seq="1">
    <text>Do you have sustainability certifications?</text>
    <help_text></help_text>
    <answers><option>Yes</option><option>No</option></answers>
    <dependencies></dependencies>
  </q>
</questions>

Extract ALL questions. Return ONLY the XML.
```

### Output Metrics

| Metric | Description |
|--------|-------------|
| `extraction_count` | Number of questions found |
| `total_llm_calls` | Number of per-sheet LLM calls |
| `llm_time_ms` | Total time spent in LLM calls |
| `total_time_ms` | Total processing time |
| `tokens_input` | Approximate total input tokens |
| `tokens_output` | Approximate total output tokens |

### Intermediate Files

Per-sheet prompts and responses are saved for debugging:

```
intermediate_results/
├── excel_as_markdown.md                  # Full MarkItDown output
├── approach_1_sheet_1_prompt.txt         # Prompt for sheet 1
├── approach_1_sheet_1_response.xml       # Response for sheet 1
├── approach_1_sheet_2_prompt.txt         # Prompt for sheet 2
├── approach_1_sheet_2_response.xml       # Response for sheet 2
├── ...
└── approach_1_parsed_questions.json      # Combined parsed questions
```

---

## Approach 2: User-Guided (`approach_guided.py`)

**User provides column mappings and expected question types.**

### Process

1. Count expected rows from user-specified columns (deterministic)
2. Convert Excel to Markdown
3. Build dynamic prompt with user context (column hints, expected count)
4. Call LLM with enhanced context
5. Calculate accuracy: `extraction_count / expected_count`

### When to Use

- Structure is known (which columns contain questions)
- Need accuracy measurement
- Want LLM to focus on specific columns

### Column Mapping Structure

```python
class ColumnMapping:
    sheet_name: str
    question_column: str       # Required
    answer_column: str | None  # Optional
    type_column: str | None    # Optional
    question_types: list[QuestionType]
    start_row: int             # Default: 2
    end_row: int | None        # Optional
```

### Prompt Template

```
Extract ALL questions from this survey content.

USER-PROVIDED STRUCTURE INFORMATION:

Sheet: {sheet_name}
  - Question column: {question_column}
  - Answer column: {answer_column}
  - Data starts at row: {start_row}

EXPECTED QUESTION TYPES: {types}

EXPECTED COUNT: Approximately {expected_count} questions should be extracted.

EXTRACTION RULES

Focus on the columns specified above. The question text is in the 
"{question_column}" column.

EXTRACT EVERY ROW: Each row in the question column represents one 
question. Extract all {expected_count} rows.

CONTENT:
{content}

OUTPUT FORMAT:
<questions>
  <q type="open_ended">Full question text</q>
  <q type="single_choice">Question? (Option A|Option B)</q>
</questions>

IMPORTANT: Extract exactly {expected_count} questions if possible.
Return ONLY the XML.
```

### Output Metrics

| Metric | Description |
|--------|-------------|
| `extraction_count` | Number of questions found |
| `expected_count` | Rows counted in specified columns |
| `accuracy` | `extraction_count / expected_count` |
| `llm_time_ms` | Time spent in LLM call |
| `total_time_ms` | Total processing time |

---

## Approach 3: Deterministic + Judge (`approach_judge.py`)

**No LLM for extraction. LLM only validates quality.**

### Process

1. Parse rows directly from specified columns (no LLM)
2. Run Haiku judge model on batches of 10 questions
3. Assign confidence scores and validity flags
4. Return questions with quality metadata

### When to Use

- Speed is critical
- Need confidence scores for filtering
- Structure is well-defined
- Want to validate extraction quality

### Judge Prompt Template

```
You are a question quality validator. For each item below, assess:
1. Is this a valid survey question? (not a comment, instruction, or header)
2. How confident are you that this is a properly formatted question? (0.0-1.0)

Items to evaluate:
1. {question_text}
2. {question_text}
...

Respond in JSON format:
{
  "evaluations": [
    {"item": 1, "is_valid": true, "confidence": 0.95, "reason": "Clear question with options"},
    {"item": 2, "is_valid": false, "confidence": 0.2, "reason": "This is a section header, not a question"}
  ]
}

Evaluate ALL {count} items. Return ONLY the JSON.
```

### Output Metrics

| Metric | Description |
|--------|-------------|
| `extraction_count` | Number of rows parsed |
| `expected_count` | Same as extraction_count (deterministic) |
| `accuracy` | Always 1.0 (deterministic) |
| `avg_confidence` | Average judge confidence score |
| `low_confidence_count` | Items below threshold (0.7) |
| `llm_time_ms` | Time spent in judge calls |
| `total_time_ms` | Total processing time |

### Per-Question Fields

| Field | Description |
|-------|-------------|
| `confidence` | Judge confidence (0.0-1.0) |
| `is_valid_question` | Judge determination |
| `row_index` | Original Excel row number |
| `sheet_name` | Source sheet |

---

## Approach 4: Multi-Step Pipeline (`approach_pipeline.py`)

**Automatic structure detection + LLM extraction with context.**

### Process

1. **Structure Analysis**: LLM analyzes Excel to identify question/answer columns
2. **Coverage Validation**: Verify structure spans the file, identify question rows
3. **Question Extraction**: Extract questions with rich context (answer options, dependencies)
4. **Normalization**: Convert XML to `ExtractedQuestion` objects

### When to Use

- Unknown file structure (like Approach 1) but need better accuracy
- Need dependency detection between questions
- Want automatic type detection with context-aware extraction

### Key Features

- **Auto-detects columns**: No user mapping required
- **Gap tolerance**: Handles empty rows between answer options (up to 5 rows)
- **Follow-up detection**: Automatically identifies follow-up questions and creates dependencies
- **Help text separation**: Extracts instructions/comments into `help_text` field

### Follow-up Question Detection

Automatically detects follow-up questions based on text patterns:
- "If you can not...", "If no...", "If not..."
- "Please explain...", "Please detail...", "Please provide..."

When detected, creates a dependency linking the follow-up to the previous question with `action="show"`.

### Output Metrics

| Metric | Description |
|--------|-------------|
| `extraction_count` | Number of questions found |
| `structure_analysis_time_ms` | Time for Step 1 |
| `coverage_validation_time_ms` | Time for Step 2 |
| `question_extraction_time_ms` | Time for Step 3 |
| `normalization_time_ms` | Time for Step 4 |
| `total_time_ms` | Total processing time |

### Per-Question Fields

| Field | Description |
|-------|-------------|
| `question_text` | Main question text |
| `help_text` | Additional instructions/comments |
| `question_type` | Detected type (yes_no, single_choice, etc.) |
| `answers` | List of answer options |
| `dependencies` | List of question dependencies |
| `row_index` | Original Excel row number |
| `sheet_name` | Source sheet |

See [APPROACH_4.md](APPROACH_4.md) for detailed documentation.

---

## Excel Parsing (`excel_parser.py`)

The `ExcelParser` service handles all Excel file operations.

### Methods

| Method | Description |
|--------|-------------|
| `convert_to_markdown()` | Converts full Excel to Markdown for LLM (Approach 1) |
| `generate_filtered_markdown()` | Generates markdown table with selected columns and optional pre-resolved column indices (Approach 4) |
| `get_file_metadata()` | Returns sheet names, columns (from row 1), row counts, sample data |
| `count_rows_in_columns()` | Counts non-empty rows in specified columns |
| `extract_rows_by_columns()` | Extracts row data deterministically |

### Sheet Processing

```mermaid
flowchart LR
    Excel[Excel File] --> OpenPyXL[openpyxl]
    OpenPyXL --> Sheets[Sheet Data]
    
    Sheets --> MD[markitdown]
    MD --> Markdown[Markdown Text]
    
    Sheets --> Direct[Direct Read]
    Direct --> Rows[Row Data]
```

---

## Response Parsing

Approaches 1, 2, and 4 expect XML responses with structured question elements:

```xml
<questions>
  <q type="yes_no" seq="1">
    <text>Do you have sustainability certifications?</text>
    <help_text></help_text>
    <answers><option>Yes</option><option>No</option></answers>
    <conditional_inputs><input answer="Yes">please provide detail</input></conditional_inputs>
    <dependencies></dependencies>
  </q>
</questions>
```

**Parsing logic** (`_parse_response`):
1. Find `<questions>` tags
2. Handle incomplete XML (recovery — append `</questions>`)
3. Parse with BeautifulSoup
4. Extract `<text>`, `<help_text>`, `<answers>/<option>`, `<conditional_inputs>`, `<dependencies>`
5. Generate UUIDs and build seq/row → GUID mapping for dependency resolution
6. Map type strings to `QuestionType` enum
7. Inject `sheet_name` (Approaches 1 and 4)

---

## Model Selection

Models are selected in `config.py`:

```python
# Extraction models (Approaches 1 & 2)
bedrock_opus_model_id = "us.anthropic.claude-opus-4-5-20251101-v1:0"
bedrock_sonnet_model_id = "us.anthropic.claude-sonnet-4-20250514-v1:0"

# Judge model (Approach 3 only)
bedrock_judge_model_id = "global.anthropic.claude-3-haiku-20240307-v1:0"
```

**Model parameters:**

| Setting | Extraction | Judge |
|---------|------------|-------|
| `max_tokens` | 32,768 | 1,024 |
| `temperature` | 0.1 | 0.0 |

---

## Comparison Summary

| Aspect | Approach 1 | Approach 2 | Approach 3 | Approach 4 |
|--------|------------|------------|------------|------------|
| **LLM for extraction** | Yes (per-sheet) | Yes | No | Yes (per-sheet) |
| **User input required** | No | Yes | Yes | No |
| **Accuracy metric** | No | Yes | N/A | No |
| **Confidence scores** | No | No | Yes | No |
| **Speed** | Medium | Slow | Fast | Medium |
| **Model used** | Opus/Sonnet | Opus/Sonnet | Haiku | Opus/Sonnet |
| **Dependencies detected** | Yes | No | No | Yes |
| **Follow-up detection** | Yes | No | No | Yes |
| **Sheet-level chunking** | Yes | No | No | Yes |
| **Sheet name in output** | Yes | No | Yes | Yes |
| **Best for** | Unknown structure | Known structure | Validation | Complex questionnaires |
