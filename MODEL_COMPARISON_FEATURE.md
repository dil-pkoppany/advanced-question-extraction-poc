# Model Comparison Feature

## Overview

The Question Extraction Testing Framework now supports:
1. **Increased max tokens for Opus 4.5**: 24,576 tokens (up from 16,384)
2. **Model selection**: Choose between Claude Opus 4.5 and Claude Sonnet 4
3. **Model comparison**: Run extraction with both models simultaneously to compare results

## Changes Made

### Backend Changes

#### 1. Configuration (`backend/app/config.py`)
- **Increased max_tokens**: 16,384 → 24,576 (Opus 4.5 supports up to 32K, using 24K for safety)
- **Added model IDs**:
  - `bedrock_opus_model_id`: Claude Opus 4.5
  - `bedrock_sonnet_model_id`: Claude Sonnet 4
  - `bedrock_model_id`: Default model (Opus 4.5)

```python
# Available models for extraction
bedrock_opus_model_id: str = (
    "arn:aws:bedrock:us-west-2::inference-profile/"
    "global.anthropic.claude-opus-4-5-20250514-v1:0"
)
bedrock_sonnet_model_id: str = (
    "arn:aws:bedrock:us-west-2::inference-profile/"
    "global.anthropic.claude-sonnet-4-20250514-v1:0"
)

# LLM settings
max_tokens: int = 24576  # Opus 4.5 supports up to 32K, using 24K for safety
```

#### 2. Schemas (`backend/app/schemas/models.py`)
- **Added `ModelType` enum**: `opus-4.5`, `sonnet-4`
- **Updated `ExtractionConfig`**:
  - `model`: Select which model to use
  - `compare_models`: Boolean flag to run both models
- **Updated `ExtractionResult`**:
  - `model`: Track which model was used for each result

```python
class ModelType(str, Enum):
    """Available LLM models for extraction."""
    OPUS_4_5 = "opus-4.5"
    SONNET_4 = "sonnet-4"

class ExtractionConfig(BaseModel):
    # ... existing fields ...
    model: ModelType = Field(
        default=ModelType.OPUS_4_5, description="LLM model to use for extraction"
    )
    compare_models: bool = Field(
        default=False, description="Run with both models for comparison"
    )
```

#### 3. Extraction Route (`backend/app/routes/extraction.py`)
- **Model loop**: Runs extraction for each selected model
- **Result keys**: Format includes model name when comparing (e.g., `approach_1_opus_4_5`, `approach_1_sonnet_4`)
- **Service initialization**: Pass `model_id` to each service

```python
# Determine which models to run
models_to_run = []
if request.config.compare_models:
    models_to_run = [ModelType.OPUS_4_5, ModelType.SONNET_4]
else:
    models_to_run = [request.config.model]

# Run each approach with each model
for approach in approaches_to_run:
    for model in models_to_run:
        # Get model ID from settings
        if model == ModelType.OPUS_4_5:
            model_id = settings.bedrock_opus_model_id
            model_name = "opus-4.5"
        else:
            model_id = settings.bedrock_sonnet_model_id
            model_name = "sonnet-4"
        
        # Initialize service with model_id
        service = AutoExtractionService(model_id=model_id)
        result = await service.extract(file_path)
        result.model = model_name
```

#### 4. Service Classes
Updated all three approach services to accept `model_id` parameter:

**`approach_auto.py`** (Approach 1):
```python
def __init__(self, model_id: str | None = None):
    self.settings = get_settings()
    self.parser = ExcelParser()
    self.model_id = model_id or self.settings.bedrock_model_id
```

**`approach_guided.py`** (Approach 2):
```python
def __init__(self, model_id: str | None = None):
    self.settings = get_settings()
    self.parser = ExcelParser()
    self.model_id = model_id or self.settings.bedrock_model_id
```

**`approach_judge.py`** (Approach 3):
```python
def __init__(self, model_id: str | None = None):
    self.settings = get_settings()
    self.parser = ExcelParser()
    # For approach 3, we always use the judge model (Haiku)
    # This is intentional - approach 3 is about fast validation
    self.model_id = self.settings.bedrock_judge_model_id
```

### Frontend Changes

#### 1. Types (`frontend/src/types/index.ts`)
- **Added `ModelType`**: `'opus-4.5' | 'sonnet-4'`
- **Updated `ExtractionConfig`**:
  - `model`: ModelType
  - `compare_models`: boolean
- **Updated `ExtractionResult`**:
  - `model?`: string (optional model name)

#### 2. App Initialization (`frontend/src/App.tsx`)
```typescript
const initialConfig: ExtractionConfig = {
  approach: 1,
  run_all_approaches: false,
  column_mappings: [],
  question_types: [],
  model: 'opus-4.5',
  compare_models: false,
};
```

#### 3. Approach Selection Step (`frontend/src/components/Wizard/ApproachStep.tsx`)
Added new section for model selection:

```typescript
<h3>Model Selection</h3>
<div className="radio-group">
  <label className={`radio-option ${config.model === 'opus-4.5' ? 'selected' : ''}`}>
    <input type="radio" name="model" checked={config.model === 'opus-4.5'} />
    <div className="radio-option-content">
      <h4>Claude Opus 4.5</h4>
      <p>Most capable model with highest accuracy. Supports up to 24K output tokens.</p>
    </div>
  </label>
  <label className={`radio-option ${config.model === 'sonnet-4' ? 'selected' : ''}`}>
    <input type="radio" name="model" checked={config.model === 'sonnet-4'} />
    <div className="radio-option-content">
      <h4>Claude Sonnet 4</h4>
      <p>Balanced performance and speed. Good for most use cases.</p>
    </div>
  </label>
</div>

<label className={`radio-option ${config.compare_models ? 'selected' : ''}`}>
  <input type="checkbox" checked={config.compare_models} />
  <div className="radio-option-content">
    <h4>🔄 Compare Both Models</h4>
    <p>Run extraction with both Opus 4.5 and Sonnet 4 to compare quality, speed, and token usage.</p>
  </div>
</label>
```

#### 4. Results Display (`frontend/src/components/Wizard/ResultsStep.tsx`)
Added helper function to format result keys with model names:

```typescript
function formatResultKey(key: string, result?: ExtractionResult): string {
  // key format: "approach_1" or "approach_1_opus_4_5" or "approach_1_sonnet_4"
  const parts = key.split('_');
  const approachNum = parts[1];
  
  let label = `Approach ${approachNum}`;
  
  // Add model name if present in result or key
  if (result?.model) {
    label += ` (${result.model})`;
  } else if (parts.length > 2) {
    const modelParts = parts.slice(2);
    const modelName = modelParts.join('-').replace(/_/g, '.');
    label += ` (${modelName})`;
  }
  
  return label;
}
```

Updated all display locations to use `formatResultKey()`:
- Metrics comparison table headers
- Questions comparison grid headers
- Detail modal headers
- Individual view selector buttons

## Usage Examples

### Example 1: Single Model Extraction
1. Select **Approach 1** (or 2, or 3)
2. Choose **Claude Opus 4.5** as the model
3. Leave **Compare Both Models** unchecked
4. Run extraction

**Result**: Single result with Opus 4.5

### Example 2: Model Comparison
1. Select **Approach 2** (User-Guided)
2. Choose any model (doesn't matter when comparing)
3. Check **Compare Both Models**
4. Configure columns
5. Run extraction

**Result**: Two results side-by-side:
- `Approach 2 (opus-4.5)`
- `Approach 2 (sonnet-4)`

Compare:
- Question count
- Extraction time
- Token usage
- Accuracy
- Individual questions

### Example 3: Full Comparison (Approaches + Models)
1. Select any approach
2. Check **Run All Approaches for Comparison**
3. Check **Compare Both Models**
4. Configure columns (if needed)
5. Run extraction

**Result**: 6 results total (3 approaches × 2 models):
- `Approach 1 (opus-4.5)`
- `Approach 1 (sonnet-4)`
- `Approach 2 (opus-4.5)`
- `Approach 2 (sonnet-4)`
- `Approach 3 (opus-4.5)` (uses Haiku for judging)
- `Approach 3 (sonnet-4)` (uses Haiku for judging)

## Benefits

### 1. Quality Comparison
- Compare extraction quality between Opus 4.5 and Sonnet 4
- See which model better handles your specific document structure
- Identify edge cases where one model outperforms the other

### 2. Cost-Performance Trade-off
- Opus 4.5: Higher cost, better quality, more tokens
- Sonnet 4: Lower cost, faster, good balance
- Make informed decisions based on your use case

### 3. Token Usage Analysis
- See actual token consumption for each model
- Opus 4.5 can handle larger outputs (24K vs 8K)
- Optimize for your budget and requirements

### 4. Speed Comparison
- Compare inference times between models
- Sonnet 4 is typically faster
- Opus 4.5 may be worth the extra time for complex documents

## Technical Notes

### Approach 3 (Judge) Behavior
- Approach 3 always uses **Claude Haiku** as the judge model
- This is intentional - the judge only validates, doesn't extract
- When comparing models in Approach 3, the extraction is deterministic (same for both)
- The judge model validates both extractions equally
- This means Approach 3 results will be identical for both models (by design)

### Result Key Format
- Single model: `approach_{num}` (e.g., `approach_1`)
- Model comparison: `approach_{num}_{model}` (e.g., `approach_1_opus_4_5`)
- Underscores in model names replace dots/hyphens

### Max Tokens
- **Opus 4.5**: 24,576 output tokens (75% of 32K max for safety margin)
- **Sonnet 4**: 8,192 output tokens (default)
- **Haiku (Judge)**: 1,024 output tokens (validation only)

## Future Enhancements

Potential improvements:
1. Add more models (e.g., Claude 3.5 Sonnet)
2. Cost estimation per model
3. Token usage visualization
4. Model-specific prompt optimization
5. Automatic model selection based on document complexity
