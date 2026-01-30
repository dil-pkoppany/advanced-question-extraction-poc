import { useEffect, useState, useMemo, useCallback, memo, type ReactElement } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { runExtraction, getGroundTruthByFilename } from '../../api/client';
import type { ExtractionConfig, ExtractionResponse, ExtractionResult, ExtractedQuestion, GroundTruth } from '../../types';

interface ResultsStepProps {
  fileId: string;
  fileName: string;
  config: ExtractionConfig;
  results?: ExtractionResponse;
  onResultsReceived: (results: ExtractionResponse) => void;
  onError: (error: string) => void;
  onReset: () => void;
  isHistoricalView?: boolean;
}

// Helper function to format result key for display
function formatResultKey(key: string, result?: ExtractionResult): string {
  // key format: "approach_1" or "approach_1_opus_4_5" or "approach_1_sonnet_4"
  const parts = key.split('_');
  const approachNum = parts[1];
  
  let label = `Approach ${approachNum}`;
  
  // Add model name if present in result or key
  if (result?.model) {
    label += ` (${result.model})`;
  } else if (parts.length > 2) {
    // Extract model from key (e.g., "opus_4_5" -> "opus-4.5")
    const modelParts = parts.slice(2);
    const modelName = modelParts.join('-').replace(/_/g, '.');
    label += ` (${modelName})`;
  }
  
  return label;
}

export function ResultsStep({
  fileId,
  fileName,
  config,
  results,
  onResultsReceived,
  onError,
  onReset,
  isHistoricalView = false,
}: ResultsStepProps) {
  const [selectedApproach, setSelectedApproach] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'individual' | 'comparison'>('individual');

  const extractionMutation = useMutation({
    mutationFn: () => runExtraction(fileId, config),
    onSuccess: (data) => {
      onResultsReceived(data);
      // Select first approach by default
      const firstKey = Object.keys(data.results)[0];
      if (firstKey) setSelectedApproach(firstKey);
      // Auto-switch to comparison view if multiple approaches
      if (Object.keys(data.results).length > 1) {
        setViewMode('comparison');
      }
    },
    onError: (error: Error) => {
      onError(error.message || 'Extraction failed');
    },
  });

  // Fetch full ground truth data for comparison view
  const groundTruthDataQuery = useQuery({
    queryKey: ['groundTruthData', fileName],
    queryFn: () => getGroundTruthByFilename(fileName),
    enabled: !!fileName,
  });

  useEffect(() => {
    if (!results) {
      extractionMutation.mutate();
    } else {
      const firstKey = Object.keys(results.results)[0];
      if (firstKey && !selectedApproach) setSelectedApproach(firstKey);
    }
  }, []);

  // Auto-switch to comparison view when ground truth is loaded
  useEffect(() => {
    if (groundTruthDataQuery.data && viewMode === 'individual') {
      setViewMode('comparison');
    }
  }, [groundTruthDataQuery.data]);

  if (extractionMutation.isPending || !results) {
    return (
      <div className="card">
        <div className="loading">
          <div className="spinner" />
          <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>
            Running extraction...
          </p>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
            This may take a minute for large files
          </p>
        </div>
      </div>
    );
  }

  const approachKeys = Object.keys(results.results);
  const comparison = results.comparison;
  const hasMultipleApproaches = approachKeys.length > 1;
  const hasGroundTruth = !!groundTruthDataQuery.data;
  // Show comparison view if multiple approaches OR ground truth exists
  const canShowComparison = hasMultipleApproaches || hasGroundTruth;

  return (
    <div className="card">
      <div className="card-header">
        <span style={{ fontSize: '1.5rem' }}>📊</span>
        <h2>Extraction Results</h2>
        {fileName && (
          <span style={{ 
            fontSize: '0.9rem', 
            color: 'var(--text-secondary)',
            fontWeight: '400',
            marginLeft: '0.5rem',
            padding: '0.25rem 0.5rem',
            background: 'var(--bg-light)',
            borderRadius: '4px'
          }}>
            {fileName}
          </span>
        )}
        {/* View mode toggle */}
        {canShowComparison && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.25rem' }}>
            <button
              className={`btn ${viewMode === 'individual' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setViewMode('individual')}
              style={{ padding: '0.4rem 0.75rem', fontSize: '0.8125rem' }}
            >
              Individual
            </button>
            <button
              className={`btn ${viewMode === 'comparison' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setViewMode('comparison')}
              style={{ padding: '0.4rem 0.75rem', fontSize: '0.8125rem' }}
            >
              Compare
            </button>
          </div>
        )}
      </div>

      {/* Comparison summary */}
      {comparison && hasMultipleApproaches && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: '500', marginBottom: '1rem' }}>
            Comparison Summary
          </h3>
          <div className="results-grid">
            {comparison.winner.by_count && (
              <div className="result-card winner">
                <h4>Most Questions</h4>
                <div className="result-value">Approach {comparison.winner.by_count}</div>
              </div>
            )}
            {comparison.winner.by_speed && (
              <div className="result-card winner">
                <h4>Fastest</h4>
                <div className="result-value">Approach {comparison.winner.by_speed}</div>
              </div>
            )}
            {comparison.winner.by_accuracy && (
              <div className="result-card winner">
                <h4>Most Accurate</h4>
                <div className="result-value">Approach {comparison.winner.by_accuracy}</div>
              </div>
            )}
            {comparison.winner.by_confidence && (
              <div className="result-card winner">
                <h4>Highest Confidence</h4>
                <div className="result-value">Approach {comparison.winner.by_confidence}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* View mode content */}
      {viewMode === 'comparison' && canShowComparison ? (
        <ComparisonView 
          results={results.results} 
          approachKeys={approachKeys} 
          groundTruth={groundTruthDataQuery.data}
        />
      ) : (
        <>
          {/* Approach tabs */}
          {hasMultipleApproaches && (
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              {approachKeys.map((key) => (
                <button
                  key={key}
                  className={`btn ${selectedApproach === key ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setSelectedApproach(key)}
                  style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
                >
                  {formatResultKey(key, results.results[key])}
                </button>
              ))}
            </div>
          )}

          {/* Selected approach results */}
          {selectedApproach && results.results[selectedApproach] && (
            <ApproachResults result={results.results[selectedApproach]} />
          )}
        </>
      )}

      {/* Actions */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: '1.5rem',
          paddingTop: '1.5rem',
          borderTop: '1px solid var(--border)',
        }}
      >
        <button className="btn btn-secondary" onClick={onReset}>
          {isHistoricalView ? '← Back to History' : 'Start Over'}
        </button>
        <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
          Run ID: {results.run_id}
        </div>
      </div>
    </div>
  );
}

function ApproachResults({ result }: { result: ExtractionResult }) {
  if (!result.success) {
    return (
      <div className="error-message">
        <strong>Extraction failed:</strong> {result.error}
      </div>
    );
  }

  const metrics = result.metrics;

  return (
    <div>
      {/* Metrics */}
      {metrics && (
        <div className="results-grid" style={{ marginBottom: '1.5rem' }}>
          <div className="result-card">
            <h4>Questions Extracted</h4>
            <div className="result-value">{metrics.extraction_count}</div>
            {metrics.expected_count && (
              <div className="result-detail">
                Expected: {metrics.expected_count}
              </div>
            )}
          </div>

          <div className="result-card">
            <h4>Total Time</h4>
            <div className="result-value">
              {(metrics.total_time_ms / 1000).toFixed(1)}s
            </div>
            {metrics.llm_time_ms && (
              <div className="result-detail">
                LLM: {(metrics.llm_time_ms / 1000).toFixed(1)}s
              </div>
            )}
          </div>

          {metrics.accuracy !== undefined && (
            <div className="result-card">
              <h4>Accuracy</h4>
              <div className="result-value">
                {(metrics.accuracy * 100).toFixed(1)}%
              </div>
            </div>
          )}

          {metrics.avg_confidence !== undefined && (
            <div className="result-card">
              <h4>Avg Confidence</h4>
              <div className="result-value">
                {(metrics.avg_confidence * 100).toFixed(1)}%
              </div>
              {metrics.low_confidence_count !== undefined && (
                <div className="result-detail">
                  Low confidence: {metrics.low_confidence_count}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Questions list */}
      <h3 style={{ fontSize: '1rem', fontWeight: '500', marginBottom: '0.75rem' }}>
        Extracted Questions ({result.questions.length})
      </h3>
      <div className="questions-list">
        {result.questions.map((question, index) => (
          <div key={index} className="question-item">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <span style={{ color: 'var(--text-secondary)', marginRight: '0.5rem' }}>
                  {index + 1}.
                </span>
                {question.question_text}
                <span className="question-type">{question.question_type}</span>
              </div>
              {/* Only show confidence for approach 3 */}
              {question.confidence !== undefined && result.approach === 3 && (
                <div style={{ marginLeft: '1rem', minWidth: '60px', textAlign: 'right' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {(question.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              )}
            </div>
            {/* Only show confidence bar for approach 3 */}
            {question.confidence !== undefined && result.approach === 3 && (
              <div className="confidence-bar">
                <div
                  className={`confidence-bar-fill ${
                    question.confidence >= 0.8
                      ? 'confidence-high'
                      : question.confidence >= 0.5
                      ? 'confidence-medium'
                      : 'confidence-low'
                  }`}
                  style={{ width: `${question.confidence * 100}%` }}
                />
              </div>
            )}
            {question.answers && question.answers.length > 0 && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                Options: {question.answers.join(' | ')}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Normalize question text for comparison */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Calculate text similarity ratio (0.0 to 1.0) using longest common subsequence */
function textSimilarity(text1: string, text2: string): number {
  const normalized1 = normalizeText(text1);
  const normalized2 = normalizeText(text2);
  
  if (normalized1 === normalized2) return 1.0;
  if (normalized1.length === 0 || normalized2.length === 0) return 0.0;
  
  // Use longest common subsequence ratio (similar to Python's SequenceMatcher)
  const lcs = longestCommonSubsequence(normalized1, normalized2);
  const maxLen = Math.max(normalized1.length, normalized2.length);
  return lcs / maxLen;
}

/** Calculate longest common subsequence length */
function longestCommonSubsequence(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  
  return dp[m][n];
}

interface ComparisonViewProps {
  results: Record<string, ExtractionResult>;
  approachKeys: string[];
  groundTruth?: GroundTruth | null;
}

// Convert ground truth questions to ExtractedQuestion format
function groundTruthToExtractedQuestions(groundTruth: GroundTruth): ExtractedQuestion[] {
  const questions: ExtractedQuestion[] = [];
  for (const sheet of groundTruth.sheets) {
    for (const q of sheet.questions) {
      questions.push({
        question_text: q.question_text,
        question_type: q.question_type || 'open_ended',
        answers: q.answers,
        sheet_name: sheet.sheet_name,
        row_index: q.row_index,
        is_problematic: q.is_problematic,
        problematic_comment: q.problematic_comment,
      });
    }
  }
  return questions;
}

// Get color based on percentage: green >= 90%, orange >= 70%, red < 70%
function getPercentageColor(value: number): string {
  if (value >= 0.9) return 'var(--success)';
  if (value >= 0.7) return 'var(--warning)';
  return 'var(--error)';
}

// Get background color based on percentage
function getPercentageBg(value: number): string {
  if (value >= 0.9) return 'rgba(72, 187, 120, 0.15)';
  if (value >= 0.7) return 'rgba(237, 137, 54, 0.15)';
  return 'rgba(245, 101, 101, 0.15)';
}

// Calculate detailed accuracy metrics for an approach against ground truth
// Uses fuzzy matching (>=80% similarity) to find matches
function calculateDetailedMetrics(
  approachQuestions: ExtractedQuestion[],
  gtQuestions: ExtractedQuestion[]
): {
  textMatchRate: number;
  typeMatchRate: number;
  answerMatchRate: number;
  overallAccuracy: number;
  matchedCount: number;
  missedIds: string[];
  extraIds: string[];
} {
  if (gtQuestions.length === 0) {
    return { 
      textMatchRate: 0, 
      typeMatchRate: 0, 
      answerMatchRate: 0, 
      overallAccuracy: 0, 
      matchedCount: 0,
      missedIds: [],
      extraIds: []
    };
  }

  let textMatches = 0;
  let typeMatches = 0;
  let answerMatches = 0;
  let answerComparisons = 0;

  const FUZZY_THRESHOLD = 0.6;
  const matchedGtIndices = new Set<number>();
  const matchedApproachIndices = new Set<number>();

  // First pass: exact matches
  for (let gtIdx = 0; gtIdx < gtQuestions.length; gtIdx++) {
    const gtQ = gtQuestions[gtIdx];
    const gtNormalized = normalizeText(gtQ.question_text);
    
    for (let appIdx = 0; appIdx < approachQuestions.length; appIdx++) {
      if (matchedApproachIndices.has(appIdx)) continue;
      
      const approachQ = approachQuestions[appIdx];
      const approachNormalized = normalizeText(approachQ.question_text);
      
      if (gtNormalized === approachNormalized) {
        textMatches++;
        matchedGtIndices.add(gtIdx);
        matchedApproachIndices.add(appIdx);
        
        // Type match
        if (approachQ.question_type === gtQ.question_type) {
          typeMatches++;
        }
        
        // Answer match (only if GT has answers)
        if (gtQ.answers && gtQ.answers.length > 0) {
          answerComparisons++;
          const gtAnswers = new Set(gtQ.answers.map(a => a.toLowerCase().trim()));
          const approachAnswers = new Set((approachQ.answers || []).map(a => a.toLowerCase().trim()));
          
          if (gtAnswers.size === approachAnswers.size && 
              [...gtAnswers].every(a => approachAnswers.has(a))) {
            answerMatches++;
          }
        }
        break;
      }
    }
  }

  // Second pass: fuzzy matches
  for (let gtIdx = 0; gtIdx < gtQuestions.length; gtIdx++) {
    if (matchedGtIndices.has(gtIdx)) continue;
    
    const gtQ = gtQuestions[gtIdx];
    let bestSimilarity = 0;
    let bestAppIdx = -1;
    
    for (let appIdx = 0; appIdx < approachQuestions.length; appIdx++) {
      if (matchedApproachIndices.has(appIdx)) continue;
      
      const approachQ = approachQuestions[appIdx];
      const similarity = textSimilarity(gtQ.question_text, approachQ.question_text);
      
      if (similarity >= FUZZY_THRESHOLD && similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestAppIdx = appIdx;
      }
    }
    
    if (bestAppIdx >= 0) {
      textMatches++;
      matchedGtIndices.add(gtIdx);
      matchedApproachIndices.add(bestAppIdx);
      
      const approachQ = approachQuestions[bestAppIdx];
      
      // Type match
      if (approachQ.question_type === gtQ.question_type) {
        typeMatches++;
      }
      
      // Answer match (only if GT has answers)
      if (gtQ.answers && gtQ.answers.length > 0) {
        answerComparisons++;
        const gtAnswers = new Set(gtQ.answers.map(a => a.toLowerCase().trim()));
        const approachAnswers = new Set((approachQ.answers || []).map(a => a.toLowerCase().trim()));
        
        if (gtAnswers.size === approachAnswers.size && 
            [...gtAnswers].every(a => approachAnswers.has(a))) {
          answerMatches++;
        }
      }
    }
  }

  // Track missed IDs (in GT but not matched)
  const missedIds: string[] = [];
  for (let gtIdx = 0; gtIdx < gtQuestions.length; gtIdx++) {
    if (!matchedGtIndices.has(gtIdx)) {
      const gtQ = gtQuestions[gtIdx];
      missedIds.push(gtQ.id || `R${gtQ.row_index || '?'}`);
    }
  }

  // Track extra IDs (in approach but not matched to GT)
  const extraIds: string[] = [];
  let extraIndex = 1;
  for (let appIdx = 0; appIdx < approachQuestions.length; appIdx++) {
    if (!matchedApproachIndices.has(appIdx)) {
      const approachQ = approachQuestions[appIdx];
      extraIds.push(approachQ.id || (approachQ.row_index ? `R${approachQ.row_index}` : `E${extraIndex++}`));
    }
  }

  const textMatchRate = textMatches / gtQuestions.length;
  const typeMatchRate = textMatches > 0 ? typeMatches / textMatches : 0;
  const answerMatchRate = answerComparisons > 0 ? answerMatches / answerComparisons : 1; // 1 if no answers to compare
  
  // Overall accuracy: weighted average (text 50%, type 30%, answers 20%)
  const overallAccuracy = textMatchRate * 0.5 + typeMatchRate * 0.3 + answerMatchRate * 0.2;

  return {
    textMatchRate,
    typeMatchRate,
    answerMatchRate,
    overallAccuracy,
    matchedCount: textMatches,
    missedIds,
    extraIds,
  };
}

function ComparisonView({ results, approachKeys, groundTruth }: ComparisonViewProps) {
  // State for modal
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  
  // State for expanded metric cells (showing question IDs)
  const [expandedMetrics, setExpandedMetrics] = useState<Record<string, boolean>>({});
  
  // Memoize the close handler to prevent unnecessary re-renders
  const handleCloseModal = useCallback(() => {
    setSelectedRowIndex(null);
  }, []);

  // Include ground truth as a column
  const allColumnKeys = groundTruth ? ['ground_truth', ...approachKeys] : approachKeys;

  // Build a unified list of all questions across approaches
  const comparisonData = useMemo(() => {
    const rows: Array<{
      id: string;
      questions: Record<string, ExtractedQuestion | null>;
      matchInfo: Record<string, { isFuzzy: boolean; similarity?: number }>; // Track match type per approach
      isUnique: boolean;
      hasDifferences: boolean;
      inGroundTruth: boolean;
      missingFromGroundTruth: boolean;
      gtDuplicateRows: number[]; // Other row numbers with same GT question text
    }> = [];
    
    // Track which approach questions have been matched (to find extras)
    const matchedApproachQuestions: Record<string, Set<number>> = {};
    for (const key of approachKeys) {
      matchedApproachQuestions[key] = new Set();
    }
    
    // Track GT duplicates: normalized text -> list of row indices (0-based)
    const gtTextToRowIndices = new Map<string, number[]>();
    
    // Fuzzy matching threshold (same as backend: 0.8)
    const FUZZY_THRESHOLD = 0.6;
    
    // If we have ground truth, create one row per GT question (no deduplication!)
    if (groundTruth) {
      const gtQuestions = groundTruthToExtractedQuestions(groundTruth);
      
      // First pass: build the duplicate map
      for (let gtIndex = 0; gtIndex < gtQuestions.length; gtIndex++) {
        const gtNormalized = normalizeText(gtQuestions[gtIndex].question_text);
        if (!gtTextToRowIndices.has(gtNormalized)) {
          gtTextToRowIndices.set(gtNormalized, []);
        }
        gtTextToRowIndices.get(gtNormalized)!.push(gtIndex);
      }
      
      for (let gtIndex = 0; gtIndex < gtQuestions.length; gtIndex++) {
        const gtQuestion = gtQuestions[gtIndex];
        const gtNormalized = normalizeText(gtQuestion.question_text);
        
        const rowQuestions: Record<string, ExtractedQuestion | null> = {
          'ground_truth': gtQuestion
        };
        const matchInfo: Record<string, { isFuzzy: boolean; similarity?: number }> = {};
        
        // Find matching questions from each approach
        for (const key of approachKeys) {
          const result = results[key];
          if (!result.success) {
            rowQuestions[key] = null;
            continue;
          }
          
          // First pass: exact matching
          let matchedIndex = -1;
          let isFuzzyMatch = false;
          let similarity = 1.0;
          
          for (let i = 0; i < result.questions.length; i++) {
            if (matchedApproachQuestions[key].has(i)) continue;
            
            const approachNormalized = normalizeText(result.questions[i].question_text);
            if (approachNormalized === gtNormalized) {
              matchedIndex = i;
              isFuzzyMatch = false;
              similarity = 1.0;
              break;
            }
          }
          
          // Second pass: fuzzy matching if no exact match found
          if (matchedIndex === -1) {
            let bestSimilarity = 0;
            let bestIndex = -1;
            
            for (let i = 0; i < result.questions.length; i++) {
              if (matchedApproachQuestions[key].has(i)) continue;
              
              const sim = textSimilarity(gtQuestion.question_text, result.questions[i].question_text);
              if (sim >= FUZZY_THRESHOLD && sim > bestSimilarity) {
                bestSimilarity = sim;
                bestIndex = i;
              }
            }
            
            if (bestIndex >= 0) {
              matchedIndex = bestIndex;
              isFuzzyMatch = true;
              similarity = bestSimilarity;
            }
          }
          
          if (matchedIndex >= 0) {
            rowQuestions[key] = result.questions[matchedIndex];
            matchedApproachQuestions[key].add(matchedIndex);
            matchInfo[key] = { isFuzzy: isFuzzyMatch, similarity };
          } else {
            rowQuestions[key] = null;
          }
        }
        
        // Check for type differences among matched questions
        const matchedQuestions = Object.values(rowQuestions).filter(Boolean);
        const types = new Set(matchedQuestions.map(q => q!.question_type));
        const hasDifferences = types.size > 1;
        
        // isUnique means only one approach has this question
        const presentIn = allColumnKeys.filter(k => rowQuestions[k]);
        const isUnique = presentIn.length === 1;
        
        // Get duplicate row numbers (excluding self, convert to 1-based)
        const duplicateIndices = gtTextToRowIndices.get(gtNormalized) || [];
        const gtDuplicateRows = duplicateIndices
          .filter(idx => idx !== gtIndex)
          .map(idx => idx + 1); // Convert to 1-based row numbers
        
        rows.push({
          id: `gt-${gtIndex}`,
          questions: rowQuestions,
          matchInfo,
          isUnique,
          hasDifferences,
          inGroundTruth: true,
          missingFromGroundTruth: false,
          gtDuplicateRows,
        });
      }
    }
    
    // Add any unmatched approach questions (extras not in ground truth)
    for (const key of approachKeys) {
      const result = results[key];
      if (!result.success) continue;
      
      for (let i = 0; i < result.questions.length; i++) {
        if (matchedApproachQuestions[key].has(i)) continue;
        
        const extraQuestion = result.questions[i];
        const extraNormalized = normalizeText(extraQuestion.question_text);
        
        // Check if this extra question already exists in rows (from another approach's extras)
        let existingRowIndex = -1;
        for (let r = 0; r < rows.length; r++) {
          if (rows[r].inGroundTruth) continue; // Skip GT rows
          // Check if any approach in this row has the same normalized text
          for (const approachKey of approachKeys) {
            const q = rows[r].questions[approachKey];
            if (q && normalizeText(q.question_text) === extraNormalized) {
              existingRowIndex = r;
              break;
            }
          }
          if (existingRowIndex >= 0) break;
        }
        
        if (existingRowIndex >= 0) {
          // Add to existing extra row
          rows[existingRowIndex].questions[key] = extraQuestion;
          // Update isUnique
          const presentIn = allColumnKeys.filter(k => rows[existingRowIndex].questions[k]);
          rows[existingRowIndex].isUnique = presentIn.length === 1;
        } else {
          // Create new extra row
          const rowQuestions: Record<string, ExtractedQuestion | null> = {
            'ground_truth': null
          };
          for (const k of approachKeys) {
            rowQuestions[k] = k === key ? extraQuestion : null;
          }
          
          rows.push({
            id: `extra-${key}-${i}`,
            questions: rowQuestions,
            matchInfo: {},
            isUnique: true,
            hasDifferences: false,
            inGroundTruth: false,
            missingFromGroundTruth: true,
            gtDuplicateRows: [],
          });
        }
      }
    }
    
    // If no ground truth, just show all approach questions (with dedup for comparison)
    if (!groundTruth) {
      const questionMap = new Map<string, Record<string, ExtractedQuestion | null>>();
      
      for (const key of approachKeys) {
        const result = results[key];
        if (!result.success) continue;
        
        for (const question of result.questions) {
          const normalized = normalizeText(question.question_text);
          if (!questionMap.has(normalized)) {
            questionMap.set(normalized, {});
          }
          questionMap.get(normalized)![key] = question;
        }
      }
      
      let index = 0;
      for (const [, questions] of questionMap) {
        const presentIn = approachKeys.filter(k => questions[k]);
        const isUnique = presentIn.length === 1;
        
        const types = new Set(
          Object.values(questions)
            .filter(Boolean)
            .map(q => q!.question_type)
        );
        const hasDifferences = isUnique || types.size > 1;
        
        rows.push({
          id: `q-${index++}`,
          questions,
          matchInfo: {},
          isUnique,
          hasDifferences,
          inGroundTruth: false,
          missingFromGroundTruth: false,
          gtDuplicateRows: [],
        });
      }
    }
    
    return rows;
  }, [results, approachKeys, groundTruth, allColumnKeys]);

  // Stats
  const totalUnique = comparisonData.filter(r => r.isUnique).length;
  const totalDifferences = comparisonData.filter(r => r.hasDifferences).length;
  const totalCommon = comparisonData.length - totalUnique;
  const inGroundTruthCount = comparisonData.filter(r => r.inGroundTruth).length;
  const missingFromGT = comparisonData.filter(r => r.missingFromGroundTruth).length;

  // Calculate detailed metrics per approach (against ground truth)
  // Uses comparisonData to get correct row numbers that match the table
  const detailedMetrics = useMemo(() => {
    if (!groundTruth) return {};
    
    const gtQuestions = groundTruthToExtractedQuestions(groundTruth);
    const metrics: Record<string, {
      textMatchRate: number;
      typeMatchRate: number;
      answerMatchRate: number;
      overallAccuracy: number;
      matchedCount: number;
      missedRowNumbers: number[];
      extraRowNumbers: number[];
    }> = {};
    
    for (const key of approachKeys) {
      const result = results[key];
      if (!result.success) continue;
      
      // Get basic metrics from the calculation function
      const baseMetrics = calculateDetailedMetrics(result.questions, gtQuestions);
      
      // Calculate missed row numbers (GT questions not found by this approach)
      // These are rows where ground_truth exists but this approach doesn't have the question
      const missedRowNumbers: number[] = [];
      const extraRowNumbers: number[] = [];
      
      comparisonData.forEach((row, index) => {
        const rowNumber = index + 1; // 1-based row number
        const hasGT = !!row.questions['ground_truth'];
        const hasApproach = !!row.questions[key];
        
        if (hasGT && !hasApproach) {
          // Missed: in ground truth but not extracted by this approach
          missedRowNumbers.push(rowNumber);
        } else if (!hasGT && hasApproach) {
          // Extra: extracted by this approach but not in ground truth
          extraRowNumbers.push(rowNumber);
        }
      });
      
      metrics[key] = {
        ...baseMetrics,
        missedRowNumbers,
        extraRowNumbers,
      };
    }
    
    return metrics;
  }, [groundTruth, results, approachKeys, comparisonData]);

  return (
    <div>
      {/* Stats row */}
      <div style={{ 
        display: 'flex', 
        gap: '1rem', 
        marginBottom: '1rem',
        padding: '0.75rem',
        background: 'var(--bg-light)',
        borderRadius: '8px',
        fontSize: '0.875rem',
        flexWrap: 'wrap'
      }}>
        <div>
          <strong>{comparisonData.length}</strong> total questions
        </div>
        <div style={{ color: 'var(--success)' }}>
          <strong>{totalCommon}</strong> common
        </div>
        <div style={{ color: 'var(--warning)' }}>
          <strong>{totalUnique}</strong> unique
        </div>
        <div style={{ color: 'var(--error)' }}>
          <strong>{totalDifferences}</strong> with differences
        </div>
        {groundTruth && (
          <>
            <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: '1rem', color: 'var(--primary)' }}>
              <strong>{inGroundTruthCount}</strong> in ground truth
            </div>
            {missingFromGT > 0 && (
              <div style={{ color: 'var(--error)' }}>
                <strong>{missingFromGT}</strong> extra (not in GT)
              </div>
            )}
          </>
        )}
      </div>

      {/* Metrics comparison */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '0.9375rem', fontWeight: '500', marginBottom: '0.75rem' }}>
          Metrics Comparison
        </h3>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: `120px ${groundTruth ? '1fr ' : ''}repeat(${approachKeys.length}, 1fr)`,
          gap: '1px',
          background: 'var(--border)',
          borderRadius: '8px',
          overflow: 'hidden',
          fontSize: '0.8125rem'
        }}>
          {/* Header row */}
          <div style={{ background: 'var(--bg-light)', padding: '0.5rem', fontWeight: '500' }}>
            Metric
          </div>
          {groundTruth && (
            <div style={{ background: 'var(--bg-light)', padding: '0.5rem', fontWeight: '600', textAlign: 'center', fontSize: '0.85rem', color: 'var(--primary)' }}>
              Ground Truth
            </div>
          )}
          {approachKeys.map(key => (
            <div key={key} style={{ background: 'var(--bg-light)', padding: '0.5rem', fontWeight: '500', textAlign: 'center', fontSize: '0.85rem' }}>
              {formatResultKey(key, results[key])}
            </div>
          ))}
          
          {/* Count row */}
          <div style={{ background: 'white', padding: '0.5rem' }}>Count</div>
          {groundTruth && (
            <div style={{ background: 'white', padding: '0.5rem', textAlign: 'center', fontWeight: '600' }}>
              {groundTruth.total_question_count}
            </div>
          )}
          {approachKeys.map(key => {
            const count = results[key]?.metrics?.extraction_count;
            const gtCount = groundTruth?.total_question_count;
            const isMatch = groundTruth && count === gtCount;
            return (
              <div key={key} style={{ 
                background: isMatch ? 'rgba(72, 187, 120, 0.15)' : 'white', 
                padding: '0.5rem', 
                textAlign: 'center',
                color: isMatch ? 'var(--success)' : 'inherit',
                fontWeight: isMatch ? '600' : 'normal'
              }}>
                {count ?? '-'}
              </div>
            );
          })}
          
          {/* Time row */}
          <div style={{ background: 'white', padding: '0.5rem' }}>Time</div>
          {groundTruth && (
            <div style={{ background: 'white', padding: '0.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              -
            </div>
          )}
          {approachKeys.map(key => (
            <div key={key} style={{ background: 'white', padding: '0.5rem', textAlign: 'center' }}>
              {results[key]?.metrics?.total_time_ms 
                ? `${(results[key].metrics!.total_time_ms / 1000).toFixed(1)}s` 
                : '-'}
            </div>
          ))}

          {/* Ground Truth Accuracy Metrics - only show when GT exists */}
          {groundTruth && (
            <>
              {/* Text Match (Recall) */}
              <div style={{ background: 'var(--bg-light)', padding: '0.5rem', fontWeight: '500' }}>Text Match</div>
              <div style={{ background: 'var(--bg-light)', padding: '0.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                100%
              </div>
              {approachKeys.map(key => {
                const metrics = detailedMetrics[key];
                const value = metrics?.textMatchRate ?? 0;
                return (
                  <div key={key} style={{ 
                    background: getPercentageBg(value), 
                    padding: '0.5rem', 
                    textAlign: 'center',
                    color: getPercentageColor(value),
                    fontWeight: '600'
                  }}>
                    {metrics ? `${(value * 100).toFixed(0)}%` : '-'}
                  </div>
                );
              })}

              {/* Type Match */}
              <div style={{ background: 'var(--bg-light)', padding: '0.5rem', fontWeight: '500' }}>Type Match</div>
              <div style={{ background: 'var(--bg-light)', padding: '0.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                100%
              </div>
              {approachKeys.map(key => {
                const metrics = detailedMetrics[key];
                const value = metrics?.typeMatchRate ?? 0;
                return (
                  <div key={key} style={{ 
                    background: getPercentageBg(value), 
                    padding: '0.5rem', 
                    textAlign: 'center',
                    color: getPercentageColor(value),
                    fontWeight: '600'
                  }}>
                    {metrics ? `${(value * 100).toFixed(0)}%` : '-'}
                  </div>
                );
              })}

              {/* Answer Match */}
              <div style={{ background: 'var(--bg-light)', padding: '0.5rem', fontWeight: '500' }}>Answer Match</div>
              <div style={{ background: 'var(--bg-light)', padding: '0.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                100%
              </div>
              {approachKeys.map(key => {
                const metrics = detailedMetrics[key];
                const value = metrics?.answerMatchRate ?? 0;
                return (
                  <div key={key} style={{ 
                    background: getPercentageBg(value), 
                    padding: '0.5rem', 
                    textAlign: 'center',
                    color: getPercentageColor(value),
                    fontWeight: '600'
                  }}>
                    {metrics ? `${(value * 100).toFixed(0)}%` : '-'}
                  </div>
                );
              })}

              {/* Overall Accuracy */}
              <div style={{ background: 'var(--bg-light)', padding: '0.5rem', fontWeight: '600' }}>Overall</div>
              <div style={{ background: 'var(--bg-light)', padding: '0.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                100%
              </div>
              {approachKeys.map(key => {
                const metrics = detailedMetrics[key];
                const value = metrics?.overallAccuracy ?? 0;
                return (
                  <div key={key} style={{ 
                    background: getPercentageBg(value), 
                    padding: '0.5rem', 
                    textAlign: 'center',
                    color: getPercentageColor(value),
                    fontWeight: '700',
                    fontSize: '0.9rem'
                  }}>
                    {metrics ? `${(value * 100).toFixed(0)}%` : '-'}
                  </div>
                );
              })}

              {/* Missed Questions */}
              <div style={{ background: 'white', padding: '0.5rem', fontWeight: '500', color: 'var(--error)' }}>Missed</div>
              <div style={{ background: 'white', padding: '0.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                0
              </div>
              {approachKeys.map(key => {
                const metrics = detailedMetrics[key];
                const missedCount = metrics?.missedRowNumbers.length ?? 0;
                const expandKey = `missed-${key}`;
                const isExpanded = expandedMetrics[expandKey];
                
                return (
                  <div 
                    key={key}
                    style={{ 
                      background: missedCount > 0 ? 'rgba(245, 101, 101, 0.1)' : 'white', 
                      padding: '0.5rem', 
                      textAlign: 'center',
                      color: missedCount > 0 ? 'var(--error)' : 'var(--text-secondary)',
                      fontWeight: missedCount > 0 ? '600' : 'normal',
                      cursor: missedCount > 0 ? 'pointer' : 'default',
                      transition: 'background 0.15s'
                    }}
                    onClick={() => {
                      if (missedCount > 0) {
                        setExpandedMetrics(prev => ({
                          ...prev,
                          [expandKey]: !prev[expandKey]
                        }));
                      }
                    }}
                    onMouseEnter={(e) => {
                      if (missedCount > 0) {
                        e.currentTarget.style.background = 'rgba(245, 101, 101, 0.2)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (missedCount > 0) {
                        e.currentTarget.style.background = 'rgba(245, 101, 101, 0.1)';
                      }
                    }}
                    title={missedCount > 0 ? 'Click to see row numbers' : undefined}
                  >
                    {missedCount}
                    {missedCount > 0 && (
                      <span style={{ marginLeft: '0.25rem', fontSize: '0.75rem' }}>
                        {isExpanded ? '▼' : '▶'}
                      </span>
                    )}
                  </div>
                );
              })}

              {/* Extra Questions */}
              <div style={{ background: 'white', padding: '0.5rem', fontWeight: '500', color: 'var(--error)' }}>Extra</div>
              <div style={{ background: 'white', padding: '0.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                0
              </div>
              {approachKeys.map(key => {
                const metrics = detailedMetrics[key];
                const extraCount = metrics?.extraRowNumbers.length ?? 0;
                const expandKey = `extra-${key}`;
                const isExpanded = expandedMetrics[expandKey];
                
                return (
                  <div 
                    key={key}
                    style={{ 
                      background: extraCount > 0 ? 'rgba(245, 101, 101, 0.1)' : 'white', 
                      padding: '0.5rem', 
                      textAlign: 'center',
                      color: extraCount > 0 ? 'var(--error)' : 'var(--text-secondary)',
                      fontWeight: extraCount > 0 ? '600' : 'normal',
                      cursor: extraCount > 0 ? 'pointer' : 'default',
                      transition: 'background 0.15s'
                    }}
                    onClick={() => {
                      if (extraCount > 0) {
                        setExpandedMetrics(prev => ({
                          ...prev,
                          [expandKey]: !prev[expandKey]
                        }));
                      }
                    }}
                    onMouseEnter={(e) => {
                      if (extraCount > 0) {
                        e.currentTarget.style.background = 'rgba(245, 101, 101, 0.2)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (extraCount > 0) {
                        e.currentTarget.style.background = 'rgba(245, 101, 101, 0.1)';
                      }
                    }}
                    title={extraCount > 0 ? 'Click to see row numbers' : undefined}
                  >
                    {extraCount}
                    {extraCount > 0 && (
                      <span style={{ marginLeft: '0.25rem', fontSize: '0.75rem' }}>
                        {isExpanded ? '▼' : '▶'}
                      </span>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Expanded Question Row Numbers Display */}
        {groundTruth && Object.keys(expandedMetrics).some(key => expandedMetrics[key]) && (
          <div style={{ marginTop: '1rem' }}>
            {approachKeys.map(key => {
              const metrics = detailedMetrics[key];
              const missedExpanded = expandedMetrics[`missed-${key}`];
              const extraExpanded = expandedMetrics[`extra-${key}`];
              
              if (!missedExpanded && !extraExpanded) return null;
              
              return (
                <div key={key} style={{ marginBottom: '1rem' }}>
                  <div style={{ 
                    fontSize: '0.875rem', 
                    fontWeight: '600', 
                    marginBottom: '0.5rem',
                    color: 'var(--primary)'
                  }}>
                    {formatResultKey(key, results[key])}
                  </div>
                  
                  {missedExpanded && metrics && metrics.missedRowNumbers.length > 0 && (
                    <div style={{
                      background: 'rgba(245, 101, 101, 0.05)',
                      border: '1px solid rgba(245, 101, 101, 0.2)',
                      borderRadius: '6px',
                      padding: '0.75rem',
                      marginBottom: '0.5rem'
                    }}>
                      <div style={{ 
                        fontSize: '0.75rem', 
                        fontWeight: '600', 
                        color: 'var(--error)',
                        marginBottom: '0.5rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                      }}>
                        Missed Questions - Table Row # ({metrics.missedRowNumbers.length})
                      </div>
                      <div style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '0.375rem'
                      }}>
                        {metrics.missedRowNumbers.map(rowNum => (
                          <span 
                            key={rowNum}
                            style={{
                              background: 'var(--error)',
                              color: 'white',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: '600',
                              cursor: 'help'
                            }}
                            title={`See row ${rowNum} in the table below`}
                          >
                            #{rowNum}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {extraExpanded && metrics && metrics.extraRowNumbers.length > 0 && (
                    <div style={{
                      background: 'rgba(245, 101, 101, 0.05)',
                      border: '1px solid rgba(245, 101, 101, 0.2)',
                      borderRadius: '6px',
                      padding: '0.75rem'
                    }}>
                      <div style={{ 
                        fontSize: '0.75rem', 
                        fontWeight: '600', 
                        color: 'var(--error)',
                        marginBottom: '0.5rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                      }}>
                        Extra Questions - Table Row # ({metrics.extraRowNumbers.length})
                      </div>
                      <div style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '0.375rem'
                      }}>
                        {metrics.extraRowNumbers.map(rowNum => (
                          <span 
                            key={rowNum}
                            style={{
                              background: 'var(--error)',
                              color: 'white',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: '600',
                              cursor: 'help'
                            }}
                            title={`See row ${rowNum} in the table below`}
                          >
                            #{rowNum}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        
        {/* Legend for color coding */}
        {groundTruth && (
          <div style={{ 
            marginTop: '0.5rem', 
            fontSize: '0.7rem', 
            color: 'var(--text-secondary)',
            display: 'flex',
            gap: '1rem'
          }}>
            <span><span style={{ color: 'var(--success)' }}>●</span> ≥90%</span>
            <span><span style={{ color: 'var(--warning)' }}>●</span> 70-89%</span>
            <span><span style={{ color: 'var(--error)' }}>●</span> &lt;70%</span>
          </div>
        )}
      </div>

      {/* Side-by-side questions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h3 style={{ fontSize: '0.9375rem', fontWeight: '500' }}>
          Questions Comparison
        </h3>
        {/* Legend */}
        <div style={{ 
          display: 'flex', 
          gap: '1rem', 
          fontSize: '0.75rem',
          color: 'var(--text-secondary)',
          flexWrap: 'wrap'
        }}>
          {groundTruth ? (
            <>
              <span title="Question matches ground truth (text, type, and answers)">
                <span style={{ 
                  display: 'inline-block', 
                  width: '12px', 
                  height: '12px', 
                  background: 'rgba(72, 187, 120, 0.12)', 
                  border: '2px solid var(--success)',
                  borderRadius: '2px',
                  marginRight: '0.25rem',
                  verticalAlign: 'middle'
                }}></span>
                Match
              </span>
              <span title="Partial match (type or answers differ)">
                <span style={{ 
                  display: 'inline-block', 
                  width: '12px', 
                  height: '12px', 
                  background: 'rgba(237, 137, 54, 0.15)', 
                  border: '2px solid var(--warning)',
                  borderRadius: '2px',
                  marginRight: '0.25rem',
                  verticalAlign: 'middle'
                }}></span>
                Partial
              </span>
              <span title="Missing from GT or type/answers don't match">
                <span style={{ 
                  display: 'inline-block', 
                  width: '12px', 
                  height: '12px', 
                  background: 'rgba(245, 101, 101, 0.15)', 
                  border: '2px solid var(--error)',
                  borderRadius: '2px',
                  marginRight: '0.25rem',
                  verticalAlign: 'middle'
                }}></span>
                Missing/Extra
              </span>
            </>
          ) : (
            <>
              <span title="Question found in all approaches">
                <span style={{ 
                  display: 'inline-block', 
                  width: '12px', 
                  height: '12px', 
                  background: 'white', 
                  border: '1px solid var(--border)',
                  borderRadius: '2px',
                  marginRight: '0.25rem',
                  verticalAlign: 'middle'
                }}></span>
                Common
              </span>
              <span title="Question only found in one approach">
                <span style={{ 
                  display: 'inline-block', 
                  width: '12px', 
                  height: '12px', 
                  background: 'rgba(237, 137, 54, 0.2)', 
                  border: '1px solid var(--warning)',
                  borderRadius: '2px',
                  marginRight: '0.25rem',
                  verticalAlign: 'middle'
                }}></span>
                Unique
              </span>
            </>
          )}
        </div>
      </div>
      <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', fontStyle: 'italic' }}>
        Click any row to see full details | Hover for quick preview
      </p>
      <div style={{ 
        border: '1px solid var(--border)', 
        borderRadius: '8px', 
        overflow: 'hidden',
        maxHeight: '600px',
        overflowY: 'auto'
      }}>
        {/* Header */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: `50px ${groundTruth ? '1fr ' : ''}repeat(${approachKeys.length}, 1fr)`,
          background: 'var(--bg-light)',
          borderBottom: '1px solid var(--border)',
          position: 'sticky',
          top: 0,
          zIndex: 1
        }}>
          <div style={{ padding: '0.5rem', fontSize: '0.75rem', fontWeight: '500' }} title="Row number and status indicator">#</div>
          {groundTruth && (
            <div style={{ 
              padding: '0.5rem', 
              fontSize: '0.75rem', 
              fontWeight: '600',
              borderLeft: '1px solid var(--border)',
              background: 'rgba(72, 187, 120, 0.15)',
              color: 'var(--success)'
            }}>
              Ground Truth
              <span style={{ fontWeight: '400', marginLeft: '0.5rem' }}>
                ({groundTruth.total_question_count})
              </span>
            </div>
          )}
          {approachKeys.map(key => (
            <div key={key} style={{ 
              padding: '0.5rem', 
              fontSize: '0.75rem', 
              fontWeight: '500',
              borderLeft: '1px solid var(--border)'
            }}>
              {formatResultKey(key, results[key])}
              <span style={{ fontWeight: '400', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
                ({results[key]?.questions.length || 0})
              </span>
            </div>
          ))}
        </div>

        {/* Rows */}
        {comparisonData.map((row, index) => {
          const gtQuestion = row.questions['ground_truth'];
          
          // Helper to determine cell color for an approach
          const getCellStyle = (approachKey: string) => {
            const question = row.questions[approachKey];
            const matchInfo = row.matchInfo[approachKey];
            const isFuzzyMatch = matchInfo?.isFuzzy || false;
            
            if (!groundTruth) {
              // No ground truth - use old logic
              return { background: question ? 'white' : 'var(--bg-light)' };
            }
            
            if (!question) {
              // Question not found by this approach
              if (gtQuestion) {
                // Missing from GT - red
                return { background: 'rgba(245, 101, 101, 0.15)', borderColor: 'var(--error)' };
              }
              return { background: 'var(--bg-light)' };
            }
            
            if (!gtQuestion) {
              // Extra question not in GT - red
              return { background: 'rgba(245, 101, 101, 0.15)', borderColor: 'var(--error)' };
            }
            
            // Both exist - check for type and answer matches
            const typeMatch = question.question_type === gtQuestion.question_type;
            const gtAnswers = new Set((gtQuestion.answers || []).map(a => a.toLowerCase().trim()));
            const approachAnswers = new Set((question.answers || []).map(a => a.toLowerCase().trim()));
            const answerMatch = gtAnswers.size === 0 || 
              (gtAnswers.size === approachAnswers.size && [...gtAnswers].every(a => approachAnswers.has(a)));
            
            // If fuzzy match, use greenish background
            if (isFuzzyMatch) {
              if (typeMatch && answerMatch) {
                // Fuzzy match but type and answers match - light green
                return { background: 'rgba(72, 187, 120, 0.15)', borderColor: 'var(--success)' };
              } else if (typeMatch || answerMatch) {
                // Fuzzy match, partial type/answer match - medium green
                return { background: 'rgba(72, 187, 120, 0.2)', borderColor: 'var(--success)' };
              } else {
                // Fuzzy match but type/answers differ - darker green
                return { background: 'rgba(72, 187, 120, 0.25)', borderColor: 'var(--success)' };
              }
            }
            
            // Exact text match
            if (typeMatch && answerMatch) {
              // Perfect match - green
              return { background: 'rgba(72, 187, 120, 0.12)', borderColor: 'var(--success)' };
            } else if (typeMatch || answerMatch) {
              // Partial match - orange
              return { background: 'rgba(237, 137, 54, 0.15)', borderColor: 'var(--warning)' };
            } else {
              // No match - red
              return { background: 'rgba(245, 101, 101, 0.15)', borderColor: 'var(--error)' };
            }
          };
          
          return (
            <div 
              key={row.id}
              onClick={() => setSelectedRowIndex(index)}
              style={{ 
                display: 'grid', 
                gridTemplateColumns: `50px ${groundTruth ? '1fr ' : ''}repeat(${approachKeys.length}, 1fr)`,
                borderBottom: '1px solid var(--border)',
                background: 'white',
                cursor: 'pointer',
                transition: 'background 0.15s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-light)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'white';
              }}
            >
              <div 
                style={{ 
                  padding: '0.5rem', 
                  fontSize: '0.75rem', 
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  cursor: 'help'
                }}
                title={`Row ${index + 1}`}
              >
                {index + 1}
              </div>
              {/* Ground Truth column */}
              {groundTruth && (() => {
                const question = gtQuestion;
                const duplicateRows = row.gtDuplicateRows;
                return (
                  <div 
                    style={{ 
                      padding: '0.5rem',
                      fontSize: '0.8125rem',
                      borderLeft: '1px solid var(--border)',
                      background: question ? (duplicateRows.length > 0 ? 'rgba(237, 137, 54, 0.1)' : 'white') : 'var(--bg-light)',
                      cursor: question ? 'help' : 'default'
                    }}
                    title={question ? question.question_text : 'Not in ground truth'}
                  >
                  {question ? (
                    <>
                      <div style={{ marginBottom: '0.25rem', lineHeight: '1.4' }}>
                        {question.question_text.length > 200 
                          ? question.question_text.substring(0, 200) + '...'
                          : question.question_text}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span className="question-type" style={{ fontSize: '0.6875rem' }}>
                          {question.question_type}
                        </span>
                        {duplicateRows.length > 0 && (
                          <span 
                            style={{ 
                              fontSize: '0.625rem',
                              background: 'var(--warning)',
                              color: 'white',
                              padding: '0.125rem 0.375rem',
                              borderRadius: '3px',
                              fontWeight: '600',
                              cursor: 'help'
                            }}
                            title={`Duplicate question - same text as row${duplicateRows.length > 1 ? 's' : ''}: ${duplicateRows.map(r => '#' + r).join(', ')}`}
                          >
                            DUP #{duplicateRows.join(', #')}
                          </span>
                        )}
                        {question.is_problematic && (
                          <span 
                            style={{ 
                              fontSize: '0.6875rem',
                              color: 'var(--error)',
                              fontWeight: '600',
                              cursor: question.problematic_comment ? 'help' : 'default'
                            }}
                            title={question.problematic_comment || 'Marked as problematic'}
                          >
                            ⚠️ Problematic
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                      Not in GT
                    </span>
                  )}
                  </div>
                );
              })()}
              {approachKeys.map(key => {
                const question = row.questions[key];
                const cellStyle = getCellStyle(key);
                const matchInfo = row.matchInfo[key];
                
                // Determine difference indicators/badges
                const badges: ReactElement[] = [];
                if (groundTruth && question && gtQuestion) {
                  // Check if this is a fuzzy match
                  if (matchInfo?.isFuzzy) {
                    const similarityPercent = matchInfo.similarity 
                      ? `${(matchInfo.similarity * 100).toFixed(0)}%`
                      : '~';
                    badges.push(
                      <span 
                        key="fuzzy-match"
                        style={{ 
                          fontSize: '0.625rem',
                          background: 'rgba(72, 187, 120, 0.9)',
                          color: 'white',
                          padding: '0.125rem 0.375rem',
                          borderRadius: '3px',
                          marginLeft: '0.25rem',
                          fontWeight: '600',
                          display: 'inline-block',
                          lineHeight: '1.2'
                        }}
                        title={`Fuzzy match - text similarity: ${similarityPercent}. Question text differs but is similar enough to be considered a match.`}
                      >
                        FUZZY {similarityPercent}
                      </span>
                    );
                  } else {
                    // Check text match for exact matches
                    const textMatch = normalizeText(question.question_text) === normalizeText(gtQuestion.question_text);
                    if (!textMatch) {
                      badges.push(
                        <span 
                          key="text-diff"
                          style={{ 
                            fontSize: '0.625rem',
                            background: 'var(--error)',
                            color: 'white',
                            padding: '0.125rem 0.375rem',
                            borderRadius: '3px',
                            marginLeft: '0.25rem',
                            fontWeight: '600',
                            display: 'inline-block',
                            lineHeight: '1.2'
                          }}
                          title="Question text differs from ground truth"
                        >
                          TEXT
                        </span>
                      );
                    }
                  }
                  
                  // Check type match
                  const typeMatch = question.question_type === gtQuestion.question_type;
                  if (!typeMatch) {
                    badges.push(
                      <span 
                        key="type-diff"
                        style={{ 
                          fontSize: '0.625rem',
                          background: 'var(--warning)',
                          color: 'white',
                          padding: '0.125rem 0.375rem',
                          borderRadius: '3px',
                          marginLeft: '0.25rem',
                          fontWeight: '600',
                          display: 'inline-block',
                          lineHeight: '1.2'
                        }}
                        title={`Type differs: got ${question.question_type}, expected ${gtQuestion.question_type}`}
                      >
                        TYPE
                      </span>
                    );
                  }
                  
                  // Check answer match
                  if (gtQuestion.answers && gtQuestion.answers.length > 0) {
                    const gtAnswers = new Set(gtQuestion.answers.map(a => a.toLowerCase().trim()));
                    const approachAnswers = new Set((question.answers || []).map(a => a.toLowerCase().trim()));
                    const answerMatch = gtAnswers.size === approachAnswers.size && 
                      [...gtAnswers].every(a => approachAnswers.has(a));
                    
                    if (!answerMatch) {
                      badges.push(
                        <span 
                          key="answer-diff"
                          style={{ 
                            fontSize: '0.625rem',
                            background: 'var(--warning)',
                            color: 'white',
                            padding: '0.125rem 0.375rem',
                            borderRadius: '3px',
                            marginLeft: '0.25rem',
                            fontWeight: '600',
                            display: 'inline-block',
                            lineHeight: '1.2'
                          }}
                          title="Answer options differ from ground truth"
                        >
                          ANSWERS
                        </span>
                      );
                    }
                  }
                } else if (groundTruth && question && !gtQuestion) {
                  // Extra question not in GT
                  badges.push(
                    <span 
                      key="extra"
                      style={{ 
                        fontSize: '0.625rem',
                        background: 'var(--error)',
                        color: 'white',
                        padding: '0.125rem 0.375rem',
                        borderRadius: '3px',
                        marginLeft: '0.25rem',
                        fontWeight: '600',
                        display: 'inline-block',
                        lineHeight: '1.2'
                      }}
                      title="Extra question not in ground truth"
                    >
                      EXTRA
                    </span>
                  );
                }
                
                return (
                  <div 
                    key={key} 
                    style={{ 
                      padding: '0.5rem',
                      fontSize: '0.8125rem',
                      borderLeft: `2px solid ${cellStyle.borderColor || 'var(--border)'}`,
                      background: cellStyle.background,
                      cursor: question ? 'help' : 'default'
                    }}
                    title={question ? question.question_text : 'Not found in this approach'}
                  >
                    {question ? (
                      <>
                        <div style={{ marginBottom: '0.25rem', lineHeight: '1.4' }}>
                          {question.question_text.length > 200 
                            ? question.question_text.substring(0, 200) + '...'
                            : question.question_text}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.25rem' }}>
                          <span className="question-type" style={{ fontSize: '0.6875rem' }}>
                            {question.question_type}
                          </span>
                          {badges}
                          {/* Only show confidence for approach 3 */}
                          {question.confidence !== undefined && key.includes('approach_3') && (
                            <span 
                              style={{ 
                                marginLeft: '0.25rem', 
                                fontSize: '0.6875rem',
                                color: question.confidence >= 0.7 ? 'var(--success)' : 'var(--warning)'
                              }}
                              title={`Confidence: ${(question.confidence * 100).toFixed(1)}%`}
                            >
                              {(question.confidence * 100).toFixed(0)}%
                            </span>
                          )}
                        </div>
                      </>
                    ) : (
                      <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                        {gtQuestion ? 'Missing' : 'Not found'}
                      </span>
                    )}
                  </div>
              );
            })}
          </div>
          );
        })}
      </div>

      {/* Detail Modal */}
      {selectedRowIndex !== null && comparisonData[selectedRowIndex] && (
        <QuestionDetailModal
          row={comparisonData[selectedRowIndex]}
          rowIndex={selectedRowIndex}
          approachKeys={approachKeys}
          results={results}
          groundTruth={groundTruth}
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
}

/** Modal component to show full question details */
interface QuestionDetailModalProps {
  row: {
    id: string;
    questions: Record<string, ExtractedQuestion | null>;
    matchInfo: Record<string, { isFuzzy: boolean; similarity?: number }>;
    isUnique: boolean;
    hasDifferences: boolean;
    inGroundTruth: boolean;
    missingFromGroundTruth: boolean;
  };
  rowIndex: number;
  approachKeys: string[];
  results: Record<string, ExtractionResult>;
  groundTruth?: GroundTruth | null;
  onClose: () => void;
}

// Memoize the modal component to prevent unnecessary re-renders
const QuestionDetailModal = memo(function QuestionDetailModal({ row, rowIndex, approachKeys, results, groundTruth, onClose }: QuestionDetailModalProps) {
  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Memoize click handler to prevent re-creating on every render
  const handleBackdropClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '2rem',
      }}
      onClick={handleBackdropClick}
    >
      <div 
        style={{
          background: 'white',
          borderRadius: '12px',
          maxWidth: '1200px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid var(--border)',
          background: row.missingFromGroundTruth
            ? 'rgba(245, 101, 101, 0.12)'
            : row.isUnique 
              ? 'rgba(237, 137, 54, 0.1)' 
              : row.hasDifferences 
                ? 'rgba(245, 101, 101, 0.08)' 
                : 'var(--bg-light)',
          borderRadius: '12px 12px 0 0',
        }}>
          <div>
            <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.25rem' }}>
              Question #{rowIndex + 1}
              {row.missingFromGroundTruth && (
                <span style={{ 
                  marginLeft: '0.75rem', 
                  fontSize: '0.75rem', 
                  background: 'var(--error)', 
                  color: 'white',
                  padding: '0.2rem 0.5rem',
                  borderRadius: '4px',
                  fontWeight: '500'
                }}>
                  Not in Ground Truth
                </span>
              )}
              {row.inGroundTruth && (
                <span style={{ 
                  marginLeft: '0.75rem', 
                  fontSize: '0.75rem', 
                  background: 'var(--success)', 
                  color: 'white',
                  padding: '0.2rem 0.5rem',
                  borderRadius: '4px',
                  fontWeight: '500'
                }}>
                  In Ground Truth
                </span>
              )}
              {groundTruth && row.questions['ground_truth']?.is_problematic && (
                <span style={{ 
                  marginLeft: '0.75rem', 
                  fontSize: '0.75rem', 
                  background: 'var(--error)', 
                  color: 'white',
                  padding: '0.2rem 0.5rem',
                  borderRadius: '4px',
                  fontWeight: '500'
                }}>
                  ⚠️ Problematic
                </span>
              )}
              {!row.missingFromGroundTruth && row.isUnique && (
                <span style={{ 
                  marginLeft: '0.75rem', 
                  fontSize: '0.75rem', 
                  background: 'var(--warning)', 
                  color: 'white',
                  padding: '0.2rem 0.5rem',
                  borderRadius: '4px',
                  fontWeight: '500'
                }}>
                  Unique
                </span>
              )}
              {!row.missingFromGroundTruth && !row.isUnique && row.hasDifferences && (
                <span style={{ 
                  marginLeft: '0.75rem', 
                  fontSize: '0.75rem', 
                  background: 'var(--error)', 
                  color: 'white',
                  padding: '0.2rem 0.5rem',
                  borderRadius: '4px',
                  fontWeight: '500'
                }}>
                  Type Differs
                </span>
              )}
            </h3>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              Click outside or press Escape to close
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              padding: '0.5rem',
              color: 'var(--text-secondary)',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Content - side by side approach columns */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: groundTruth ? `1fr repeat(${approachKeys.length}, 1fr)` : `repeat(${approachKeys.length}, 1fr)`,
          gap: '1px',
          background: 'var(--border)',
        }}>
          {/* Ground Truth column */}
          {groundTruth && (() => {
            const question = row.questions['ground_truth'];
            return (
              <div 
                style={{
                  background: question ? 'rgba(72, 187, 120, 0.08)' : 'var(--bg-light)',
                  padding: '1.25rem',
                }}
              >
                {/* Ground Truth header */}
                <div style={{
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--success)',
                  marginBottom: '1rem',
                  paddingBottom: '0.5rem',
                  borderBottom: '2px solid var(--success)',
                }}>
                  Ground Truth
                </div>

                {question ? (
                  <div>
                    {/* Question text */}
                    <div style={{ 
                      fontSize: '0.9375rem',
                      lineHeight: '1.6',
                      marginBottom: '1rem',
                    }}>
                      {question.question_text}
                    </div>

                    {/* Type */}
                    <div style={{ marginBottom: '0.75rem' }}>
                      <div style={{ 
                        fontSize: '0.6875rem', 
                        fontWeight: '500', 
                        color: 'var(--text-secondary)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        marginBottom: '0.25rem'
                      }}>
                        Type
                      </div>
                      <span className="question-type">
                        {question.question_type}
                      </span>
                    </div>

                    {/* Answers if available */}
                    {question.answers && question.answers.length > 0 && (
                      <div style={{ marginBottom: '0.75rem' }}>
                        <div style={{ 
                          fontSize: '0.6875rem', 
                          fontWeight: '500', 
                          color: 'var(--text-secondary)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          marginBottom: '0.5rem'
                        }}>
                          Answers ({question.answers.length})
                        </div>
                        <ul style={{ 
                          margin: 0, 
                          paddingLeft: '1.25rem',
                          fontSize: '0.875rem',
                          color: 'var(--text-primary)',
                        }}>
                          {question.answers.map((answer, i) => (
                            <li key={i} style={{ marginBottom: '0.25rem' }}>{answer}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Problematic indicator */}
                    {question.is_problematic && (
                      <div style={{ 
                        marginBottom: '1rem',
                        padding: '0.75rem',
                        background: 'rgba(245, 101, 101, 0.1)',
                        borderLeft: '3px solid var(--error)',
                        borderRadius: '4px',
                      }}>
                        <div style={{ 
                          fontSize: '0.75rem', 
                          fontWeight: '600', 
                          color: 'var(--error)',
                          marginBottom: question.problematic_comment ? '0.5rem' : 0,
                        }}>
                          ⚠️ MARKED AS PROBLEMATIC
                        </div>
                        {question.problematic_comment && (
                          <div style={{ 
                            fontSize: '0.8125rem',
                            color: 'var(--text-primary)',
                            lineHeight: '1.5',
                          }}>
                            {question.problematic_comment}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Sheet/Row info */}
                    {question.sheet_name && (
                      <div style={{ 
                        marginTop: '1rem',
                        fontSize: '0.75rem',
                        color: 'var(--text-secondary)'
                      }}>
                        Sheet: {question.sheet_name}
                        {question.row_index && `, Row ${question.row_index}`}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{
                    textAlign: 'center',
                    padding: '2rem 1rem',
                    color: 'var(--text-secondary)',
                  }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem', opacity: 0.5 }}>∅</div>
                    <div style={{ fontStyle: 'italic' }}>Not in ground truth</div>
                  </div>
                )}
              </div>
            );
          })()}
          {approachKeys.map(key => {
            const question = row.questions[key];
            const matchInfo = row.matchInfo[key];
            const gtQuestion = row.questions['ground_truth'];
            return (
              <div 
                key={key}
                style={{
                  background: question ? 'white' : 'var(--bg-light)',
                  padding: '1.25rem',
                }}
              >
                {/* Approach header */}
                <div style={{
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--primary)',
                  marginBottom: '1rem',
                  paddingBottom: '0.5rem',
                  borderBottom: '2px solid var(--primary)',
                }}>
                  {formatResultKey(key, results[key])}
                </div>

                {question ? (
                  <div>
                    {/* Full question text */}
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{ 
                        fontSize: '0.6875rem', 
                        fontWeight: '500', 
                        color: 'var(--text-secondary)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        marginBottom: '0.5rem'
                      }}>
                        Question Text
                      </div>
                      <div style={{ 
                        fontSize: '0.9375rem', 
                        lineHeight: '1.6',
                        color: 'var(--text-primary)',
                        background: 'var(--bg-light)',
                        padding: '0.75rem',
                        borderRadius: '6px',
                      }}>
                        {question.question_text}
                      </div>
                    </div>

                    {/* Question type */}
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{ 
                        fontSize: '0.6875rem', 
                        fontWeight: '500', 
                        color: 'var(--text-secondary)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        marginBottom: '0.5rem'
                      }}>
                        Type
                      </div>
                      <span className="question-type" style={{ fontSize: '0.8125rem' }}>
                        {question.question_type}
                      </span>
                    </div>

                    {/* Answers if available */}
                    {question.answers && question.answers.length > 0 && (
                      <div style={{ marginBottom: '1rem' }}>
                        <div style={{ 
                          fontSize: '0.6875rem', 
                          fontWeight: '500', 
                          color: 'var(--text-secondary)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          marginBottom: '0.5rem'
                        }}>
                          Answer Options
                        </div>
                        <ul style={{ 
                          margin: 0, 
                          paddingLeft: '1.25rem',
                          fontSize: '0.875rem',
                          color: 'var(--text-primary)',
                        }}>
                          {question.answers.map((answer, i) => (
                            <li key={i} style={{ marginBottom: '0.25rem' }}>{answer}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Confidence if available - only for approach 3 */}
                    {question.confidence !== undefined && key.includes('approach_3') && (
                      <div>
                        <div style={{ 
                          fontSize: '0.6875rem', 
                          fontWeight: '500', 
                          color: 'var(--text-secondary)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          marginBottom: '0.5rem'
                        }}>
                          Confidence
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ 
                            flex: 1, 
                            height: '8px', 
                            background: 'var(--border)',
                            borderRadius: '4px',
                            overflow: 'hidden'
                          }}>
                            <div style={{
                              width: `${question.confidence * 100}%`,
                              height: '100%',
                              background: question.confidence >= 0.7 ? 'var(--success)' : 'var(--warning)',
                              borderRadius: '4px',
                            }} />
                          </div>
                          <span style={{ 
                            fontSize: '0.875rem', 
                            fontWeight: '500',
                            color: question.confidence >= 0.7 ? 'var(--success)' : 'var(--warning)'
                          }}>
                            {(question.confidence * 100).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Row index if available */}
                    {question.row_index && (
                      <div style={{ 
                        marginTop: '1rem',
                        fontSize: '0.75rem',
                        color: 'var(--text-secondary)'
                      }}>
                        Source: Row {question.row_index}
                        {question.sheet_name && ` in "${question.sheet_name}"`}
                      </div>
                    )}

                    {/* Fuzzy match indicator - moved to bottom */}
                    {groundTruth && gtQuestion && matchInfo?.isFuzzy && (
                      <div style={{
                        marginTop: '1rem',
                        padding: '0.75rem',
                        background: 'rgba(72, 187, 120, 0.1)',
                        borderLeft: '3px solid var(--success)',
                        borderRadius: '4px',
                      }}>
                        <div style={{
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          color: 'var(--success)',
                          marginBottom: '0.25rem',
                        }}>
                          ✓ Fuzzy Match
                        </div>
                        <div style={{
                          fontSize: '0.8125rem',
                          color: 'var(--text-primary)',
                          lineHeight: '1.5',
                        }}>
                          Text similarity: {matchInfo.similarity ? `${(matchInfo.similarity * 100).toFixed(1)}%` : '~80%'}
                          <br />
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            Question text differs from ground truth but is similar enough to be considered a match.
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{
                    textAlign: 'center',
                    padding: '2rem 1rem',
                    color: 'var(--text-secondary)',
                  }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem', opacity: 0.5 }}>∅</div>
                    <div style={{ fontStyle: 'italic' }}>Not found in this approach</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

