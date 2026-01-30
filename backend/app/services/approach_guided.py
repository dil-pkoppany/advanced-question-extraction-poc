"""Approach 2: User-Guided Extraction with LLM.

This approach:
1. User provides column mappings and question types
2. Count rows deterministically for validation
3. Build dynamic prompt with user context
4. LLM extracts with additional context
5. Compare extraction count vs row count

Provides better accuracy through user guidance.
"""

import json
import logging
import time

import boto3
from botocore.config import Config
from bs4 import BeautifulSoup

from ..config import get_settings
from ..schemas import (
    ColumnMapping,
    ExtractedQuestion,
    ExtractionResult,
    ExtractionMetrics,
    QuestionType,
)
from .excel_parser import ExcelParser

logger = logging.getLogger(__name__)


class GuidedExtractionService:
    """User-guided question extraction with LLM."""

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

    async def extract(
        self,
        file_path: str,
        column_mappings: list[ColumnMapping],
        question_types: list[QuestionType] | None = None,
    ) -> ExtractionResult:
        """
        Extract questions with user-provided guidance.

        Args:
            file_path: Path to the Excel file
            column_mappings: User-specified column mappings
            question_types: Expected question types (optional)

        Returns:
            ExtractionResult with questions, metrics, and accuracy
        """
        start_time = time.time()
        prompt = None  # Track prompt for saving even on failure

        try:
            # Step 1: Count expected rows (deterministic)
            expected_count = self.parser.count_rows_in_columns(file_path, column_mappings)
            logger.info(f"Expected question count from columns: {expected_count}")

            # Step 2: Convert Excel to Markdown
            markdown_text = self.parser.convert_to_markdown(file_path)
            if not markdown_text:
                return ExtractionResult(
                    approach=2,
                    success=False,
                    error="Failed to convert Excel to Markdown",
                )

            # Step 3: Build dynamic prompt with user context
            prompt = self._build_prompt(
                markdown_text,
                column_mappings,
                question_types,
                expected_count,
            )

            # Step 4: Call LLM
            llm_start = time.time()
            response = await self._invoke_llm(prompt)
            llm_time_ms = int((time.time() - llm_start) * 1000)

            # Step 5: Parse response
            questions = self._parse_response(response)

            # Step 6: Calculate accuracy
            accuracy = len(questions) / expected_count if expected_count > 0 else 0.0

            total_time_ms = int((time.time() - start_time) * 1000)

            return ExtractionResult(
                approach=2,
                success=True,
                questions=questions,
                metrics=ExtractionMetrics(
                    extraction_count=len(questions),
                    expected_count=expected_count,
                    accuracy=round(accuracy, 4),
                    llm_time_ms=llm_time_ms,
                    total_time_ms=total_time_ms,
                    tokens_input=len(prompt) // 4,
                    tokens_output=len(response) // 4,
                ),
                prompt=prompt,
                raw_response=response,
            )

        except Exception as e:
            logger.error(f"Guided extraction failed: {e}")
            return ExtractionResult(
                approach=2,
                success=False,
                error=str(e),
                prompt=prompt,
                metrics=ExtractionMetrics(
                    extraction_count=0,
                    total_time_ms=int((time.time() - start_time) * 1000),
                ),
            )

    def _build_prompt(
        self,
        content: str,
        column_mappings: list[ColumnMapping],
        question_types: list[QuestionType] | None,
        expected_count: int,
    ) -> str:
        """Build dynamic prompt with user-provided context."""
        # Build column context with per-sheet information
        column_context = "USER-PROVIDED STRUCTURE INFORMATION:\n"
        for mapping in column_mappings:
            column_context += f"\nSheet: {mapping.sheet_name}\n"
            column_context += f"  - Question column: {mapping.question_column}\n"
            if mapping.answer_column:
                column_context += f"  - Answer column: {mapping.answer_column}\n"
            if mapping.type_column:
                column_context += f"  - Type column: {mapping.type_column}\n"
            if mapping.question_types:
                types_str = ", ".join(t.value for t in mapping.question_types)
                column_context += f"  - Expected question types: {types_str}\n"
            column_context += f"  - Start extracting from row: {mapping.start_row} (first potential question row; skip any header/instruction rows above)\n"

        return f"""Extract ALL questions from this survey content.

{column_context}
EXPECTED COUNT: Approximately {expected_count} questions should be extracted.

EXTRACTION RULES

For each sheet listed above:
- Extract questions from the specified question column starting at the indicated row
- Use the answer column if specified to include answer options but try and find answer options even if the answer column is not specified
- Focus on the expected question types listed for each sheet (if provided)
- Some rows may contain instructions or non-question text - extract only actual questions

EXTRACT EVERY ROW: Starting from the specified start row in each sheet's question column, extract all questions.

ANSWER OPTIONS: If answers are in a separate column, include them after the question in parentheses, separated by "|".

CATEGORIES:
- open_ended: No answer options
- single_choice: Has answer options, only one can be selected
- multiple_choice: Has answer options, multiple can be selected
- grouped_question: Has subquestions
- yes_no: Yes/No only

CONTENT:
{content}

OUTPUT FORMAT:
<questions>
  <q type="open_ended">Full question text</q>
  <q type="single_choice">Question? (Option A|Option B)</q>
</questions>

IMPORTANT: Return ONLY the XML."""

    async def _invoke_llm(self, prompt: str) -> str:
        """Invoke Bedrock LLM."""
        payload = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": self.settings.max_tokens,
            "temperature": self.settings.temperature,
            "messages": [{"role": "user", "content": prompt}],
        }

        logger.info(f"Invoking Bedrock model (guided): {self.model_id}")

        response = self.bedrock.invoke_model(
            modelId=self.model_id,
            body=json.dumps(payload),
            contentType="application/json",
        )

        response_body = json.loads(response["body"].read())

        if "content" in response_body and len(response_body["content"]) > 0:
            return response_body["content"][0]["text"]

        raise Exception("No content in Bedrock response")

    def _parse_response(self, response_text: str) -> list[ExtractedQuestion]:
        """Parse XML response into questions."""
        questions = []

        try:
            xml_start = response_text.find("<questions>")
            xml_end = response_text.rfind("</questions>")

            if xml_start < 0:
                return questions

            if xml_end < 0:
                xml_text = response_text[xml_start:] + "</questions>"
            else:
                xml_text = response_text[xml_start : xml_end + len("</questions>")]

            soup = BeautifulSoup(xml_text, "xml")
            questions_tag = soup.find("questions")

            if not questions_tag:
                return questions

            for idx, q in enumerate(questions_tag.find_all("q")):
                question_text = q.get_text(strip=True)
                type_str = q.get("type", "open_ended")

                type_mapping = {
                    "open_ended": QuestionType.OPEN_ENDED,
                    "single_choice": QuestionType.SINGLE_CHOICE,
                    "multiple_choice": QuestionType.MULTIPLE_CHOICE,
                    "grouped_question": QuestionType.GROUPED_QUESTION,
                    "yes_no": QuestionType.YES_NO,
                }
                question_type = type_mapping.get(type_str, QuestionType.OPEN_ENDED)

                answers = None
                if "(" in question_text and "|" in question_text:
                    start = question_text.rfind("(")
                    end = question_text.rfind(")")
                    if start < end:
                        answers_str = question_text[start + 1 : end]
                        answers = [a.strip() for a in answers_str.split("|")]

                questions.append(
                    ExtractedQuestion(
                        question_text=question_text,
                        question_type=question_type,
                        answers=answers,
                        row_index=idx + 2,  # Approximate row (after header)
                    )
                )

            logger.info(f"Parsed {len(questions)} questions from guided extraction")

        except Exception as e:
            logger.error(f"XML parsing error: {e}")

        return questions
