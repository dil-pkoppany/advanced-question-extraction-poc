# Ticket: Extraction Configuration

## Title

**Create ExtractionConfig Pydantic Settings Class**

---

## Type

Sub-task

## Priority

Medium

## Labels

- `backend`
- `configuration`

## Parent Ticket

LLM Question Extraction (see `JIRA_LLM_QUESTION_EXTRACTION.md`)

---

## Description

Create a Pydantic settings class that centralizes the technical configuration for the LLM question extraction pipeline. This `ExtractionConfig` class contains the approach selection, model-level configuration (model ID, tokens, temperature), preprocessing toggles, and operational settings (timeouts, retries).

### Config Class Design

A single `ExtractionConfig(BaseSettings)` class with all fields:

```python
# config/extraction_config.py

from pydantic import Field
from pydantic_settings import BaseSettings
from typing import Literal, Optional


class ExtractionConfig(BaseSettings):
    """
    Configuration for the LLM question extraction pipeline.

    All fields can be overridden via environment variables with EXTRACTION_ prefix.
    Example: EXTRACTION_MODEL_ID=anthropic.claude-sonnet-4-5-20250929-v1:0

    Note: Feature toggle (enabled/require_review) is managed via AppSettings
    and the LaunchDarkly feature flag, not in this config.
    """

    model_config = {"env_prefix": "EXTRACTION_"}

    # --- Approach selection ---
    approach: Literal["auto", "pipeline"] = Field(
        default="auto",
        description=(
            "'auto' = Approach 1 (MarkItDown + per-sheet LLM). "
            "'pipeline' = Approach 4 (structure analysis + filtered extraction). "
            "Start with 'auto'; switch to 'pipeline' if accuracy needs improvement."
        )
    )

    # --- Model configuration (Approach 1 uses these directly) ---
    model_id: str = Field(
        default="anthropic.claude-sonnet-4-5-20250929-v1:0",
        description="Bedrock model ID for question extraction"
    )
    inference_profile_arn: Optional[str] = Field(
        default=None,
        description="Optional inference profile ARN for cost/performance optimization"
    )
    max_output_tokens: int = Field(
        default=32768,
        description="Maximum tokens in LLM response"
    )
    temperature: float = Field(
        default=0.1,
        ge=0.0,
        le=1.0,
        description="LLM temperature (0.0 = deterministic, 1.0 = creative)"
    )

    # --- Preprocessing ---
    checkbox_preprocessing_enabled: bool = Field(
        default=True,
        description=(
            "Extract checkbox labels from VML drawings before MarkItDown conversion. "
            "Only applies to .xlsx files with embedded checkboxes."
        )
    )

    # --- Global settings ---
    extraction_timeout_seconds: int = Field(
        default=300,
        description="Maximum time for entire extraction pipeline in seconds"
    )
    max_retries: int = Field(
        default=3,
        description="Number of retries on LLM failure per sheet"
    )
    save_intermediate_results: bool = Field(
        default=True,
        description="Whether to save intermediate XML/JSON for debugging"
    )
    intermediate_results_bucket: Optional[str] = Field(
        default=None,
        description="S3 bucket for intermediate results (optional, local if not set)"
    )

    # --- Reserved for Approach 4 (not used in initial implementation) ---
    # When upgrading to Approach 4, add per-step model configs here:
    # step1_model_id: str (structure analysis model)
    # step1_max_output_tokens: int
    # step1_temperature: float
    # step2_model_id: str (coverage validation model)
    # step2_max_output_tokens: int
    # step2_temperature: float
    # step3_model_id: str (question extraction model)
    # step3_max_output_tokens: int
    # step3_temperature: float
```

### Usage Example

```python
from config.extraction_config import extraction_config

class AutoExtractionStrategy:
    async def extract(self, file_path: str, run_id: str | None = None) -> ExtractionResult:
        response = await self._invoke_llm(
            prompt=self._build_prompt(sheet_content, sheet_name),
            model_id=extraction_config.model_id,
            max_tokens=extraction_config.max_output_tokens,
            temperature=extraction_config.temperature,
            inference_profile_arn=extraction_config.inference_profile_arn,
        )
        return self._parse_response(response)
```

---

## Acceptance Criteria

### Config Class

- [ ] Single `ExtractionConfig` class created extending `pydantic_settings.BaseSettings`
- [ ] Contains approach selection: `approach` (Literal `"auto"` | `"pipeline"`, default `"auto"`)
- [ ] Contains model configuration fields (flattened, not nested):
  - `model_id` (str, default: Sonnet 4.5 model ID)
  - `inference_profile_arn` (Optional[str], default: None)
  - `max_output_tokens` (int, default: 32768)
  - `temperature` (float, default: 0.1, range 0.0-1.0)
- [ ] Contains preprocessing toggle: `checkbox_preprocessing_enabled` (bool, default: `True`)
- [ ] Contains global settings: `extraction_timeout_seconds` (int, default: 300), `max_retries` (int, default: 3), `save_intermediate_results` (bool, default: `True`), `intermediate_results_bucket` (Optional[str])
- [ ] All fields can be overridden via environment variables with `EXTRACTION_` prefix
- [ ] Comments document reserved fields for future Approach 4 per-step configs
- [ ] Singleton/cached instance pattern provided (e.g., module-level instance or `@lru_cache` getter)

### Validation

- [ ] `temperature` is validated to be between 0.0 and 1.0
- [ ] `approach` only accepts `"auto"` or `"pipeline"`
- [ ] `max_output_tokens` is a positive integer
- [ ] `extraction_timeout_seconds` is a positive integer

### Tests

- [ ] Unit test: config loads with all defaults correctly
- [ ] Unit test: environment variable overrides work (e.g., `EXTRACTION_MODEL_ID=...`)
- [ ] Unit test: invalid values are rejected (e.g., `temperature=2.0`, `approach="invalid"`)
- [ ] Unit test: optional fields accept `None` correctly

### Out of Scope

- Using the config in services/orchestrator — separate ticket
- Database migrations — see `TICKET_DB_MIGRATION_AND_MODELS.md`
- Feature flag setup — see `TICKET_FEATURE_FLAG.md`

---

## Technical Notes

- Follow the existing pattern from `backend/app/config.py` which uses `pydantic_settings.BaseSettings` with `env_prefix`
- The config file should be placed where the enterprise project keeps its config (e.g., `config/extraction_config.py` or alongside the existing settings)
- Feature toggle (`enabled`, `require_review`) is managed via AppSettings and the LaunchDarkly feature flag -- not part of this config class
- When Approach 4 is needed in the future, per-step model configs will be added as additional flat fields (e.g., `step1_model_id`, `step1_temperature`) rather than nested objects, keeping the env var override pattern simple

---

## Related Documents

- `LLM_EXTRACTION_IMPLEMENTATION_PLAN.md` — Pydantic Configuration section
- `JIRA_LLM_QUESTION_EXTRACTION.md` — Parent Jira ticket (Configuration acceptance criteria)
- `backend/app/config.py` — Existing config pattern reference
