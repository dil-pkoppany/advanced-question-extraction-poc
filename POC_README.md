# Excel Question Extraction POC

This POC extracts questions from Excel files using AWS Bedrock with Claude Sonnet 4, leveraging an ultra-compact XML output format for optimal token efficiency.

## 🎯 Current Approach

**MarkItDown + InvokeModel with XML Output**
- Excel → MarkItDown (Markdown conversion) → Bedrock AI (InvokeModel) → Ultra-compact XML → Parsed Questions
- **Model**: Claude Sonnet 4 (`anthropic.claude-sonnet-4-20250514-v1:0`)
- **Output Format**: Ultra-compact XML (`<questions><q type="...">Question text with embedded answers (A|B|C)</q></questions>`)
- **Token Efficiency**: Minimal metadata, maximum content

## 📊 Recent Test Results

**Tested on real survey files:**

| File | Questions | Input Chars | Output Tokens | Processing Time | Status |
|------|-----------|-------------|---------------|-----------------|--------|
| **Ecovadis reassessment** | 126 | 49,228 | 7,787 | 1m 32s | ✅ Success |

### Key Improvements

- **Ultra-Compact XML**: Reduced output size by ~40% vs JSON
- **Simplified Schema**: Only `question_text` and `question_type` fields
- **Token Efficiency**: More questions fit within 8K output token limit
- **Robust Parsing**: BeautifulSoup XML parser handles incomplete responses

## 🛠️ Installation

```bash
# Create virtual environment (recommended)
python3 -m venv poc_venv
source poc_venv/bin/activate  # On Windows: poc_venv\Scripts\activate

# Install dependencies
pip install -r poc_requirements.txt

# Or install manually:
pip install markitdown[xlsx] beautifulsoup4 lxml boto3
```

### Dependencies

- **markitdown[xlsx]**: Excel to Markdown conversion (includes openpyxl)
- **beautifulsoup4**: XML/HTML parsing
- **lxml**: Fast XML processing
- **boto3**: AWS SDK for Bedrock API

## ⚙️ AWS Configuration

### 1. AWS SSO Login

```bash
export AWS_PROFILE=dil-swift-survey-dev
export AWS_REGION=us-west-2
export DEPLOYMENT_ID=gladanyi

# Login to AWS SSO
aws sso login --no-browser
```

### 2. Bedrock Model Access

Ensure your AWS account has access to:
- ✅ Claude Sonnet 4: `arn:aws:bedrock:us-west-2::inference-profile/global.anthropic.claude-sonnet-4-20250514-v1:0`

IAM Permissions needed:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel"
      ],
      "Resource": [
        "arn:aws:bedrock:*:*:inference-profile/*",
        "arn:aws:bedrock:*:*:model/*"
      ]
    }
  ]
}
```

## 🚀 Usage

```bash
# Basic usage
python3 excel_question_extraction_poc.py your_survey.xlsx

# With custom output file
python3 excel_question_extraction_poc.py your_survey.xlsx --output results.json

# Using specific model
export BEDROCK_MODEL_ID="arn:aws:bedrock:us-west-2::inference-profile/global.anthropic.claude-sonnet-4-20250514-v1:0"
python3 excel_question_extraction_poc.py your_survey.xlsx
```

### Command Line Options

- `excel_file`: Path to Excel file to analyze (required)
- `--output`, `-o`: Custom output JSON file path (optional)

## 📊 Output Format

### Console Output
```
============================================================
POC RESULTS SUMMARY
============================================================

MARKITDOWN:
  ✅ Success: 126 questions found
    1. Please provide information about your company's business act...
    2. Does your company formally and publicly endorse any external...
    3. Which of the following applies to your company's reporting o...
    ... and 123 more questions
  ⏱️  Total Time: 1m 32.3s

📄 Full results saved to: excel_extraction_poc_results_20251017_160338.json
```

### JSON Result File
```json
{
  "excel_file": "survey.xlsx",
  "timestamp": "2025-10-17T16:03:38",
  "selected_approaches": [3],
  "approaches": {
    "markitdown": {
      "extracted_text_length": 49228,
      "markitdown_file": "survey_markitdown_20251017_160207.md",
      "bedrock_result": {
        "extraction_method": "text_based",
        "total_questions_found": 126,
        "success": true,
        "questions": [
          {
            "question_text": "Please provide information about your company's business activities...",
            "question_type": "open_ended"
          },
          {
            "question_text": "Does your company formally and publicly endorse any external sustainability initiatives? (UNGC|SBTi|Other|None)",
            "question_type": "multiple_choice"
          }
        ]
      },
      "performance": {
        "markitdown_extraction_time": 1.5,
        "bedrock_time": 90.7,
        "total_time": 92.3,
        "total_formatted": "1m 32.3s"
      }
    }
  }
}
```

### Markdown Extraction File

Each run creates a `.md` file with the MarkItDown extraction:
```markdown
# MarkItDown Extraction from survey.xlsx

**Extracted at:** 2025-10-17T16:02:07
**Source file:** survey.xlsx
**Text length:** 49228 characters

---

## Questionnaire

| Theme | Question name | Question code | Question text |
| --- | --- | --- | --- |
| General | Company info | GEN_001 | Please provide information... |
```

## 🎨 XML Output Format

### Ultra-Compact Schema

```xml
<questions>
  <q type="open_ended">Full question text here</q>
  <q type="single_choice">Question? (Option A|Option B|Option C)</q>
  <q type="multiple_choice">Question? (Option A|Option B|Option C)</q>
  <q type="grouped_question">Main question: Subquestion text</q>
  <q type="yes_no">Is this correct? (Yes|No)</q>
</questions>
```

### Supported Question Types

**Currently Implemented:**
- `open_ended`: No predefined answer options
- `single_choice`: Has answer options, only one can be selected
- `multiple_choice`: Has answer options, multiple can be selected
- `grouped_question`: Main question with subquestions (matrix-style/battery questions)
- `yes_no`: Only Yes/No options

**🔄 Discussion Needed - Consider Adding:**
- `rating_scale`: Numeric scale questions (1-5, etc.) - *Currently classified as single_choice*
- `matrix`: Tabular question format - *Currently handled via grouped_question*
- `ranking`: Ordered preference questions - *Not explicitly supported*

### Answer Embedding

Answer options are **always embedded** in the question text using pipe separator in parentheses:

✅ **CORRECT**: `"Which initiative? (UN Global Compact|SBTi|Other|None)"`
❌ **WRONG**: `"Which initiative?"` with separate answers property

### Grouped Questions (Subquestions)

When a main question has subparts (a,b,c or 1,2,3) or matrix-style items, each is extracted separately with type `grouped_question`:

**Original**: "Describe policies: a) Environmental b) Social c) Governance"

**Extracted**:
```xml
<q type="grouped_question">Describe policies: Environmental</q>
<q type="grouped_question">Describe policies: Social</q>
<q type="grouped_question">Describe policies: Governance</q>
```

**Matrix-style Example**:
Original: "Rate your satisfaction with:" followed by items "Service", "Quality", "Price"

**Extracted**:
```xml
<q type="grouped_question">Rate your satisfaction with: Service</q>
<q type="grouped_question">Rate your satisfaction with: Quality</q>
<q type="grouped_question">Rate your satisfaction with: Price</q>
```

> **Note**: Even if grouped questions have answer options (like a rating scale), they are classified as `grouped_question` because subquestions take priority.

## 🧪 Prompt Engineering

### Current Prompt Structure

The extraction prompt follows this structure:

```
Extract ALL questions from this survey content.

EXTRACTION RULES

ANALYZE THE STRUCTURE: Identify which columns contain main questions, subquestions 
(grouped follow-up items), and answer options (selectable choices).

EXTRACT EVERY QUESTION FULLY: Extract each question completely. This includes 
interrogative sentences (e.g., "How satisfied are you..."), imperative instructions 
(e.g., "List the main reasons..."), and any request for information.

ANSWER OPTIONS AND CHOICE TYPES: If a question includes predefined answer options 
(including Yes/No), list them after the question in parentheses, separated by "|".
Example: What actions are in place? (Risk assessment|Training|Ergonomics|No actions|Other)

- If only one option can be selected → single_choice
- If multiple selections allowed → multiple_choice

Important: Do not confuse multiple choice options with subquestions. Options are 
selectable values; subquestions are separate, itemized prompts under one main theme.

GROUPED QUESTIONS: A grouped question is when a main question is followed by multiple 
related subquestions or aspects that should be answered individually. These often 
appear as matrix-style or battery-style questions. Extract each combination as:
Main question:Subquestion

Example: "How satisfied are you with the following?" with items "Customer service", 
"Prices", "Product range" becomes:
- How satisfied are you with the following?:Customer service
- How satisfied are you with the following?:Prices
- How satisfied are you with the following?:Product range

CATEGORIES:
- open_ended: No answer options and no subquestions
- single_choice: Has answer options, only one can be selected
- multiple_choice: Has answer options, multiple can be selected
- grouped_question: Has subquestions (even if answer options are also present)
- yes_no: Can only be answered with Yes or No

Important: If a question includes both answer options and subquestions, always 
classify it as grouped_question. Subquestions take priority over answer format.
```

### Prompt Optimizations

- ✅ **Structured rules**: Clear separation of extraction concerns
- ✅ **Explicit examples**: Shows correct format for each scenario
- ✅ **Distinguishes options vs subquestions**: Prevents common misclassification
- ✅ **Priority rules**: Clear guidance when categories overlap (grouped_question wins)
- ✅ **Type definitions**: Five distinct, well-defined categories

## 🔧 Technical Architecture

### Processing Flow

1. **Excel Extraction**: MarkItDown converts Excel to clean Markdown
2. **Text Cleaning**: Replace "NaN" values with dashes for better readability
3. **Prompt Generation**: Combine extraction rules + content + XML schema
4. **AI Processing**: Claude Sonnet 4 via InvokeModel API
5. **XML Parsing**: BeautifulSoup extracts `<q>` tags with attributes
6. **JSON Output**: Convert to standard question format

### Key Features

- **Incomplete XML Recovery**: Parser adds closing tags if response truncated
- **Fallback to JSON**: If XML parsing fails, attempts JSON parsing
- **Configurable Timeout**: 10-minute read timeout for large files
- **Adaptive Retries**: Botocore config with 3 retry attempts
- **Structured Logging**: Detailed logging at each processing stage

## 🔍 Troubleshooting

### AWS Authentication Errors
```
Error: The SSO session associated with this profile has expired
```
**Solution**: Run `aws sso login --no-browser`

### MarkItDown Excel Support
```
Error: XlsxConverter... dependencies needed to read .xlsx files have not been installed
```
**Solution**: Install with Excel support: `pip install markitdown[xlsx]`

### XML Parser Missing
```
Error: Couldn't find a tree builder with the features you requested: xml
```
**Solution**: Install lxml: `pip install lxml`

### Large File Timeout
```
Error: Read timeout on endpoint URL
```
**Solution**: Already configured with 10-minute timeout. If still occurs, file may be too large (>50K characters).

## 📈 Performance Characteristics

### Token Usage

- **Input**: ~2.5 tokens per character (includes prompt overhead)
- **Output**: Ultra-compact (only question text + type)
- **Ratio**: Typically 2:1 input:output token ratio

### Processing Speed

| File Size | Characters | Questions | Time | Tokens/sec |
|-----------|------------|-----------|------|------------|
| Small | <10K | 10-30 | 10-20s | ~500 |
| Medium | 10-30K | 30-60 | 30-60s | ~400 |
| Large | 30-50K | 60-150 | 1-2m | ~350 |

### Cost Estimation

**Claude Sonnet 4 Pricing** (as of Oct 2025):
- Input: $0.003 per 1K tokens
- Output: $0.015 per 1K tokens

**Typical Costs**:
- Small file (10K chars): ~$0.05 per extraction
- Medium file (30K chars): ~$0.15 per extraction
- Large file (50K chars): ~$0.25 per extraction

## 💡 Best Practices

### File Preparation

✅ **DO**:
- Use clear, consistent column headers
- Keep question text in a single column when possible
- Use standard formats for answer options (checkboxes, dropdowns)
- Remove excessive formatting and merged cells

❌ **AVOID**:
- Heavily merged cells (can confuse MarkItDown)
- Questions split across multiple non-adjacent cells
- Complex nested tables within questions
- Images or charts (not extracted by MarkItDown)

### Question Design

- **Clear phrasing**: Use question marks or imperative verbs
- **Explicit options**: List all answer choices clearly
- **Consistent formatting**: Use similar structures for similar question types
- **Unique identifiers**: Question codes or numbers help validation

## 🚀 Production Deployment

### Recommended Setup

```python
from excel_question_extraction_poc import BedrockQuestionExtractor, ExcelTextExtractor

class ProductionQuestionExtractor:
    def __init__(self):
        self.text_extractor = ExcelTextExtractor()
        self.bedrock = BedrockQuestionExtractor(
            region="us-west-2",
            model_id="arn:aws:bedrock:us-west-2::inference-profile/global.anthropic.claude-sonnet-4-20250514-v1:0"
        )
    
    async def extract(self, excel_file_path: str):
        # Extract markdown
        markdown_text = self.text_extractor.extract_markitdown_text(excel_file_path)
        
        # Extract questions via Bedrock
        result = await self.bedrock.extract_questions_from_text(markdown_text)
        
        return result
```

### Monitoring Recommendations

- **Success Rate**: Track % of successful extractions
- **Question Count**: Monitor average questions per file
- **Processing Time**: Alert if >3 minutes for any file
- **Token Usage**: Track for cost management
- **Error Types**: Categorize and monitor parsing failures

## 📞 Support & Contribution

### Known Limitations

- ⚠️ Max file size: ~50K characters (API token limits)
- ⚠️ Complex Excel layouts may need manual review
- ⚠️ Images and charts are not processed
- ⚠️ Merged cells can affect extraction accuracy

### Future Enhancements

- [ ] Batch processing for multiple files
- [ ] Question validation and scoring
- [ ] Support for additional output formats
- [ ] Real-time progress indicators
- [ ] Advanced error recovery mechanisms

---

*Last Updated: 2025-10-17*  
*POC Version: 2.0 - Ultra-Compact XML*  
*Contact: Swift Survey Development Team*
