# Approach 4: Multi-Step Pipeline Extraction

## Overview

Approach 4 uses a 4-step pipeline to extract questions from Excel files. Each step builds on the previous one, with structure validation before extraction. All intermediate results are saved for debugging and review.

## Pipeline Flow

```
Excel File
    ↓
Step 1: Structure Analysis → JSON structure
    ↓
Step 2: Coverage Validation → JSON validation
    ↓
Step 3: Question Extraction → XML questions
    ↓
Step 4: Normalization → Python objects (final output)
```

---

## Step 1: Structure Analysis

**Purpose**: Analyze Excel file structure to identify which columns contain questions, answer options, and other relevant data.

**Model**: Opus 4.5 or Sonnet 4.5  
**Max Tokens**: 32K (Opus) / 16K (Sonnet)  
**Temperature**: 0.1  
**Response Format**: XML

### Input Parameters

- **file_path**: Path to Excel file
- **Metadata**: Sheet names, column headers, row counts, sample data (first 3 rows per sheet)

### Prompt Structure

```
Analyze this Excel file structure and identify:
1. Which columns contain questions
2. Which columns contain answer options
3. Header row location
4. Data start row

Sheets:
[For each sheet:]
Sheet: [name]
Columns: [column names]
Row count: [count]
Sample rows (first 3):
  Row 2: [sample data]
  Row 3: [sample data]
  Row 4: [sample data]

Respond in XML format:
<structure_analysis>
  <sheet sheet_name="Sheet1" header_row="1" data_start_row="2" confidence="0.95">
    <columns question_column="Column_5" answer_column="Column_6" type_column="" instruction_column=""/>
    <structure_notes>Questions in column 5, answers in column 6</structure_notes>
  </sheet>
</structure_analysis>
```

### Output Format (XML)

```xml
<structure_analysis>
  <sheet sheet_name="Sheet1" header_row="1" data_start_row="2" confidence="0.95">
    <columns 
      question_column="Column_5" 
      answer_column="Column_6" 
      type_column="" 
      instruction_column=""/>
    <structure_notes>Questions in column 5, answers in column 6</structure_notes>
  </sheet>
</structure_analysis>
```

### Parsed Output (JSON)

```json
{
  "sheets": [
    {
      "sheet_name": "Sheet1",
      "header_row": 1,
      "data_start_row": 2,
      "columns": {
        "question_column": "Column_5",
        "answer_column": "Column_6",
        "type_column": null,
        "instruction_column": null
      },
      "structure_notes": "Questions in column 5, answers in column 6"
    }
  ],
  "confidence": 0.95
}
```

### Saved Files

- `intermediate_results/structure_analysis.json` - Parsed structure analysis

---

## Step 2: Coverage Validation

**Purpose**: Validate that Step 1 identified all relevant columns and didn't miss any structural elements.

**Model**: Sonnet 4.5  
**Max Tokens**: 16K  
**Temperature**: 0.0  
**Response Format**: XML

### Input Parameters

- **structure**: Structure analysis output from Step 1
- **file_path**: Path to Excel file (for metadata)
- **Metadata**: Available sheets, columns, row counts

### Prompt Structure

```
Validate this structure analysis. Check:
1. Are all question columns identified?
2. Are answer options properly located?
3. Are there missing elements?

Structure Analysis:
[Full JSON structure from Step 1]

Available Sheets:
[Sheet metadata with columns and row counts]

Respond in XML format:
<coverage_validation is_complete="true" confidence="0.92">
  <missing_elements/>
  <suggestions>
    <suggestion>Column_7 may contain conditional logic indicators</suggestion>
  </suggestions>
</coverage_validation>
```

### Output Format (XML)

```xml
<coverage_validation is_complete="true" confidence="0.92">
  <missing_elements>
    <element>Column_7 may contain dependency information</element>
  </missing_elements>
  <suggestions>
    <suggestion>Column_7 may contain conditional logic indicators</suggestion>
  </suggestions>
</coverage_validation>
```

### Parsed Output (JSON)

```json
{
  "is_complete": true,
  "missing_elements": [],
  "suggestions": [
    "Column_7 may contain conditional logic indicators"
  ],
  "confidence": 0.92
}
```

### Saved Files

- `intermediate_results/coverage_validation.json` - Parsed validation results

---

## Step 3: Question Extraction

**Purpose**: Extract individual questions with their types, answer options, dependencies, and help text. Detects multiple-choice questions that span multiple rows.

**Model**: Opus 4.5 or Sonnet 4.5  
**Max Tokens**: 32K (Opus) / 16K (Sonnet)  
**Temperature**: 0.1  
**Response Format**: XML  
**Batch Size**: 25 questions per batch

### Input Parameters

- **structure**: Structure analysis from Step 1
- **file_path**: Path to Excel file
- **Context Extraction**: For each question row, extracts:
  - `[question]` - Question cell content from the column identified in Step 1
  - `[answer]` - First answer option from the column identified in Step 1
  - `[all_answer_options]` - All answer options when multiple rows belong to the same question

> **Design Note**: Step 1 identifies the specific question and answer columns, so we don't extract generic "adjacent cells". The number of answer options (`[all_answer_options]`) is the primary signal for determining question type (single_choice vs multiple_choice).

### Multiple-Choice Detection

The extraction logic detects when multiple rows belong to the same question:
- If question column is empty but answer column has value → continuation row
- **Gap Tolerance**: Skips over up to 5 consecutive empty rows between answer options
- Looks ahead up to 30 rows to find all answer options
- Stops when a new question is found (non-empty question column)
- Collects all answer options into `answer_options` list

### Follow-up Question Detection

The extraction automatically detects follow-up questions based on text patterns and creates dependencies to link them to the parent question:

**Text Patterns that indicate a follow-up question:**
- "If you can not...", "If no...", "If not..."
- "If not applicable...", "If applicable..."
- "Please explain...", "Please detail...", "Please provide..."

**Behavior:**
- When a follow-up pattern is detected, a dependency is created linking it to the previous question
- Dependency action is set to `show` (follow-up appears when main question answered negatively)
- Answer value is typically set to "No" or the negative response option

**Example:**
```
Row 5: "Can you confirm you meet this requirement?"  → Main question (yes_no)
Row 6: "If you can not reach this requirement, please detail here."  → Follow-up (open_ended)
       → Dependency: depends_on question_row="5" answer_value="No" action="show"
```

### Prompt Structure

```
Extract questions from these rows. For each:
1. Separate question text from instructions/comments
2. Identify type (open_ended, single_choice, multiple_choice, numeric, integer, decimal, yes_no, etc.)
3. Extract ALL answer options if present (especially for single_choice, multiple_choice, yes_no questions)
4. Parse dependencies:
   - Show: 'appears only if...' → action='show'
   - Skip: 'skip if...', 'hidden when...' → action='skip'
5. Detect FOLLOW-UP questions - these indicate conditional dependencies:
   - Text patterns: 'If you can not...', 'If no...', 'If not...', 'Please explain...', 'Please detail...'
   - When detected, create a dependency to the PREVIOUS question row
   - Action is 'show' (follow-up appears when main question answered negatively)

IMPORTANT: If a question has multiple answer options listed in 'answer_options',
it is likely a single_choice, multiple_choice or yes_no question. Extract ALL options.

Question type guidelines:
- yes_no: EXACTLY 2 options that are simple 'Yes'/'No' or 'True'/'False' binary choices
  If 'Yes' has instructions like 'Yes (please provide detail)', extract the conditional instruction
  Example: 'Yes (please provide detail)' | 'No' → type='yes_no', conditional_inputs={'Yes': 'please provide detail'}
- single_choice: Multiple options (including expanded Yes/No variants) but only one can be selected
  Extract conditional instructions from answer options
- multiple_choice: Multiple options and multiple can be selected (checkboxes)
- open_ended: No predefined answer options, free text input

Rows:
Row 15:
  [question] Does your company have any of the following certifications?
  [answer] Environmental certifications, such as ISO 50001, ISO 14001, EMAS
  [all_answer_options] Environmental certifications | Labor and human rights certifications | Business ethics certification(s)
  [NOTE] This question has 3 answer options - it is likely multiple_choice

Output XML format:
<questions>
  <q type="single_choice" row="2" sheet="Sheet1">
    <text>What is your industry?</text>
    <help_text>Please select one</help_text>
    <answers><option>Manufacturing</option><option>Services</option></answers>
    <conditional_inputs><input answer="Yes">please provide detail</input></conditional_inputs>
    <dependencies><depends_on question_row="5" answer_value="Yes" action="show"/></dependencies>
  </q>
  <q type="yes_no" row="8" sheet="Sheet1">
    <text>Do you have sustainability certifications?</text>
    <help_text></help_text>
    <answers><option>Yes</option><option>No</option></answers>
    <conditional_inputs><input answer="Yes">please provide detail about which certifications</input></conditional_inputs>
    <dependencies></dependencies>
  </q>
  <q type="multiple_choice" row="15" sheet="Sheet1">
    <text>Does your company have any of the following certifications?</text>
    <help_text></help_text>
    <answers>
      <option>Environmental certifications, such as ISO 50001, ISO 14001, EMAS</option>
      <option>Labor and human rights certifications, such as Fair Wage Network</option>
      <option>Business ethics certification(s), such as ISO 27001</option>
    </answers>
    <dependencies></dependencies>
  </q>
</questions>
```

### Output Format (XML)

```xml
<questions>
  <q type="multiple_choice" row="15" sheet="Sheet1">
    <text>Does your company have any of the following certifications?</text>
    <help_text></help_text>
    <answers>
      <option>Environmental certifications, such as ISO 50001, ISO 14001, EMAS</option>
      <option>Labor and human rights certifications, such as Fair Wage Network</option>
      <option>Business ethics certification(s), such as ISO 27001</option>
    </answers>
    <conditional_inputs>
      <input answer="Yes">please provide detail</input>
    </conditional_inputs>
    <dependencies>
      <depends_on question_row="5" answer_value="Yes" action="show" original_text="This question appears only if..."/>
    </dependencies>
  </q>
</questions>
```

### Saved Files

- `intermediate_results/step3_extraction_batch_{N}_prompt.txt` - Prompt for each batch
- `intermediate_results/step3_question_extraction_batch_{N}.xml` - XML response for each batch
- `intermediate_results/step3_question_extraction_combined.xml` - All batches combined

---

## Step 4: Normalization

**Purpose**: Convert XML output from Step 3 into Python `ExtractedQuestion` objects.

**Model**: None (deterministic Python parsing)  
**Input**: Combined XML from Step 3  
**Output**: List of `ExtractedQuestion` objects

### Processing Logic

1. Parse XML using BeautifulSoup
2. Extract question text, type, help text
3. Map type strings to `QuestionType` enum
4. Extract all answer options from `<option>` tags
5. Parse conditional inputs from `<conditional_inputs>` tags
6. Parse dependencies from `<dependencies>` tags
7. Create `ExtractedQuestion` objects with all fields

### Output Format (Python Objects)

```python
[
  ExtractedQuestion(
    question_text="Does your company have any of the following certifications?",
    question_type=QuestionType.MULTIPLE_CHOICE,
    answers=[
      "Environmental certifications, such as ISO 50001, ISO 14001, EMAS",
      "Labor and human rights certifications, such as Fair Wage Network",
      "Business ethics certification(s), such as ISO 27001"
    ],
    help_text=None,
    conditional_inputs={"Yes": "please provide detail"},
    dependencies=[
      QuestionDependency(
        depends_on_question_id="5",
        depends_on_answer_value="Yes",
        condition_type="equals",
        dependency_action="show",
        original_text="This question appears only if..."
      )
    ],
    row_index=15,
    sheet_name="Sheet1"
  ),
  ...
]
```

### Saved Files

- `intermediate_results/normalized_questions.json` - JSON serialization of all questions (final output)

---

## Final Output

### ExtractionResult

```json
{
  "approach": 4,
  "success": true,
  "questions": [
    {
      "question_text": "Does your company have any of the following certifications?",
      "question_type": "multiple_choice",
      "answers": ["Environmental certifications...", "Labor and human rights..."],
      "help_text": null,
      "conditional_inputs": {"Yes": "please provide detail"},
      "dependencies": [...],
      "is_valid_question": true,
      "confidence": 0.98,
      "validation_issues": [],
      "row_index": 15,
      "sheet_name": "Sheet1"
    }
  ],
  "metrics": {
    "extraction_count": 150,
    "structure_analysis_time_ms": 5234,
    "coverage_validation_time_ms": 1234,
    "extraction_time_ms": 45231,
    "normalization_time_ms": 123,
    "final_validation_time_ms": 8765,
    "total_llm_calls": 12,
    "questions_marked_invalid": 3,
    "low_confidence_count": 5,
    "structure_confidence": 0.95,
    "coverage_confidence": 0.92,
    "show_dependencies_count": 10,
    "skip_dependencies_count": 2
  }
}
```

---

## Question Types Supported

- `open_ended`: No answer options, free text input
- `single_choice`: Multiple options, only one can be selected
- `multiple_choice`: Multiple options, multiple can be selected
- `yes_no`: Exactly 2 options: Yes/No (or True/False)
- `numeric`: Number input (any number)
- `integer`: Whole numbers only
- `decimal`: Decimal numbers
- `grouped_question`: Parent question with subquestions

---

## Special Features

### Multiple-Choice Detection
- Automatically detects when questions span multiple rows
- Groups continuation rows (empty question column, but answer column has value)
- Tolerates up to 5 consecutive empty gap rows between answer options
- Collects all answer options from grouped rows

### Conditional Instructions
- Extracts instructions like "Yes (please provide detail)"
- Stores in `conditional_inputs` field: `{"Yes": "please provide detail"}`
- UI can show text input when user selects "Yes"

### Dependency Parsing
- Parses embedded dependency descriptions from question text
- Extracts structured dependency information
- Supports both "show" and "skip" dependency actions

### Help Text Separation
- Separates question text from instructions/comments
- Stores instructions in `help_text` field

---

## Intermediate Results Directory Structure

```
output/runs/{run_id}/
├── intermediate_results/
│   ├── structure_analysis.json              # Step 1 output
│   ├── coverage_validation.json             # Step 2 output
│   ├── step3_extraction_batch_1_prompt.txt  # Step 3 prompts
│   ├── step3_extraction_batch_2_prompt.txt
│   ├── step3_question_extraction_batch_1.xml  # Step 3 XML responses
│   ├── step3_question_extraction_batch_2.xml
│   ├── step3_question_extraction_combined.xml
│   └── normalized_questions.json            # Step 4 output (final)
├── approach_4_result.json                   # Final extraction result
└── metadata.json                            # Run metadata
```

---

## Error Handling

- **Step 1 Failure**: Returns empty structure, pipeline continues with fallback
- **Step 2 Warnings**: Logs suggestions, proceeds with caution
- **Step 3 Partial Failure**: Returns partial XML, saves what was extracted
- **Step 4 Parsing Error**: Attempts recovery, logs malformed XML

All intermediate results are saved even on partial failures for debugging.
