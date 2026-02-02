"""Pydantic models for the Question Extraction Testing Framework."""

from datetime import datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class QuestionType(str, Enum):
    """Supported question types for extraction."""

    OPEN_ENDED = "open_ended"
    SINGLE_CHOICE = "single_choice"
    MULTIPLE_CHOICE = "multiple_choice"
    GROUPED_QUESTION = "grouped_question"
    YES_NO = "yes_no"
    NUMERIC = "numeric"  # For number inputs
    INTEGER = "integer"  # For whole numbers only
    DECIMAL = "decimal"  # For decimal numbers


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
    SONNET_4_5 = "sonnet-4.5"


class ExtractionConfig(BaseModel):
    """Configuration for running an extraction."""

    approach: Literal[1, 2, 3, 4] = Field(
        ..., description="Primary extraction approach (for backward compatibility)"
    )
    approaches: list[Literal[1, 2, 3, 4]] | None = Field(
        None, description="List of approaches to run for comparison"
    )
    column_mappings: list[ColumnMapping] | None = Field(
        None, description="Column mappings (required for approaches 2 and 3)"
    )
    question_types: list[QuestionType] | None = Field(
        None, description="Question types to extract (for approach 2)"
    )
    run_all_approaches: bool = Field(
        default=False, description="Run all approaches for comparison (deprecated, use approaches list)"
    )
    model: ModelType = Field(
        default=ModelType.OPUS_4_5, description="LLM model to use for extraction"
    )
    compare_models: bool = Field(
        default=False, description="Run with both models for comparison"
    )


class QuestionDependency(BaseModel):
    """Dependency information for conditional questions."""

    depends_on_question_id: str | None = Field(
        None, description="Reference to another question (by ID or row)"
    )
    depends_on_answer_value: str | None = Field(
        None, description="Specific answer value that triggers this dependency"
    )
    condition_type: Literal["equals", "contains", "not_empty"] = Field(
        default="equals", description="Type of condition to check"
    )
    dependency_action: Literal["show", "skip"] = Field(
        default="show", description="Show question if condition met, or skip if condition met"
    )
    original_text: str | None = Field(
        None, description="Original dependency description text from source"
    )


class ExtractedQuestion(BaseModel):
    """A single extracted question."""

    question_id: str | None = Field(
        None, description="Unique identifier (GUID) for this question. Used for dependency references."
    )
    question_text: str
    question_type: QuestionType
    answers: list[str] | None = Field(
        None, description="Answer options if applicable"
    )
    help_text: str | None = Field(
        None, description="Instructions/comments separated from question text (approach 4)"
    )
    conditional_inputs: dict[str, str] | None = Field(
        None, 
        description="Map of answer values to their conditional input requirements. "
        "Example: {'Yes': 'please provide detail'} means if user selects 'Yes', show a text input with this prompt."
    )
    dependencies: list[QuestionDependency] | None = Field(
        None, description="Dependency information for conditional questions (approach 4)"
    )
    confidence: float | None = Field(
        None, description="Confidence score (0-1) from LLM judge (approaches 3, 4)"
    )
    is_valid_question: bool | None = Field(
        None, description="Judge assessment: is this a real question? (approaches 3, 4)"
    )
    validation_issues: list[str] | None = Field(
        None, description="List of issues identified by judge (approach 4)"
    )
    row_index: int | None = Field(
        None, description="Source row in Excel (approaches 2, 3, 4)"
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
        None, description="Items below threshold (approaches 3, 4)"
    )
    # Pipeline-specific metrics (approach 4)
    structure_analysis_time_ms: int | None = Field(
        None, description="Step 1 duration (approach 4)"
    )
    coverage_validation_time_ms: int | None = Field(
        None, description="Step 2 duration (approach 4)"
    )
    extraction_time_ms: int | None = Field(
        None, description="Step 3 duration (approach 4)"
    )
    normalization_time_ms: int | None = Field(
        None, description="Step 4 duration (approach 4)"
    )
    final_validation_time_ms: int | None = Field(
        None, description="Step 5 duration (approach 4)"
    )
    total_llm_calls: int | None = Field(
        None, description="Total LLM invocations (approach 4)"
    )
    questions_marked_invalid: int | None = Field(
        None, description="Count marked as invalid but not filtered (approach 4)"
    )
    structure_confidence: float | None = Field(
        None, description="Confidence from structure analysis (approach 4)"
    )
    coverage_confidence: float | None = Field(
        None, description="Confidence from coverage validation (approach 4)"
    )
    show_dependencies_count: int | None = Field(
        None, description="Count of questions with show dependencies (approach 4)"
    )
    skip_dependencies_count: int | None = Field(
        None, description="Count of questions with skip dependencies (approach 4)"
    )


class ExtractionResult(BaseModel):
    """Result of a single extraction approach."""

    approach: int
    model: str | None = Field(None, description="Model used for extraction")
    success: bool
    error: str | None = None
    questions: list[ExtractedQuestion] = Field(default_factory=list)
    metrics: ExtractionMetrics | None = None
    prompt: str | None = Field(
        None, description="The full prompt sent to the LLM (with all values interpolated)"
    )
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


# Ground Truth models


class GroundTruthQuestion(BaseModel):
    """A single validated question in ground truth."""

    id: str = Field(..., description="User-assigned ID (e.g., Q001, Q002)")
    question_text: str = Field(..., description="The validated question text")
    question_type: QuestionType = Field(..., description="Question type")
    answers: list[str] | None = Field(
        None, description="Answer options if applicable"
    )
    row_index: int | None = Field(
        None, description="Optional reference to Excel row"
    )
    is_problematic: bool = Field(
        default=False, description="Whether this question is marked as problematic"
    )
    problematic_comment: str | None = Field(
        None, description="Optional comment explaining why question is problematic"
    )

    @field_validator("id", "question_text", mode="before")
    @classmethod
    def strip_whitespace(cls, v: str) -> str:
        """Strip leading/trailing whitespace from text fields."""
        if isinstance(v, str):
            return v.strip()
        return v

    @field_validator("answers", mode="before")
    @classmethod
    def strip_answers(cls, v: list[str] | None) -> list[str] | None:
        """Strip whitespace from answer options."""
        if v is not None:
            return [a.strip() for a in v if a.strip()]
        return v

    @field_validator("problematic_comment", mode="before")
    @classmethod
    def strip_comment(cls, v: str | None) -> str | None:
        """Strip whitespace from problematic comment."""
        if isinstance(v, str):
            stripped = v.strip()
            return stripped if stripped else None
        return v


class GroundTruthSheet(BaseModel):
    """A sheet containing validated questions."""

    sheet_name: str = Field(..., description="Name of the sheet")
    questions: list[GroundTruthQuestion] = Field(
        default_factory=list, description="Validated questions in this sheet"
    )

    @field_validator("sheet_name", mode="before")
    @classmethod
    def strip_sheet_name(cls, v: str) -> str:
        """Strip whitespace from sheet name."""
        if isinstance(v, str):
            return v.strip()
        return v


class GroundTruth(BaseModel):
    """Complete ground truth for an Excel file."""

    ground_truth_id: str = Field(..., description="Unique identifier")
    file_name: str = Field(..., description="Original Excel filename for matching")
    file_name_normalized: str = Field(
        ..., description="Lowercase, trimmed filename for fuzzy matching"
    )
    created_by: str = Field(..., description="Who created this ground truth")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    version: int = Field(default=1, description="Version number")
    notes: str | None = Field(None, description="Optional notes")
    sheets: list[GroundTruthSheet] = Field(
        default_factory=list, description="Sheets with validated questions"
    )
    total_question_count: int = Field(
        ..., description="Total count of all questions across sheets"
    )


class GroundTruthSummary(BaseModel):
    """Summary of a ground truth for list views."""

    ground_truth_id: str
    file_name: str
    created_by: str
    updated_at: datetime
    total_question_count: int


class GroundTruthCreate(BaseModel):
    """Request to create a new ground truth."""

    file_name: str = Field(..., description="Original Excel filename")
    created_by: str = Field(..., description="Creator's name or email")
    notes: str | None = Field(None, description="Optional notes")
    sheets: list[GroundTruthSheet] = Field(
        ..., description="Sheets with questions"
    )

    @field_validator("file_name", "created_by", mode="before")
    @classmethod
    def strip_whitespace(cls, v: str) -> str:
        """Strip whitespace from text fields."""
        if isinstance(v, str):
            return v.strip()
        return v

    @field_validator("notes", mode="before")
    @classmethod
    def strip_notes(cls, v: str | None) -> str | None:
        """Strip whitespace from notes."""
        if isinstance(v, str):
            return v.strip() or None
        return v


class GroundTruthUpdate(BaseModel):
    """Request to update an existing ground truth."""

    created_by: str | None = Field(None, description="Update creator")
    notes: str | None = Field(None, description="Update notes")
    sheets: list[GroundTruthSheet] | None = Field(
        None, description="Update sheets and questions"
    )


class GroundTruthComparisonResult(BaseModel):
    """Result of comparing extraction results against ground truth."""

    ground_truth_id: str
    ground_truth_file_name: str
    approach_key: str
    model: str | None = None

    # Counts
    ground_truth_count: int = Field(..., description="Total questions in ground truth")
    extracted_count: int = Field(..., description="Total questions extracted")

    # Matching results
    exact_matches: int = Field(0, description="Questions matching exactly")
    fuzzy_matches: int = Field(0, description="Questions matching with >80% similarity")
    missed_questions: int = Field(0, description="Ground truth questions not found")
    extra_questions: int = Field(0, description="Extracted questions not in ground truth")

    # Scores (0.0 - 1.0)
    precision: float = Field(0.0, description="exact_matches / extracted_count")
    recall: float = Field(0.0, description="exact_matches / ground_truth_count")
    f1_score: float = Field(0.0, description="Harmonic mean of precision and recall")

    # Details
    matched_questions: list[str] = Field(
        default_factory=list, description="List of matched question IDs"
    )
    missed_question_ids: list[str] = Field(
        default_factory=list, description="Ground truth question IDs not found"
    )
