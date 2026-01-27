"""Comparison endpoints for viewing extraction results."""

import json
from datetime import datetime

from fastapi import APIRouter, HTTPException

from ..config import get_settings
from ..schemas import ComparisonResult

router = APIRouter(prefix="/comparisons", tags=["comparisons"])


@router.get("/", response_model=list[ComparisonResult])
async def list_comparisons() -> list[ComparisonResult]:
    """List all comparison results."""
    settings = get_settings()
    comparisons = []

    for comp_file in settings.comparisons_dir.glob("*.json"):
        data = json.loads(comp_file.read_text())
        comparisons.append(ComparisonResult(**data))

    # Sort by timestamp descending
    comparisons.sort(key=lambda c: c.timestamp, reverse=True)
    return comparisons


@router.get("/{comparison_id}", response_model=ComparisonResult)
async def get_comparison(comparison_id: str) -> ComparisonResult:
    """Get a specific comparison result."""
    settings = get_settings()
    comp_file = settings.comparisons_dir / f"{comparison_id}.json"

    if not comp_file.exists():
        raise HTTPException(status_code=404, detail="Comparison not found")

    data = json.loads(comp_file.read_text())
    return ComparisonResult(**data)


@router.get("/by-run/{run_id}", response_model=ComparisonResult)
async def get_comparison_by_run(run_id: str) -> ComparisonResult:
    """Get comparison result for a specific run."""
    settings = get_settings()

    # Check if comparison exists in run directory
    run_dir = settings.runs_dir / run_id
    if not run_dir.exists():
        raise HTTPException(status_code=404, detail="Run not found")

    comparison_file = run_dir / "comparison.json"
    if not comparison_file.exists():
        raise HTTPException(
            status_code=404,
            detail="No comparison available for this run (single approach only)",
        )

    data = json.loads(comparison_file.read_text())
    return ComparisonResult(**data)
