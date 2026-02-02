"""Approach 1: Fully Automatic LLM Extraction.

This approach:
1. Converts Excel to Markdown using MarkItDown
2. Sends full content to LLM for question extraction
3. Parses XML response to extract questions

No user input required - baseline for comparison.
"""

import json
import logging
import time

import boto3
from botocore.config import Config
from bs4 import BeautifulSoup

from ..config import get_settings
from ..schemas import (
    ExtractedQuestion,
    ExtractionResult,
    ExtractionMetrics,
    QuestionType,
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

    async def extract(self, file_path: str) -> ExtractionResult:
        """
        Extract questions automatically using LLM.

        Args:
            file_path: Path to the Excel file

        Returns:
            ExtractionResult with questions and metrics
        """
        start_time = time.time()
        prompt = None  # Track prompt for saving even on failure

        try:
            # Step 1: Convert Excel to Markdown
            markdown_text = self.parser.convert_to_markdown(file_path)
            if not markdown_text:
                return ExtractionResult(
                    approach=1,
                    success=False,
                    error="Failed to convert Excel to Markdown",
                )

            # Step 2: Build prompt and call LLM
            prompt = self._build_prompt(markdown_text)
            llm_start = time.time()
            response = await self._invoke_llm(prompt)
            llm_time_ms = int((time.time() - llm_start) * 1000)

            # Step 3: Parse response
            questions = self._parse_response(response)

            total_time_ms = int((time.time() - start_time) * 1000)

            return ExtractionResult(
                approach=1,
                success=True,
                questions=questions,
                metrics=ExtractionMetrics(
                    extraction_count=len(questions),
                    llm_time_ms=llm_time_ms,
                    total_time_ms=total_time_ms,
                    tokens_input=len(prompt) // 4,  # Approximate
                    tokens_output=len(response) // 4,
                ),
                prompt=prompt,
                raw_response=response,
            )

        except Exception as e:
            logger.error(f"Auto extraction failed: {e}")
            return ExtractionResult(
                approach=1,
                success=False,
                error=str(e),
                prompt=prompt,
                metrics=ExtractionMetrics(
                    extraction_count=0,
                    total_time_ms=int((time.time() - start_time) * 1000),
                ),
            )

    def _build_prompt(self, content: str) -> str:
        """Build the extraction prompt."""
        return f"""Extract ALL questions from this survey content.

EXTRACTION RULES

ANALYZE THE STRUCTURE: Identify which columns contain main questions, subquestions (grouped follow-up items), and answer options (selectable choices).

EXTRACT EVERY QUESTION FULLY: Extract each question completely. This includes interrogative sentences (e.g., "How satisfied are you..."), imperative instructions (e.g., "List the main reasons..."), and any request for information.

ANSWER OPTIONS AND CHOICE TYPES: If a question includes predefined answer options (including Yes/No), list them after the question in parentheses, separated by "|".

If the question allows only one option to be selected, classify it as single_choice. If it allows multiple selections, classify it as multiple_choice.

GROUPED QUESTIONS: A grouped question is when a main question is followed by multiple related subquestions. Extract each combination as:
Main question:Subquestion

CATEGORIES:
- open_ended: No answer options and no subquestions
- single_choice: Has answer options, only one can be selected
- multiple_choice: Has answer options, multiple can be selected
- grouped_question: Has subquestions (even if answer options are also present)
- yes_no: Can only be answered with Yes or No

CONTENT:
{content}

OUTPUT FORMAT:
<questions>
  <q type="open_ended">Full question text</q>
  <q type="single_choice">Question? (Option A|Option B|Option C)</q>
  <q type="multiple_choice">Question? (Option A|Option B|Option C)</q>
  <q type="grouped_question">Question: subpart</q>
  <q type="yes_no">Question? (Yes|No)</q>
</questions>

RULES:
- Only include: question text + type attribute
- For grouped_question: "Parent question: Sub question" in text
- Embed answers in text with pipe separator: (A|B|C)
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

    def _parse_response(self, response_text: str) -> list[ExtractedQuestion]:
        """Parse XML response into questions."""
        questions = []

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

            for q in questions_tag.find_all("q"):
                question_text = q.get_text(strip=True)
                type_str = q.get("type", "open_ended")

                # Map type string to enum
                type_mapping = {
                    "open_ended": QuestionType.OPEN_ENDED,
                    "single_choice": QuestionType.SINGLE_CHOICE,
                    "multiple_choice": QuestionType.MULTIPLE_CHOICE,
                    "grouped_question": QuestionType.GROUPED_QUESTION,
                    "yes_no": QuestionType.YES_NO,
                }
                question_type = type_mapping.get(type_str, QuestionType.OPEN_ENDED)

                # Extract embedded answers from question text and clean the text
                answers = None
                clean_question_text = question_text
                if "(" in question_text and "|" in question_text:
                    # Find answers in parentheses
                    start = question_text.rfind("(")
                    end = question_text.rfind(")")
                    if start < end:
                        answers_str = question_text[start + 1 : end]
                        answers = [a.strip() for a in answers_str.split("|")]
                        # Remove the answers portion from question text
                        clean_question_text = question_text[:start].strip()

                questions.append(
                    ExtractedQuestion(
                        question_text=clean_question_text,
                        question_type=question_type,
                        answers=answers,
                    )
                )

            logger.info(f"Parsed {len(questions)} questions from XML")

        except Exception as e:
            logger.error(f"XML parsing error: {e}")

        return questions
