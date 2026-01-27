"""Metrics calculation and comparison logic."""

import json
import logging
from datetime import datetime

from ..config import get_settings
from ..schemas import ComparisonResult, ExtractionResult

logger = logging.getLogger(__name__)


class MetricsCalculator:
    """Calculate and compare extraction metrics."""

    def __init__(self):
        self.settings = get_settings()

    def compare_results(
        self,
        run_id: str,
        results: dict[str, ExtractionResult],
    ) -> ComparisonResult:
        """
        Compare results from multiple extraction approaches.

        Determines winners by different criteria:
        - by_count: Most questions extracted
        - by_accuracy: Highest accuracy (if available)
        - by_speed: Fastest total time
        - by_confidence: Highest average confidence (approach 3)
        """
        comparison_id = f"cmp_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

        winner = {}

        # Find winner by count
        max_count = 0
        for key, result in results.items():
            if result.success and result.metrics:
                if result.metrics.extraction_count > max_count:
                    max_count = result.metrics.extraction_count
                    winner["by_count"] = result.approach

        # Find winner by accuracy
        max_accuracy = 0.0
        for key, result in results.items():
            if result.success and result.metrics and result.metrics.accuracy:
                if result.metrics.accuracy > max_accuracy:
                    max_accuracy = result.metrics.accuracy
                    winner["by_accuracy"] = result.approach

        # Find winner by speed
        min_time = float("inf")
        for key, result in results.items():
            if result.success and result.metrics:
                if result.metrics.total_time_ms < min_time:
                    min_time = result.metrics.total_time_ms
                    winner["by_speed"] = result.approach

        # Find winner by confidence (only approach 3 has this)
        max_confidence = 0.0
        for key, result in results.items():
            if result.success and result.metrics and result.metrics.avg_confidence:
                if result.metrics.avg_confidence > max_confidence:
                    max_confidence = result.metrics.avg_confidence
                    winner["by_confidence"] = result.approach

        comparison = ComparisonResult(
            comparison_id=comparison_id,
            run_id=run_id,
            results=results,
            winner=winner,
        )

        # Save comparison to file
        self._save_comparison(comparison)

        return comparison

    def _save_comparison(self, comparison: ComparisonResult) -> None:
        """Save comparison result to file."""
        comp_file = self.settings.comparisons_dir / f"{comparison.comparison_id}.json"
        comp_file.write_text(comparison.model_dump_json(indent=2))
        logger.info(f"Saved comparison to {comp_file}")

    def calculate_summary_stats(
        self,
        results: dict[str, ExtractionResult],
    ) -> dict:
        """Calculate summary statistics across all approaches."""
        stats = {
            "total_approaches": len(results),
            "successful_approaches": sum(1 for r in results.values() if r.success),
            "total_questions_extracted": {},
            "timing": {},
        }

        for key, result in results.items():
            if result.success and result.metrics:
                stats["total_questions_extracted"][key] = result.metrics.extraction_count
                stats["timing"][key] = {
                    "total_ms": result.metrics.total_time_ms,
                    "llm_ms": result.metrics.llm_time_ms,
                }

        return stats
