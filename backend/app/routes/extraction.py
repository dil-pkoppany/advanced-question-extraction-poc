"""Extraction endpoints for running question extraction approaches."""

import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException

from ..config import get_settings
from ..schemas import (
    ExtractionConfig,
    ExtractionRequest,
    ExtractionResponse,
    ExtractionResult,
    RunMetadata,
    ComparisonResult,
    ModelType,
)
from ..services.approach_auto import AutoExtractionService
from ..services.approach_guided import GuidedExtractionService
from ..services.approach_judge import JudgeExtractionService
from ..evaluation.metrics import MetricsCalculator
from .upload import _get_original_filename

router = APIRouter(prefix="/extract", tags=["extraction"])


@router.post("/", response_model=ExtractionResponse)
async def run_extraction(request: ExtractionRequest) -> ExtractionResponse:
    """
    Run question extraction using the specified approach(es).

    Approaches:
    1. Auto LLM: Fully automatic extraction using LLM
    2. User-Guided: User provides column mappings, LLM extracts with context
    3. Deterministic + Judge: Parse deterministically, LLM scores confidence
    """
    settings = get_settings()

    # Find the uploaded file (exclude .meta.json files)
    matching_files = [
        f for f in settings.upload_dir.glob(f"{request.file_id}.*")
        if f.suffix.lower() in {'.xlsx', '.xls', '.xlsm', '.xltx', '.xltm', '.csv'}
    ]
    if not matching_files:
        raise HTTPException(status_code=404, detail="File not found")

    file_path = str(matching_files[0])

    # Generate run ID
    run_id = f"run_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}"

    # Determine which approaches to run
    approaches_to_run = []
    if request.config.run_all_approaches:
        approaches_to_run = [1, 2, 3]
    else:
        approaches_to_run = [request.config.approach]

    # Determine which models to run
    models_to_run = []
    if request.config.compare_models:
        models_to_run = [ModelType.OPUS_4_5, ModelType.SONNET_4_5]
    else:
        models_to_run = [request.config.model]

    # Validate config for approaches 2 and 3
    if request.config.approach in [2, 3] and not request.config.column_mappings:
        raise HTTPException(
            status_code=400,
            detail="Column mappings required for approaches 2 and 3",
        )

    results: dict[str, ExtractionResult] = {}

    # Run each approach with each model
    for approach in approaches_to_run:
        for model in models_to_run:
            # Get model ID from settings
            if model == ModelType.OPUS_4_5:
                model_id = settings.bedrock_opus_model_id
                model_name = "opus-4.5"
            else:
                model_id = settings.bedrock_sonnet_model_id
                model_name = "sonnet-4.5"
            
            try:
                if approach == 1:
                    service = AutoExtractionService(model_id=model_id)
                    result = await service.extract(file_path)
                elif approach == 2:
                    service = GuidedExtractionService(model_id=model_id)
                    result = await service.extract(
                        file_path,
                        column_mappings=request.config.column_mappings,
                        question_types=request.config.question_types,
                    )
                elif approach == 3:
                    service = JudgeExtractionService(model_id=model_id)
                    result = await service.extract(
                        file_path,
                        column_mappings=request.config.column_mappings,
                    )
                else:
                    continue

                result.model = model_name
                
                # Create unique key for approach+model combination
                if len(models_to_run) > 1:
                    key = f"approach_{approach}_{model_name.replace('.', '_').replace('-', '_')}"
                else:
                    key = f"approach_{approach}"
                
                results[key] = result

            except Exception as e:
                if len(models_to_run) > 1:
                    key = f"approach_{approach}_{model_name.replace('.', '_').replace('-', '_')}"
                else:
                    key = f"approach_{approach}"
                    
                results[key] = ExtractionResult(
                    approach=approach,
                    model=model_name,
                    success=False,
                    error=str(e),
                )

    # Calculate comparison if multiple approaches ran
    comparison = None
    if len(results) > 1:
        calculator = MetricsCalculator()
        comparison = calculator.compare_results(run_id, results)

    # Save run metadata and results
    await _save_run(run_id, request, results, comparison, settings)

    return ExtractionResponse(
        run_id=run_id,
        results=results,
        comparison=comparison,
    )


@router.get("/runs", response_model=list[RunMetadata])
async def list_runs() -> list[RunMetadata]:
    """List all extraction runs."""
    settings = get_settings()
    runs = []

    for run_dir in settings.runs_dir.iterdir():
        if run_dir.is_dir():
            metadata_file = run_dir / "metadata.json"
            if metadata_file.exists():
                import json

                data = json.loads(metadata_file.read_text())
                runs.append(RunMetadata(**data))

    # Sort by timestamp descending
    runs.sort(key=lambda r: r.timestamp, reverse=True)
    return runs


@router.get("/runs/{run_id}", response_model=ExtractionResponse)
async def get_run(run_id: str) -> ExtractionResponse:
    """Get details of a specific extraction run."""
    settings = get_settings()
    run_dir = settings.runs_dir / run_id

    if not run_dir.exists():
        raise HTTPException(status_code=404, detail="Run not found")

    import json

    # Load results
    results = {}
    for result_file in run_dir.glob("approach_*_result.json"):
        data = json.loads(result_file.read_text())
        approach_key = result_file.stem.replace("_result", "")
        results[approach_key] = ExtractionResult(**data)

    # Load comparison if exists
    comparison = None
    comparison_file = run_dir / "comparison.json"
    if comparison_file.exists():
        comparison = ComparisonResult(**json.loads(comparison_file.read_text()))

    return ExtractionResponse(
        run_id=run_id,
        results=results,
        comparison=comparison,
    )


async def _save_run(
    run_id: str,
    request: ExtractionRequest,
    results: dict[str, ExtractionResult],
    comparison: ComparisonResult | None,
    settings,
) -> None:
    """Save run results to disk."""
    import json

    run_dir = settings.runs_dir / run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    # Create prompts subdirectory
    prompts_dir = run_dir / "prompts"
    prompts_dir.mkdir(parents=True, exist_ok=True)

    # Get the original filename
    original_filename = _get_original_filename(request.file_id) or request.file_id

    # Save metadata
    metadata = RunMetadata(
        run_id=run_id,
        file_name=original_filename,
        file_id=request.file_id,
        approaches_run=[r.approach for r in results.values()],
        config=request.config.model_dump(),
    )
    (run_dir / "metadata.json").write_text(
        metadata.model_dump_json(indent=2)
    )

    # Save each approach result and its prompt
    for key, result in results.items():
        # Save the result JSON
        (run_dir / f"{key}_result.json").write_text(
            result.model_dump_json(indent=2)
        )
        
        # Save the prompt to a separate text file for easy review
        if result.prompt:
            prompt_file = prompts_dir / f"{key}_prompt.txt"
            prompt_header = f"""================================================================================
PROMPT FOR: {key}
Approach: {result.approach}
Model: {result.model or 'default'}
Success: {result.success}
Questions Extracted: {len(result.questions)}
================================================================================

"""
            prompt_file.write_text(prompt_header + result.prompt)

    # Save comparison if exists
    if comparison:
        (run_dir / "comparison.json").write_text(
            comparison.model_dump_json(indent=2)
        )
