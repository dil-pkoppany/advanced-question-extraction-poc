"""Optional DeepEval integration for LLM quality metrics.

This module provides advanced evaluation metrics using DeepEval 3.x,
including relevancy, faithfulness, and custom question completeness metrics.

Install deepeval to use: pip install deepeval>=3.8.0
"""

import logging
from typing import Any

from ..schemas import ExtractedQuestion, ExtractionResult

logger = logging.getLogger(__name__)

# Check if deepeval is available
DEEPEVAL_AVAILABLE = False
try:
    from deepeval import evaluate
    from deepeval.test_case import LLMTestCase
    from deepeval.metrics import (
        AnswerRelevancyMetric,
        FaithfulnessMetric,
    )
    DEEPEVAL_AVAILABLE = True
except ImportError:
    logger.info("DeepEval not installed. Optional evaluation metrics unavailable.")


class DeepEvalRunner:
    """Run DeepEval metrics on extraction results."""

    def __init__(self, model: str = "gpt-4"):
        """
        Initialize DeepEval runner.

        Args:
            model: Model to use for evaluation (default: gpt-4)
        """
        if not DEEPEVAL_AVAILABLE:
            raise ImportError(
                "DeepEval is not installed. Install with: pip install deepeval>=3.8.0"
            )
        self.model = model

    def evaluate_extraction(
        self,
        result: ExtractionResult,
        source_content: str,
    ) -> dict[str, Any]:
        """
        Evaluate extraction quality using DeepEval metrics.

        Args:
            result: Extraction result to evaluate
            source_content: Original Excel content (markdown format)

        Returns:
            Dictionary with evaluation scores
        """
        if not result.success or not result.questions:
            return {"error": "No questions to evaluate"}

        scores = {
            "relevancy_scores": [],
            "faithfulness_scores": [],
            "overall_relevancy": 0.0,
            "overall_faithfulness": 0.0,
        }

        # Sample questions for evaluation (max 20 to avoid high costs)
        sample_questions = result.questions[:20]

        for question in sample_questions:
            try:
                # Create test case
                test_case = LLMTestCase(
                    input=source_content[:5000],  # Truncate for token limits
                    actual_output=question.question_text,
                    context=[source_content[:5000]],
                )

                # Run relevancy metric
                relevancy_metric = AnswerRelevancyMetric(
                    threshold=0.5,
                    model=self.model,
                )
                relevancy_metric.measure(test_case)
                scores["relevancy_scores"].append(relevancy_metric.score)

                # Run faithfulness metric
                faithfulness_metric = FaithfulnessMetric(
                    threshold=0.5,
                    model=self.model,
                )
                faithfulness_metric.measure(test_case)
                scores["faithfulness_scores"].append(faithfulness_metric.score)

            except Exception as e:
                logger.warning(f"Failed to evaluate question: {e}")
                continue

        # Calculate averages
        if scores["relevancy_scores"]:
            scores["overall_relevancy"] = sum(scores["relevancy_scores"]) / len(
                scores["relevancy_scores"]
            )
        if scores["faithfulness_scores"]:
            scores["overall_faithfulness"] = sum(scores["faithfulness_scores"]) / len(
                scores["faithfulness_scores"]
            )

        return scores

    def evaluate_question_completeness(
        self,
        question: ExtractedQuestion,
    ) -> dict[str, Any]:
        """
        Custom metric: Check if question has required components.

        Args:
            question: Extracted question to evaluate

        Returns:
            Completeness score and details
        """
        score = 0.0
        details = {
            "has_question_text": False,
            "has_type": False,
            "has_answers_if_needed": False,
        }

        # Check question text
        if question.question_text and len(question.question_text.strip()) > 10:
            score += 0.4
            details["has_question_text"] = True

        # Check type
        if question.question_type:
            score += 0.3
            details["has_type"] = True

        # Check answers for choice questions
        needs_answers = question.question_type in [
            "single_choice",
            "multiple_choice",
            "yes_no",
        ]
        if needs_answers:
            if question.answers and len(question.answers) >= 2:
                score += 0.3
                details["has_answers_if_needed"] = True
        else:
            # Open-ended doesn't need answers
            score += 0.3
            details["has_answers_if_needed"] = True

        return {
            "completeness_score": score,
            "details": details,
        }


def run_deepeval_batch(
    results: dict[str, ExtractionResult],
    source_content: str,
) -> dict[str, Any]:
    """
    Run DeepEval on multiple extraction results.

    Args:
        results: Dictionary of approach results
        source_content: Original content

    Returns:
        Evaluation results per approach
    """
    if not DEEPEVAL_AVAILABLE:
        return {"error": "DeepEval not available"}

    runner = DeepEvalRunner()
    evaluations = {}

    for key, result in results.items():
        try:
            evaluations[key] = runner.evaluate_extraction(result, source_content)
        except Exception as e:
            evaluations[key] = {"error": str(e)}

    return evaluations
