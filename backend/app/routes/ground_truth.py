"""Ground Truth CRUD API endpoints."""

import json
import logging
import uuid
from datetime import datetime
from difflib import SequenceMatcher
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..config import get_settings
from ..schemas import (
    ExtractionResult,
    GroundTruth,
    GroundTruthComparisonResult,
    GroundTruthCreate,
    GroundTruthSummary,
    GroundTruthUpdate,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ground-truth", tags=["ground-truth"])


def _generate_ground_truth_id() -> str:
    """Generate a unique ground truth ID."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    unique_id = uuid.uuid4().hex[:8]
    return f"gt_{timestamp}_{unique_id}"


def _normalize_filename(filename: str) -> str:
    """Normalize filename for matching (lowercase, trimmed)."""
    return filename.lower().strip()


def _get_ground_truth_path(ground_truth_id: str) -> Path:
    """Get the file path for a ground truth JSON file."""
    settings = get_settings()
    return settings.ground_truth_dir / f"{ground_truth_id}.json"


def _load_ground_truth(ground_truth_id: str) -> GroundTruth | None:
    """Load a ground truth from disk."""
    file_path = _get_ground_truth_path(ground_truth_id)
    if not file_path.exists():
        return None
    try:
        data = json.loads(file_path.read_text())
        return GroundTruth(**data)
    except Exception as e:
        logger.error(f"Failed to load ground truth {ground_truth_id}: {e}")
        return None


def _save_ground_truth(ground_truth: GroundTruth) -> None:
    """Save a ground truth to disk."""
    file_path = _get_ground_truth_path(ground_truth.ground_truth_id)
    file_path.write_text(ground_truth.model_dump_json(indent=2))


def _list_all_ground_truths() -> list[GroundTruth]:
    """List all ground truths from disk."""
    settings = get_settings()
    ground_truths = []
    
    for file_path in settings.ground_truth_dir.glob("gt_*.json"):
        try:
            data = json.loads(file_path.read_text())
            ground_truths.append(GroundTruth(**data))
        except Exception as e:
            logger.error(f"Failed to load {file_path}: {e}")
    
    # Sort by updated_at descending
    ground_truths.sort(key=lambda x: x.updated_at, reverse=True)
    return ground_truths


@router.post("/", response_model=GroundTruth)
async def create_ground_truth(data: GroundTruthCreate) -> GroundTruth:
    """
    Create a new ground truth.
    
    The ground truth is tied to an Excel filename and contains
    validated questions organized by sheet.
    """
    # Calculate total question count
    total_count = sum(len(sheet.questions) for sheet in data.sheets)
    
    # Create ground truth object
    ground_truth = GroundTruth(
        ground_truth_id=_generate_ground_truth_id(),
        file_name=data.file_name,
        file_name_normalized=_normalize_filename(data.file_name),
        created_by=data.created_by,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
        version=1,
        notes=data.notes,
        sheets=data.sheets,
        total_question_count=total_count,
    )
    
    # Save to disk
    _save_ground_truth(ground_truth)
    logger.info(f"Created ground truth {ground_truth.ground_truth_id} for {data.file_name}")
    
    return ground_truth


@router.get("/", response_model=list[GroundTruthSummary])
async def list_ground_truths() -> list[GroundTruthSummary]:
    """
    List all ground truths.
    
    Returns summaries (not full question data) for efficiency.
    """
    ground_truths = _list_all_ground_truths()
    
    return [
        GroundTruthSummary(
            ground_truth_id=gt.ground_truth_id,
            file_name=gt.file_name,
            created_by=gt.created_by,
            updated_at=gt.updated_at,
            total_question_count=gt.total_question_count,
        )
        for gt in ground_truths
    ]


@router.get("/{ground_truth_id}", response_model=GroundTruth)
async def get_ground_truth(ground_truth_id: str) -> GroundTruth:
    """
    Get a specific ground truth by ID.
    
    Returns full data including all questions.
    """
    ground_truth = _load_ground_truth(ground_truth_id)
    
    if not ground_truth:
        raise HTTPException(status_code=404, detail="Ground truth not found")
    
    return ground_truth


@router.put("/{ground_truth_id}", response_model=GroundTruth)
async def update_ground_truth(
    ground_truth_id: str,
    data: GroundTruthUpdate,
) -> GroundTruth:
    """
    Update an existing ground truth.
    
    Only provided fields are updated. Version is incremented automatically.
    """
    ground_truth = _load_ground_truth(ground_truth_id)
    
    if not ground_truth:
        raise HTTPException(status_code=404, detail="Ground truth not found")
    
    # Update fields if provided
    if data.file_name is not None:
        ground_truth.file_name = data.file_name
        ground_truth.file_name_normalized = _normalize_filename(data.file_name)
    
    if data.created_by is not None:
        ground_truth.created_by = data.created_by
    
    if data.notes is not None:
        ground_truth.notes = data.notes
    
    if data.sheets is not None:
        ground_truth.sheets = data.sheets
        ground_truth.total_question_count = sum(
            len(sheet.questions) for sheet in data.sheets
        )
    
    # Update metadata
    ground_truth.updated_at = datetime.utcnow()
    ground_truth.version += 1
    
    # Save to disk
    _save_ground_truth(ground_truth)
    logger.info(f"Updated ground truth {ground_truth_id} to version {ground_truth.version}")
    
    return ground_truth


@router.delete("/{ground_truth_id}")
async def delete_ground_truth(ground_truth_id: str) -> dict:
    """
    Delete a ground truth.
    
    This permanently removes the ground truth file.
    """
    file_path = _get_ground_truth_path(ground_truth_id)
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Ground truth not found")
    
    try:
        file_path.unlink()
        logger.info(f"Deleted ground truth {ground_truth_id}")
        return {"message": "Ground truth deleted", "ground_truth_id": ground_truth_id}
    except Exception as e:
        logger.error(f"Failed to delete ground truth {ground_truth_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete: {e}")


@router.get("/by-filename/{filename:path}", response_model=GroundTruth | None)
async def get_ground_truth_by_filename(filename: str) -> GroundTruth | None:
    """
    Find a ground truth by Excel filename.
    
    Uses normalized filename matching (case-insensitive).
    Returns None if no matching ground truth exists.
    """
    normalized = _normalize_filename(filename)
    ground_truths = _list_all_ground_truths()
    
    for gt in ground_truths:
        if gt.file_name_normalized == normalized:
            return gt
    
    return None


def _normalize_question_text(text: str) -> str:
    """Normalize question text for comparison."""
    # Lowercase, strip whitespace, remove extra spaces
    return " ".join(text.lower().strip().split())


def _text_similarity(text1: str, text2: str) -> float:
    """Calculate similarity ratio between two texts."""
    return SequenceMatcher(None, text1, text2).ratio()


def _compare_with_ground_truth(
    ground_truth: GroundTruth,
    extraction_result: ExtractionResult,
    approach_key: str,
) -> GroundTruthComparisonResult:
    """
    Compare extraction result with ground truth.
    
    Uses exact and fuzzy text matching to find matches.
    """
    # Collect all ground truth questions
    gt_questions = []
    for sheet in ground_truth.sheets:
        for q in sheet.questions:
            gt_questions.append({
                "id": q.id,
                "text": _normalize_question_text(q.question_text),
                "original": q.question_text,
            })
    
    # Collect extracted questions
    extracted_questions = [
        {
            "text": _normalize_question_text(q.question_text),
            "original": q.question_text,
        }
        for q in extraction_result.questions
    ]
    
    # Match questions
    exact_matches = 0
    fuzzy_matches = 0
    matched_gt_ids = []
    matched_extracted_indices = set()
    
    # First pass: exact matches
    for gt_q in gt_questions:
        for idx, ext_q in enumerate(extracted_questions):
            if idx in matched_extracted_indices:
                continue
            if gt_q["text"] == ext_q["text"]:
                exact_matches += 1
                matched_gt_ids.append(gt_q["id"])
                matched_extracted_indices.add(idx)
                break
    
    # Second pass: fuzzy matches (>80% similarity)
    fuzzy_threshold = 0.8
    for gt_q in gt_questions:
        if gt_q["id"] in matched_gt_ids:
            continue
        for idx, ext_q in enumerate(extracted_questions):
            if idx in matched_extracted_indices:
                continue
            similarity = _text_similarity(gt_q["text"], ext_q["text"])
            if similarity >= fuzzy_threshold:
                fuzzy_matches += 1
                matched_gt_ids.append(gt_q["id"])
                matched_extracted_indices.add(idx)
                break
    
    # Calculate metrics
    total_matches = exact_matches + fuzzy_matches
    ground_truth_count = len(gt_questions)
    extracted_count = len(extracted_questions)
    
    missed = ground_truth_count - total_matches
    extra = extracted_count - len(matched_extracted_indices)
    
    precision = total_matches / extracted_count if extracted_count > 0 else 0.0
    recall = total_matches / ground_truth_count if ground_truth_count > 0 else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0
    
    # Find missed question IDs
    missed_ids = [q["id"] for q in gt_questions if q["id"] not in matched_gt_ids]
    
    return GroundTruthComparisonResult(
        ground_truth_id=ground_truth.ground_truth_id,
        ground_truth_file_name=ground_truth.file_name,
        approach_key=approach_key,
        model=extraction_result.model,
        ground_truth_count=ground_truth_count,
        extracted_count=extracted_count,
        exact_matches=exact_matches,
        fuzzy_matches=fuzzy_matches,
        missed_questions=missed,
        extra_questions=extra,
        precision=round(precision, 4),
        recall=round(recall, 4),
        f1_score=round(f1, 4),
        matched_questions=matched_gt_ids,
        missed_question_ids=missed_ids,
    )


class CompareRequest(BaseModel):
    """Request to compare extraction results with ground truth."""
    results: dict[str, ExtractionResult]


@router.post("/compare/{filename:path}", response_model=dict[str, GroundTruthComparisonResult])
async def compare_with_ground_truth(
    filename: str,
    request: CompareRequest,
) -> dict[str, GroundTruthComparisonResult]:
    """
    Compare extraction results with ground truth for a file.
    
    Returns comparison metrics for each approach in the results.
    Returns empty dict if no ground truth exists for the filename.
    """
    # Find ground truth
    normalized = _normalize_filename(filename)
    ground_truths = _list_all_ground_truths()
    
    ground_truth = None
    for gt in ground_truths:
        if gt.file_name_normalized == normalized:
            ground_truth = gt
            break
    
    if not ground_truth:
        return {}
    
    # Compare each approach
    comparisons = {}
    for approach_key, result in request.results.items():
        if result.success and result.questions:
            comparisons[approach_key] = _compare_with_ground_truth(
                ground_truth, result, approach_key
            )
    
    return comparisons
