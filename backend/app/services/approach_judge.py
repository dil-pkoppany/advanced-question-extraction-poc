"""Approach 3: Deterministic Parsing + LLM-as-Judge.

This approach:
1. User provides column mappings
2. Parse all rows deterministically (no LLM for extraction)
3. Run small/fast LLM-as-judge on each item for confidence scoring
4. Return results with confidence scores for user review

Fastest approach with quality validation.
"""

import json
import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import boto3
from botocore.config import Config

from ..config import get_settings
from ..schemas import (
    ColumnMapping,
    ExtractedQuestion,
    ExtractionResult,
    ExtractionMetrics,
)
from .excel_parser import ExcelParser

logger = logging.getLogger(__name__)


class JudgeExtractionService:
    """Deterministic extraction with LLM-as-judge validation."""

    def __init__(self, model_id: str | None = None):
        self.settings = get_settings()
        self.parser = ExcelParser()
        # For approach 3, we always use the judge model (Haiku) regardless of model_id param
        # This is intentional - approach 3 is about fast validation, not extraction quality
        self.model_id = self.settings.bedrock_judge_model_id

        # Initialize Bedrock client for judge model
        config = Config(
            read_timeout=60,
            connect_timeout=30,
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
    ) -> ExtractionResult:
        """
        Extract questions deterministically and validate with LLM judge.

        Args:
            file_path: Path to the Excel file
            column_mappings: User-specified column mappings

        Returns:
            ExtractionResult with questions, confidence scores, and metrics
        """
        start_time = time.time()

        try:
            # Step 1: Deterministic extraction from columns
            questions = self.parser.extract_rows_by_columns(file_path, column_mappings)
            logger.info(f"Deterministically extracted {len(questions)} questions")

            if not questions:
                return ExtractionResult(
                    approach=3,
                    success=False,
                    error="No questions found in specified columns",
                )

            # Step 2: Run LLM judge on each question (batched)
            llm_start = time.time()
            judged_questions = await self._judge_questions(questions)
            llm_time_ms = int((time.time() - llm_start) * 1000)

            # Step 3: Calculate metrics
            confidences = [
                q.confidence for q in judged_questions if q.confidence is not None
            ]
            avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0
            low_conf_count = sum(
                1 for c in confidences if c < self.settings.confidence_threshold
            )

            total_time_ms = int((time.time() - start_time) * 1000)

            return ExtractionResult(
                approach=3,
                success=True,
                questions=judged_questions,
                metrics=ExtractionMetrics(
                    extraction_count=len(judged_questions),
                    expected_count=len(questions),
                    accuracy=1.0,  # Deterministic = 100% row coverage
                    llm_time_ms=llm_time_ms,
                    total_time_ms=total_time_ms,
                    avg_confidence=round(avg_confidence, 4),
                    low_confidence_count=low_conf_count,
                ),
            )

        except Exception as e:
            logger.error(f"Judge extraction failed: {e}")
            return ExtractionResult(
                approach=3,
                success=False,
                error=str(e),
                metrics=ExtractionMetrics(
                    extraction_count=0,
                    total_time_ms=int((time.time() - start_time) * 1000),
                ),
            )

    async def _judge_questions(
        self,
        questions: list[ExtractedQuestion],
    ) -> list[ExtractedQuestion]:
        """
        Run LLM judge on questions in batches.

        Uses a smaller/faster model for efficiency.
        """
        batch_size = 10
        judged = []

        for i in range(0, len(questions), batch_size):
            batch = questions[i : i + batch_size]
            batch_results = await self._judge_batch(batch)
            judged.extend(batch_results)

        return judged

    async def _judge_batch(
        self,
        questions: list[ExtractedQuestion],
    ) -> list[ExtractedQuestion]:
        """Judge a batch of questions."""
        prompt = self._build_judge_prompt(questions)

        try:
            response = await self._invoke_judge(prompt)
            scores = self._parse_judge_response(response, len(questions))

            # Apply scores to questions
            for idx, question in enumerate(questions):
                if idx < len(scores):
                    question.confidence = scores[idx]["confidence"]
                    question.is_valid_question = scores[idx]["is_valid"]
                else:
                    question.confidence = 0.5
                    question.is_valid_question = True

            return questions

        except Exception as e:
            logger.error(f"Judge batch failed: {e}")
            # Return with default confidence
            for question in questions:
                question.confidence = 0.5
                question.is_valid_question = True
            return questions

    def _build_judge_prompt(self, questions: list[ExtractedQuestion]) -> str:
        """Build prompt for LLM judge."""
        questions_text = ""
        for idx, q in enumerate(questions):
            answers_str = f" Answers: {', '.join(q.answers)}" if q.answers else ""
            questions_text += f"{idx + 1}. {q.question_text}{answers_str}\n"

        return f"""You are a question quality validator. For each item below, assess:
1. Is this a valid survey question? (not a comment, instruction, or header)
2. How confident are you that this is a properly formatted question? (0.0-1.0)

Items to evaluate:
{questions_text}

Respond in JSON format:
{{
  "evaluations": [
    {{"item": 1, "is_valid": true, "confidence": 0.95, "reason": "Clear question with options"}},
    {{"item": 2, "is_valid": false, "confidence": 0.2, "reason": "This is a section header, not a question"}}
  ]
}}

Evaluate ALL {len(questions)} items. Return ONLY the JSON."""

    async def _invoke_judge(self, prompt: str) -> str:
        """Invoke the judge model (smaller/faster)."""
        payload = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": self.settings.judge_max_tokens,
            "temperature": self.settings.judge_temperature,
            "messages": [{"role": "user", "content": prompt}],
        }

        logger.info(f"Invoking judge model: {self.model_id}")

        response = self.bedrock.invoke_model(
            modelId=self.model_id,
            body=json.dumps(payload),
            contentType="application/json",
        )

        response_body = json.loads(response["body"].read())

        if "content" in response_body and len(response_body["content"]) > 0:
            return response_body["content"][0]["text"]

        raise Exception("No content in judge response")

    def _parse_judge_response(
        self,
        response_text: str,
        expected_count: int,
    ) -> list[dict]:
        """Parse judge response into scores."""
        scores = []

        try:
            # Find JSON in response
            json_start = response_text.find("{")
            json_end = response_text.rfind("}") + 1

            if json_start >= 0 and json_end > json_start:
                json_text = response_text[json_start:json_end]
                data = json.loads(json_text)

                if "evaluations" in data:
                    for eval_item in data["evaluations"]:
                        scores.append({
                            "confidence": float(eval_item.get("confidence", 0.5)),
                            "is_valid": bool(eval_item.get("is_valid", True)),
                        })

        except Exception as e:
            logger.error(f"Failed to parse judge response: {e}")

        # Fill missing scores with defaults
        while len(scores) < expected_count:
            scores.append({"confidence": 0.5, "is_valid": True})

        return scores
