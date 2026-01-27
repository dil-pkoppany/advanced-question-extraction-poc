"""Pydantic models for the Question Extraction Testing Framework."""

from datetime import datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field


class QuestionType(str, Enum):
    """Supported question types for extraction."""

    OPEN_ENDED = "open_ended"
    SINGLE_CHOICE = "single_choice"
    MULTIPLE_CHOICE = "multiple_choice"
    GROUPED_QUESTION = "grouped_question"
    YES_NO = "yes_no"


class ColumnMapping(BaseModel):
    """Configuration for mapping Excel columns to question fields."""

    sheet_name: str = Field(..., description="Name of the Excel sheet")
    question_column: str = Field(..., description="Column containing question text")
    answer_column: str | None = Field(
        None, description="Column containing answer options (if applicable)"
    )
    type_column: str | None = Field(
        None, description="Column containing question type (if available)"
    )
    question_types: list[QuestionType] = Field(
        default_factory=list,
        description="Expected question types in this sheet",
    )
    start_row: int = Field(
        default=2, description="First row containing data (1-indexed, after header)"
    )
    end_row: int | None = Field(
        None, description="Last row to process (None = all rows)"
    )


class SheetMetadata(BaseModel):
    """Metadata about an Excel sheet."""

    name: str
    columns: list[str]
    row_count: int
    sample_data: list[dict[str, Any]] = Field(
        default_factory=list, description="First few rows as sample"
    )


class FileMetadata(BaseModel):
    """Metadata about an uploaded Excel file."""

    file_id: str
    file_name: str
    file_size: int
    sheets: list[SheetMetadata]
    upload_timestamp: datetime = Field(default_factory=datetime.utcnow)


class ModelType(str, Enum):
    """Available LLM models for extraction."""

    OPUS_4_5 = "opus-4.5"
    SONNET_4 = "sonnet-4"


class ExtractionConfig(BaseModel):
    """Configuration for running an extraction."""

    approach: Literal[1, 2, 3] = Field(
        ..., description="Extraction approach to use (1=auto, 2=guided, 3=judge)"
    )
    column_mappings: list[ColumnMapping] | None = Field(
        None, description="Column mappings (required for approaches 2 and 3)"
    )
    question_types: list[QuestionType] | None = Field(
        None, description="Question types to extract (for approach 2)"
    )
    run_all_approaches: bool = Field(
        default=False, description="Run all approaches for comparison"
    )
    model: ModelType = Field(
        default=ModelType.OPUS_4_5, description="LLM model to use for extraction"
    )
    compare_models: bool = Field(
        default=False, description="Run with both models for comparison"
    )


class ExtractedQuestion(BaseModel):
    """A single extracted question."""

    question_text: str
    question_type: QuestionType
    answers: list[str] | None = Field(
        None, description="Answer options if applicable"
    )
    confidence: float | None = Field(
        None, description="Confidence score (0-1) from LLM judge (approach 3)"
    )
    is_valid_question: bool | None = Field(
        None, description="Judge assessment: is this a real question?"
    )
    row_index: int | None = Field(
        None, description="Source row in Excel (approaches 2, 3)"
    )
    sheet_name: str | None = Field(None, description="Source sheet name")


class ExtractionMetrics(BaseModel):
    """Metrics for an extraction run."""

    extraction_count: int = Field(..., description="Total questions extracted")
    expected_count: int | None = Field(
        None, description="Expected count from row count (approaches 2, 3)"
    )
    accuracy: float | None = Field(
        None, description="extraction_count / expected_count"
    )
    llm_time_ms: int | None = Field(None, description="LLM call duration in ms")
    total_time_ms: int = Field(..., description="Total processing time in ms")
    tokens_input: int | None = Field(None, description="Input tokens used")
    tokens_output: int | None = Field(None, description="Output tokens used")
    avg_confidence: float | None = Field(
        None, description="Mean confidence (approach 3)"
    )
    low_confidence_count: int | None = Field(
        None, description="Items below threshold (approach 3)"
    )


class ExtractionResult(BaseModel):
    """Result of a single extraction approach."""

    approach: int
    model: str | None = Field(None, description="Model used for extraction")
    success: bool
    error: str | None = None
    questions: list[ExtractedQuestion] = Field(default_factory=list)
    metrics: ExtractionMetrics | None = None
    raw_response: str | None = Field(
        None, description="Raw LLM response for debugging"
    )


class RunMetadata(BaseModel):
    """Metadata for an extraction run."""

    run_id: str
    file_name: str
    file_id: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    approaches_run: list[int]
    config: dict[str, Any] = Field(default_factory=dict)


class ComparisonResult(BaseModel):
    """Comparison of multiple extraction approaches."""

    comparison_id: str
    run_id: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    results: dict[str, ExtractionResult]
    winner: dict[str, int] = Field(
        default_factory=dict,
        description="Best approach by different criteria",
    )


# API Request/Response models


class UploadResponse(BaseModel):
    """Response from file upload endpoint."""

    file_id: str
    file_name: str
    metadata: FileMetadata


class ExtractionRequest(BaseModel):
    """Request to run extraction."""

    file_id: str
    config: ExtractionConfig


class ExtractionResponse(BaseModel):
    """Response from extraction endpoint."""

    run_id: str
    results: dict[str, ExtractionResult]
    comparison: ComparisonResult | None = None
