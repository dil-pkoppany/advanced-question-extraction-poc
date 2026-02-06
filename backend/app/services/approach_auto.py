"""Approach 1: Fully Automatic LLM Extraction.

This approach:
1. Converts Excel to Markdown using MarkItDown
2. Splits into per-sheet chunks to avoid output token truncation
3. Sends each sheet to LLM for question extraction
4. Combines and parses XML responses to extract questions

No user input required - baseline for comparison.
"""

import json
import logging
import re
import time
from pathlib import Path

import boto3
from botocore.config import Config
from bs4 import BeautifulSoup

from ..config import get_settings
from ..schemas import (
    ExtractedQuestion,
    ExtractionResult,
    ExtractionMetrics,
    QuestionType,
    QuestionDependency,
)
from .excel_parser import ExcelParser

logger = logging.getLogger(__name__)


class AutoExtractionService:
    """Fully automatic question extraction using LLM."""

    def __init__(self, model_id: str | None = None):
        self.settings = get_settings()
        self.parser = ExcelParser()
        self.model_id = model_id or self.settings.bedrock_model_id

        # Initialize Bedrock client
        config = Config(
            read_timeout=600,
            connect_timeout=60,
            retries={"max_attempts": 3, "mode": "adaptive"},
        )
        self.bedrock = boto3.client(
            "bedrock-runtime",
            region_name=self.settings.aws_region,
            config=config,
        )

    def _split_markdown_by_sheet(self, markdown_text: str) -> list[dict[str, str]]:
        """Split MarkItDown output into per-sheet chunks.

        MarkItDown produces markdown with ``## SheetName`` headers separating
        each Excel sheet. This method splits the full markdown into individual
        sheet sections so each can be processed by the LLM independently,
        avoiding output token truncation on large multi-sheet files.

        Returns:
            List of dicts with ``sheet_name`` and ``content`` keys.
        """
        # Match sheet headers produced by MarkItDown (## SheetName at line start)
        sheet_pattern = re.compile(r'^## (.+)$', re.MULTILINE)
        matches = list(sheet_pattern.finditer(markdown_text))

        if not matches:
            # No sheet headers found (single sheet or CSV) — return as one chunk
            return [{"sheet_name": "Sheet1", "content": markdown_text}]

        sheets: list[dict[str, str]] = []
        for i, match in enumerate(matches):
            sheet_name = match.group(1).strip()
            start = match.end()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(markdown_text)
            content = markdown_text[start:end].strip()

            if content:
                sheets.append({"sheet_name": sheet_name, "content": content})

        logger.info(f"Split markdown into {len(sheets)} sheet chunks")
        return sheets

    async def extract(self, file_path: str, run_id: str | None = None) -> ExtractionResult:
        """
        Extract questions automatically using LLM.

        Converts the file to markdown and processes each sheet independently
        to avoid hitting the LLM output token limit on large multi-sheet files.

        Args:
            file_path: Path to the Excel file
            run_id: Optional run ID for saving intermediate results

        Returns:
            ExtractionResult with questions and metrics
        """
        start_time = time.time()
        intermediate_dir = None
        total_llm_calls = 0
        total_tokens_in = 0
        total_tokens_out = 0

        try:
            # Create intermediate results directory if run_id provided
            if run_id:
                run_dir = self.settings.runs_dir / run_id
                run_dir.mkdir(parents=True, exist_ok=True)
                intermediate_dir = run_dir / "intermediate_results"
                intermediate_dir.mkdir(parents=True, exist_ok=True)

            # Step 1: Convert Excel to Markdown
            markdown_text = self.parser.convert_to_markdown(file_path)
            if not markdown_text:
                return ExtractionResult(
                    approach=1,
                    success=False,
                    error="Failed to convert Excel to Markdown",
                )

            # Save full markdown content for debugging
            if intermediate_dir:
                markdown_file = intermediate_dir / "excel_as_markdown.md"
                markdown_file.write_text(markdown_text)

            # Step 2: Split into per-sheet chunks
            sheet_chunks = self._split_markdown_by_sheet(markdown_text)
            logger.info(
                f"Processing {len(sheet_chunks)} sheet(s) individually to avoid output truncation"
            )

            # Step 3: Process each sheet independently
            all_questions: list[ExtractedQuestion] = []
            llm_start = time.time()

            for chunk_idx, chunk in enumerate(sheet_chunks):
                sheet_name = chunk["sheet_name"]
                sheet_content = chunk["content"]
                batch_num = chunk_idx + 1

                logger.info(
                    f"Processing sheet {batch_num}/{len(sheet_chunks)}: '{sheet_name}' "
                    f"({len(sheet_content)} chars)"
                )

                # Build prompt for this sheet
                prompt = self._build_prompt(sheet_content, sheet_name=sheet_name)
                total_tokens_in += len(prompt) // 4

                # Save prompt
                if intermediate_dir:
                    prompt_file = intermediate_dir / f"approach_1_sheet_{batch_num}_prompt.txt"
                    prompt_file.write_text(prompt)

                # Call LLM
                response = await self._invoke_llm(prompt)
                total_llm_calls += 1
                total_tokens_out += len(response) // 4

                # Save raw response
                if intermediate_dir:
                    response_file = (
                        intermediate_dir / f"approach_1_sheet_{batch_num}_response.xml"
                    )
                    response_file.write_text(response)

                # Parse response and inject sheet_name
                sheet_questions = self._parse_response(response, sheet_name=sheet_name)
                logger.info(
                    f"Sheet '{sheet_name}': extracted {len(sheet_questions)} questions"
                )
                all_questions.extend(sheet_questions)

            llm_time_ms = int((time.time() - llm_start) * 1000)

            # Save combined parsed questions
            if intermediate_dir:
                questions_file = intermediate_dir / "approach_1_parsed_questions.json"
                questions_file.write_text(
                    json.dumps(
                        [q.model_dump() for q in all_questions], indent=2, default=str
                    )
                )

            total_time_ms = int((time.time() - start_time) * 1000)

            # Calculate dependency counts
            show_deps_count = sum(
                1
                for q in all_questions
                if q.dependencies
                and any(d.dependency_action == "show" for d in q.dependencies)
            )
            skip_deps_count = sum(
                1
                for q in all_questions
                if q.dependencies
                and any(d.dependency_action == "skip" for d in q.dependencies)
            )

            return ExtractionResult(
                approach=1,
                success=True,
                questions=all_questions,
                metrics=ExtractionMetrics(
                    extraction_count=len(all_questions),
                    llm_time_ms=llm_time_ms,
                    total_time_ms=total_time_ms,
                    total_llm_calls=total_llm_calls,
                    tokens_input=total_tokens_in,
                    tokens_output=total_tokens_out,
                    show_dependencies_count=show_deps_count,
                    skip_dependencies_count=skip_deps_count,
                ),
            )

        except Exception as e:
            logger.error(f"Auto extraction failed: {e}", exc_info=True)

            # Save error details if we have intermediate_dir
            if intermediate_dir:
                error_file = intermediate_dir / "error.txt"
                error_file.write_text(f"Error: {str(e)}")

            return ExtractionResult(
                approach=1,
                success=False,
                error=str(e),
                metrics=ExtractionMetrics(
                    extraction_count=0,
                    total_time_ms=int((time.time() - start_time) * 1000),
                ),
            )

    def _build_prompt(self, content: str, sheet_name: str | None = None) -> str:
        """Build the extraction prompt with rich output format.

        Args:
            content: Markdown content to extract questions from.
            sheet_name: Optional sheet name for per-sheet context.
        """
        sheet_context = ""
        if sheet_name:
            sheet_context = f" from the sheet '{sheet_name}'"

        return f"""Extract ALL questions{sheet_context} from this survey content.

EXTRACTION RULES

1. ANALYZE THE STRUCTURE: Identify which columns/sections contain questions, answer options, and instructions.

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

5. DETECT CONDITIONAL INPUTS:
   - If an answer option requires additional input (e.g., "Yes (please provide detail)"), extract the instruction
   - Put in <conditional_inputs> with the answer value as attribute

6. DETECT FOLLOW-UP QUESTIONS AND DEPENDENCIES:
   - Text patterns indicating follow-ups: "If you can not...", "If no...", "If not...", "Please explain...", "Please detail...", "If applicable..."
   - When detected, create a dependency to the PREVIOUS question using its seq number
   - Dependency actions:
     - "show": Question appears only if condition is met (e.g., follow-up shown when main question answered "No")
     - "skip": Question is skipped if condition is met

7. QUESTION TYPES:
   - yes_no: EXACTLY 2 options that are simple "Yes"/"No" or "True"/"False"
   - single_choice: Multiple options but only one can be selected (includes expanded Yes/No like "Yes, option A" | "Yes, option B" | "No")
   - multiple_choice: Multiple options and multiple can be selected (checkboxes)
   - open_ended: No predefined answer options, free text input
   - numeric: Number input (any number)
   - integer: Whole numbers only
   - decimal: Decimal numbers
   - grouped_question: Parent question with subquestions

8. SEQUENCE NUMBERS:
   - Assign sequential numbers (seq="1", seq="2", etc.) to each question
   - Use these for dependency references

CONTENT:
{content}

OUTPUT FORMAT:
<questions>
  <q type="yes_no" seq="1">
    <text>Do you have sustainability certifications?</text>
    <help_text></help_text>
    <answers><option>Yes</option><option>No</option></answers>
    <conditional_inputs><input answer="Yes">please provide certification details</input></conditional_inputs>
    <dependencies></dependencies>
  </q>
  <q type="open_ended" seq="2">
    <text>If you do not have certifications, please explain why.</text>
    <help_text></help_text>
    <answers></answers>
    <dependencies>
      <depends_on question_seq="1" answer_value="No" action="show"/>
    </dependencies>
  </q>
  <q type="single_choice" seq="3">
    <text>Has your company been audited by an independent external auditor?</text>
    <help_text>If yes, please upload the audit report</help_text>
    <answers>
      <option>Yes, virtual audit</option>
      <option>Yes, on-site audit</option>
      <option>No audit yet/I don't know</option>
    </answers>
    <dependencies></dependencies>
  </q>
  <q type="multiple_choice" seq="4">
    <text>Does your company have any of the following certifications?</text>
    <help_text>Select all that apply</help_text>
    <answers>
      <option>Environmental certifications (ISO 50001, ISO 14001, EMAS)</option>
      <option>Labor and human rights certifications</option>
      <option>Business ethics certification(s)</option>
    </answers>
    <dependencies></dependencies>
  </q>
  <q type="grouped_question" seq="5">
    <text>Rate your satisfaction: Customer service</text>
    <help_text></help_text>
    <answers>
      <option>Very satisfied</option>
      <option>Satisfied</option>
      <option>Neutral</option>
      <option>Dissatisfied</option>
    </answers>
    <dependencies></dependencies>
  </q>
</questions>

RULES:
- Assign sequential seq numbers starting from 1
- Put question text in <text>, NOT as element content
- Put each answer option in separate <option> tags
- For grouped_question: combine as "Parent question: Sub question" in <text>
- Always include all XML elements even if empty
- Return ONLY the XML, nothing else

Extract ALL questions. Return ONLY the XML."""

    async def _invoke_llm(self, prompt: str) -> str:
        """Invoke Bedrock LLM."""
        payload = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": self.settings.max_tokens,
            "temperature": self.settings.temperature,
            "messages": [{"role": "user", "content": prompt}],
        }

        logger.info(f"Invoking Bedrock model: {self.model_id}")
        logger.info(f"Prompt length: {len(prompt)} characters")

        response = self.bedrock.invoke_model(
            modelId=self.model_id,
            body=json.dumps(payload),
            contentType="application/json",
        )

        response_body = json.loads(response["body"].read())

        if "content" in response_body and len(response_body["content"]) > 0:
            return response_body["content"][0]["text"]

        raise Exception("No content in Bedrock response")

    def _parse_response(
        self, response_text: str, sheet_name: str | None = None
    ) -> list[ExtractedQuestion]:
        """Parse XML response into questions with GUID generation and dependency resolution.
        
        Uses a two-pass approach like Approach 4:
        1. First pass: Create questions with GUIDs and build seq->GUID mapping
        2. Second pass: Resolve dependency references from seq numbers to GUIDs

        Args:
            response_text: Raw XML response from the LLM.
            sheet_name: Optional sheet name to inject into each question.
        """
        import uuid
        
        questions: list[ExtractedQuestion] = []
        # Map seq number -> question_id (GUID) for dependency resolution
        seq_to_guid: dict[str, str] = {}
        # Store raw dependency data for second pass
        raw_dependencies: dict[int, list[dict]] = {}

        try:
            # Find XML content
            xml_start = response_text.find("<questions>")
            xml_end = response_text.rfind("</questions>")

            if xml_start < 0:
                logger.warning("No <questions> tag found in response")
                return questions

            # Handle incomplete XML
            if xml_end < 0:
                logger.warning("Incomplete XML - attempting recovery")
                xml_text = response_text[xml_start:] + "</questions>"
            else:
                xml_text = response_text[xml_start : xml_end + len("</questions>")]

            # Parse with BeautifulSoup
            soup = BeautifulSoup(xml_text, "xml")
            questions_tag = soup.find("questions")

            if not questions_tag:
                return questions

            # Type mapping including new types
            type_mapping = {
                "open_ended": QuestionType.OPEN_ENDED,
                "single_choice": QuestionType.SINGLE_CHOICE,
                "multiple_choice": QuestionType.MULTIPLE_CHOICE,
                "grouped_question": QuestionType.GROUPED_QUESTION,
                "yes_no": QuestionType.YES_NO,
                "numeric": QuestionType.NUMERIC,
                "integer": QuestionType.INTEGER,
                "decimal": QuestionType.DECIMAL,
            }

            # First pass: create questions with GUIDs and build seq->GUID mapping
            for q_tag in questions_tag.find_all("q"):
                # Get sequence number
                seq = q_tag.get("seq", "")
                
                # Get question text from <text> element (new format)
                text_tag = q_tag.find("text")
                if text_tag:
                    question_text = text_tag.get_text(strip=True)
                else:
                    # Fallback to old format (text directly in <q>)
                    question_text = q_tag.get_text(strip=True)
                    # If we have nested elements, the text might be concatenated - skip if too long
                    if len(question_text) > 500:
                        continue
                
                if not question_text:
                    continue
                
                type_str = q_tag.get("type", "open_ended")
                question_type = type_mapping.get(type_str, QuestionType.OPEN_ENDED)
                
                # Get help text
                help_text_tag = q_tag.find("help_text")
                help_text = help_text_tag.get_text(strip=True) if help_text_tag else None
                if help_text == "":
                    help_text = None
                
                # Get answers from <answers><option> elements (new format)
                answers = None
                answers_tag = q_tag.find("answers")
                if answers_tag:
                    options = answers_tag.find_all("option")
                    if options:
                        answers = [opt.get_text(strip=True) for opt in options if opt.get_text(strip=True)]
                
                # Fallback: extract embedded answers from question text (old format)
                if not answers and "(" in question_text and "|" in question_text:
                    start = question_text.rfind("(")
                    end = question_text.rfind(")")
                    if start < end:
                        answers_str = question_text[start + 1 : end]
                        answers = [a.strip() for a in answers_str.split("|")]
                        question_text = question_text[:start].strip()
                
                # Get conditional inputs
                conditional_inputs = None
                cond_inputs_tag = q_tag.find("conditional_inputs")
                if cond_inputs_tag:
                    input_tags = cond_inputs_tag.find_all("input")
                    if input_tags:
                        conditional_inputs = {}
                        for input_tag in input_tags:
                            answer_value = input_tag.get("answer", "").strip()
                            input_prompt = input_tag.get_text(strip=True)
                            if answer_value and input_prompt:
                                conditional_inputs[answer_value] = input_prompt
                        if not conditional_inputs:
                            conditional_inputs = None
                
                # Generate GUID for this question
                question_id = str(uuid.uuid4())
                
                # Store seq -> GUID mapping for dependency resolution
                if seq:
                    seq_to_guid[seq] = question_id
                
                # Store raw dependencies for second pass
                deps_tag = q_tag.find("dependencies")
                if deps_tag:
                    raw_deps = []
                    for dep_tag in deps_tag.find_all("depends_on"):
                        raw_seq = dep_tag.get("question_seq", "")
                        raw_deps.append({
                            "raw_seq": raw_seq,
                            "answer_value": dep_tag.get("answer_value"),
                            "condition_type": dep_tag.get("condition_type", "equals"),
                            "action": dep_tag.get("action", "show"),
                            "original_text": dep_tag.get("original_text"),
                        })
                    if raw_deps:
                        raw_dependencies[len(questions)] = raw_deps
                
                questions.append(
                    ExtractedQuestion(
                        question_id=question_id,
                        question_text=question_text,
                        question_type=question_type,
                        answers=answers if answers else None,
                        help_text=help_text,
                        conditional_inputs=conditional_inputs,
                        dependencies=None,  # Will be set in second pass
                        sheet_name=sheet_name,
                    )
                )
            
            # Second pass: resolve dependencies using GUIDs
            for q_idx, raw_deps in raw_dependencies.items():
                dependencies = []
                for raw_dep in raw_deps:
                    raw_seq = raw_dep["raw_seq"]
                    
                    # Resolve seq to GUID if found, otherwise keep the raw reference
                    resolved_id = seq_to_guid.get(raw_seq, raw_seq)
                    
                    dep = QuestionDependency(
                        depends_on_question_id=resolved_id,
                        depends_on_answer_value=raw_dep["answer_value"],
                        condition_type=raw_dep["condition_type"],
                        dependency_action=raw_dep["action"],
                        original_text=raw_dep["original_text"],
                    )
                    dependencies.append(dep)
                
                if dependencies:
                    questions[q_idx].dependencies = dependencies

            logger.info(f"Parsed {len(questions)} questions from XML")

        except Exception as e:
            logger.error(f"XML parsing error: {e}", exc_info=True)

        return questions
