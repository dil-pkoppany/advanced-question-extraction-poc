/** Question types supported by the extraction system */
export type QuestionType =
  | 'open_ended'
  | 'single_choice'
  | 'multiple_choice'
  | 'grouped_question'
  | 'yes_no'
  | 'numeric'
  | 'integer'
  | 'decimal';

/** Column mapping configuration */
export interface ColumnMapping {
  sheet_name: string;
  question_column: string;
  answer_column?: string;
  type_column?: string;
  question_types: QuestionType[];
  start_row: number;
  end_row?: number;
}

/** Metadata for a single Excel sheet */
export interface SheetMetadata {
  name: string;
  columns: string[];
  row_count: number;
  sample_data: Record<string, string | null>[];
}

/** Metadata for an uploaded file */
export interface FileMetadata {
  file_id: string;
  file_name: string;
  file_size: number;
  sheets: SheetMetadata[];
  upload_timestamp: string;
}

/** Upload response from the API */
export interface UploadResponse {
  file_id: string;
  file_name: string;
  metadata: FileMetadata;
}

/** Available LLM models */
export type ModelType = 'opus-4.5' | 'sonnet-4.5';

/** Extraction configuration */
export interface ExtractionConfig {
  approach: 1 | 2 | 3 | 4;  // Primary approach (for backward compatibility)
  approaches: (1 | 2 | 3 | 4)[];  // Selected approaches to run
  column_mappings?: ColumnMapping[];
  question_types?: QuestionType[];
  run_all_approaches: boolean;  // Kept for backward compatibility
  model: ModelType;
  compare_models: boolean;
}

/** Dependency information for conditional questions */
export interface QuestionDependency {
  depends_on_question_id?: string;
  depends_on_answer_value?: string;
  condition_type?: 'equals' | 'contains' | 'not_empty';
  dependency_action?: 'show' | 'skip';
  original_text?: string;
}

/** A single extracted question */
export interface ExtractedQuestion {
  question_id?: string;  // Unique GUID for this question (approach 4), used for dependency references
  question_text: string;
  question_type: QuestionType;
  answers?: string[];
  help_text?: string;
  conditional_inputs?: Record<string, string>; // Map of answer value to conditional input prompt
  dependencies?: QuestionDependency[];
  confidence?: number;
  is_valid_question?: boolean;
  validation_issues?: string[];
  row_index?: number;
  sheet_name?: string;
  is_problematic?: boolean;
  problematic_comment?: string;
}

/** Metrics for an extraction run */
export interface ExtractionMetrics {
  extraction_count: number;
  expected_count?: number;
  accuracy?: number;
  llm_time_ms?: number;
  total_time_ms: number;
  tokens_input?: number;
  tokens_output?: number;
  avg_confidence?: number;
  low_confidence_count?: number;
  // Pipeline-specific metrics (approach 4)
  structure_analysis_time_ms?: number;
  coverage_validation_time_ms?: number;
  extraction_time_ms?: number;
  normalization_time_ms?: number;
  final_validation_time_ms?: number;
  total_llm_calls?: number;
  questions_marked_invalid?: number;
  structure_confidence?: number;
  coverage_confidence?: number;
  show_dependencies_count?: number;
  skip_dependencies_count?: number;
}

/** Result of a single extraction approach */
export interface ExtractionResult {
  approach: number;
  model?: string;
  success: boolean;
  error?: string;
  questions: ExtractedQuestion[];
  metrics?: ExtractionMetrics;
  prompt?: string;
  raw_response?: string;
}

/** Comparison of multiple approaches */
export interface ComparisonResult {
  comparison_id: string;
  run_id: string;
  timestamp: string;
  results: Record<string, ExtractionResult>;
  winner: Record<string, number>;
}

/** Response from extraction endpoint */
export interface ExtractionResponse {
  run_id: string;
  results: Record<string, ExtractionResult>;
  comparison?: ComparisonResult;
}

/** Metadata for a historical run */
export interface RunMetadata {
  run_id: string;
  file_name: string;
  file_id: string;
  timestamp: string;
  approaches_run: number[];
  config: ExtractionConfig;
}

/** Wizard step names */
export type WizardStep = 'upload' | 'approach' | 'config' | 'running' | 'results';

/** Wizard state */
export interface WizardState {
  step: WizardStep;
  fileMetadata?: FileMetadata;
  config: ExtractionConfig;
  results?: ExtractionResponse;
  error?: string;
}

/** A single validated question in ground truth */
export interface GroundTruthQuestion {
  id: string;
  question_text: string;
  question_type: QuestionType;
  answers?: string[];
  row_index?: number;
  is_problematic?: boolean;
  problematic_comment?: string;
}

/** A sheet containing validated questions */
export interface GroundTruthSheet {
  sheet_name: string;
  questions: GroundTruthQuestion[];
}

/** Complete ground truth for an Excel file */
export interface GroundTruth {
  ground_truth_id: string;
  file_name: string;
  file_name_normalized: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  version: number;
  notes?: string;
  sheets: GroundTruthSheet[];
  total_question_count: number;
}

/** Summary of a ground truth for list views */
export interface GroundTruthSummary {
  ground_truth_id: string;
  file_name: string;
  created_by: string;
  updated_at: string;
  total_question_count: number;
}

/** Request to create a new ground truth */
export interface GroundTruthCreate {
  file_name: string;
  created_by: string;
  notes?: string;
  sheets: GroundTruthSheet[];
}

/** Request to update an existing ground truth */
export interface GroundTruthUpdate {
  file_name?: string;
  created_by?: string;
  notes?: string;
  sheets?: GroundTruthSheet[];
}

/** Result of comparing extraction with ground truth */
export interface GroundTruthComparisonResult {
  ground_truth_id: string;
  ground_truth_file_name: string;
  approach_key: string;
  model?: string;
  ground_truth_count: number;
  extracted_count: number;
  exact_matches: number;
  fuzzy_matches: number;
  missed_questions: number;
  extra_questions: number;
  precision: number;
  recall: number;
  f1_score: number;
  matched_questions: string[];
  missed_question_ids: string[];
}

/** App view mode */
export type AppView = 'wizard' | 'history' | 'groundtruth';
