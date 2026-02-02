import { useEffect, useState, useMemo, useCallback, memo, useRef, type ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
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
  const [isLoading, setIsLoading] = useState(!results);
  const [error, setError] = useState<string | null>(null);
  const [localResults, setLocalResults] = useState<ExtractionResponse | null>(null);
  
  // Ref to prevent double execution in React StrictMode
  const hasTriggeredExtraction = useRef(false);

  // Fetch full ground truth data for comparison view
  const groundTruthDataQuery = useQuery({
    queryKey: ['groundTruthData', fileName],
    queryFn: () => getGroundTruthByFilename(fileName),
    enabled: !!fileName,
  });

  // Trigger extraction on mount if no results
  useEffect(() => {
    if (!results && !hasTriggeredExtraction.current) {
      hasTriggeredExtraction.current = true;
      setIsLoading(true);
      setError(null);
      
      runExtraction(fileId, config)
        .then((data) => {
          setLocalResults(data);
          setIsLoading(false);
          onResultsReceived(data);
          // Select first approach by default
          const firstKey = Object.keys(data.results)[0];
          if (firstKey) setSelectedApproach(firstKey);
          // Auto-switch to comparison view if multiple approaches
          if (Object.keys(data.results).length > 1) {
            setViewMode('comparison');
          }
        })
        .catch((err) => {
          setIsLoading(false);
          setError(err.message || 'Extraction failed');
          onError(err.message || 'Extraction failed');
        });
    } else if (results && !selectedApproach) {
      // Set selected approach from existing results
      const firstKey = Object.keys(results.results)[0];
      if (firstKey) setSelectedApproach(firstKey);
      if (Object.keys(results.results).length > 1) {
        setViewMode('comparison');
      }
    }
  }, []);

  // Auto-switch to comparison view when ground truth is loaded
  useEffect(() => {
    if (groundTruthDataQuery.data && viewMode === 'individual') {
      setViewMode('comparison');
    }
  }, [groundTruthDataQuery.data, viewMode]);

  // Use results from props, or local results
  const effectiveResults = results || localResults;

  // Show loading while extraction is running
  if (isLoading) {
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

  // If error or no results, show error with retry
  if (error || !effectiveResults) {
    return (
      <div className="card">
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <p style={{ color: 'var(--error)', marginBottom: '1rem' }}>
            {error || 'No results available'}
          </p>
          <button 
            className="btn btn-primary" 
            onClick={() => {
              hasTriggeredExtraction.current = false;
              setIsLoading(true);
              setError(null);
              runExtraction(fileId, config)
                .then((data) => {
                  setLocalResults(data);
                  setIsLoading(false);
                  onResultsReceived(data);
                  const firstKey = Object.keys(data.results)[0];
                  if (firstKey) setSelectedApproach(firstKey);
                  if (Object.keys(data.results).length > 1) {
                    setViewMode('comparison');
                  }
                })
                .catch((err) => {
                  setIsLoading(false);
                  setError(err.message || 'Extraction failed');
                });
            }}
          >
            Retry Extraction
          </button>
          <button 
            className="btn btn-secondary" 
            onClick={onReset}
            style={{ marginLeft: '0.5rem' }}
          >
            Start Over
          </button>
        </div>
      </div>
    );
  }

  const approachKeys = Object.keys(effectiveResults.results);
  const comparison = effectiveResults.comparison;
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
          results={effectiveResults.results} 
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
                  {formatResultKey(key, effectiveResults.results[key])}
                </button>
              ))}
            </div>
          )}

          {/* Selected approach results */}
          {selectedApproach && effectiveResults.results[selectedApproach] && (
            <ApproachResults result={effectiveResults.results[selectedApproach]} />
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
          Run ID: {effectiveResults.run_id}
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

/** Get full question text including help_text for comparison purposes */
function getFullQuestionText(question: { question_text: string; help_text?: string | null }): string {
  if (question.help_text) {
    return `${question.question_text} ${question.help_text}`;
  }
  return question.question_text;
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

/** Calculate answer similarity using Jaccard index (intersection / union) */
/** Normalize answer text for comparison (removes punctuation, normalizes whitespace) */
function normalizeAnswer(a: string): string {
  return a.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}

function answerSimilarity(answers1: string[] | null | undefined, answers2: string[] | null | undefined): number {
  const set1 = new Set((answers1 || []).map(normalizeAnswer));
  const set2 = new Set((answers2 || []).map(normalizeAnswer));
  
  if (set1.size === 0 && set2.size === 0) return 1.0; // Both empty = match
  if (set1.size === 0 || set2.size === 0) return 0.5; // One empty = partial
  
  const intersection = [...set1].filter(a => set2.has(a)).length;
  const union = new Set([...set1, ...set2]).size;
  
  return union > 0 ? intersection / union : 0;
}

interface ComparisonViewProps {
  results: Record<string, ExtractionResult>;
  approachKeys: string[];
  groundTruth?: GroundTruth | null;
}

// Types for comparison row data
interface ComparisonRowData {
  id: string;
  questions: Record<string, ExtractedQuestion | null>;
  matchInfo: Record<string, { isFuzzy: boolean; similarity?: number }>;
  isUnique: boolean;
  hasDifferences: boolean;
  inGroundTruth: boolean;
  missingFromGroundTruth: boolean;
  gtDuplicateRows: number[];
}

// Helper to determine cell color for an approach
function getCellStyle(
  row: ComparisonRowData,
  approachKey: string,
  hasGroundTruth: boolean
): { background: string; borderColor?: string } {
  const question = row.questions[approachKey];
  const gtQuestion = row.questions['ground_truth'];
  const matchInfo = row.matchInfo[approachKey];
  const isFuzzyMatch = matchInfo?.isFuzzy || false;
  
  if (!hasGroundTruth) {
    return { background: question ? 'white' : 'var(--bg-light)' };
  }
  
  if (!question) {
    if (gtQuestion) {
      return { background: 'rgba(245, 101, 101, 0.15)', borderColor: 'var(--error)' };
    }
    return { background: 'var(--bg-light)' };
  }
  
  if (!gtQuestion) {
    return { background: 'rgba(245, 101, 101, 0.15)', borderColor: 'var(--error)' };
  }
  
  const typeMatch = question.question_type === gtQuestion.question_type;
  const gtAnswers = new Set((gtQuestion.answers || []).map(a => a.toLowerCase().trim()));
  const approachAnswers = new Set((question.answers || []).map(a => a.toLowerCase().trim()));
  const answerMatch = gtAnswers.size === 0 || 
    (gtAnswers.size === approachAnswers.size && [...gtAnswers].every(a => approachAnswers.has(a)));
  
  if (isFuzzyMatch) {
    if (typeMatch && answerMatch) {
      return { background: 'rgba(72, 187, 120, 0.15)', borderColor: 'var(--success)' };
    } else if (typeMatch || answerMatch) {
      return { background: 'rgba(72, 187, 120, 0.2)', borderColor: 'var(--success)' };
    } else {
      return { background: 'rgba(72, 187, 120, 0.25)', borderColor: 'var(--success)' };
    }
  }
  
  if (typeMatch && answerMatch) {
    return { background: 'rgba(72, 187, 120, 0.12)', borderColor: 'var(--success)' };
  } else if (typeMatch || answerMatch) {
    return { background: 'rgba(237, 137, 54, 0.15)', borderColor: 'var(--warning)' };
  } else {
    return { background: 'rgba(245, 101, 101, 0.15)', borderColor: 'var(--error)' };
  }
}

// Memoized comparison rows component
interface ComparisonRowsProps {
  comparisonData: ComparisonRowData[];
  approachKeys: string[];
  results: Record<string, ExtractionResult>;
  groundTruth?: GroundTruth | null;
  onRowClick: (index: number) => void;
}

const ComparisonRows = memo(function ComparisonRows({ 
  comparisonData, 
  approachKeys, 
  results, 
  groundTruth, 
  onRowClick 
}: ComparisonRowsProps) {
  // Build mapping from question_id (GUID) to table row position (1-based)
  // Dependencies reference other questions by their GUID
  const questionIdToTableRow = useMemo(() => {
    const mapping = new Map<string, number>();
    
    comparisonData.forEach((row, index) => {
      const tableRowNum = index + 1; // 1-based table row
      
      // For each question in the row, map its GUID to this table row
      Object.values(row.questions).forEach(question => {
        if (question?.question_id) {
          if (!mapping.has(question.question_id)) {
            mapping.set(question.question_id, tableRowNum);
          }
        }
      });
    });
    
    return mapping;
  }, [comparisonData]);
  
  return (
    <>
      {comparisonData.map((row, index) => (
        <ComparisonRow
          key={row.id}
          row={row}
          index={index}
          approachKeys={approachKeys}
          results={results}
          hasGroundTruth={!!groundTruth}
          onRowClick={onRowClick}
          questionIdToTableRow={questionIdToTableRow}
        />
      ))}
    </>
  );
});

// Memoized single row component
interface ComparisonRowProps {
  row: ComparisonRowData;
  index: number;
  approachKeys: string[];
  results: Record<string, ExtractionResult>;
  hasGroundTruth: boolean;
  onRowClick: (index: number) => void;
  questionIdToTableRow: Map<string, number>; // Maps question_id (GUID) to table row (1-based)
}

const ComparisonRow = memo(function ComparisonRow({ 
  row, 
  index, 
  approachKeys, 
  results,
  hasGroundTruth, 
  onRowClick,
  questionIdToTableRow,
}: ComparisonRowProps) {
  const gtQuestion = row.questions['ground_truth'];
  const handleClick = useCallback(() => onRowClick(index), [onRowClick, index]);
  
  return (
    <div 
      className="comparison-row"
      onClick={handleClick}
      style={{ 
        display: 'grid', 
        gridTemplateColumns: `50px ${hasGroundTruth ? '1fr ' : ''}repeat(${approachKeys.length}, 1fr)`,
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
      }}
    >
      <div 
        style={{ 
          padding: '0.5rem', 
          fontSize: '0.75rem', 
          color: 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
        }}
        title={`Row ${index + 1}`}
      >
        {index + 1}
      </div>
      {/* Ground Truth column */}
      {hasGroundTruth && (
        <div 
          style={{ 
            padding: '0.5rem',
            fontSize: '0.8125rem',
            borderLeft: '1px solid var(--border)',
            background: gtQuestion ? (row.gtDuplicateRows.length > 0 ? 'rgba(237, 137, 54, 0.1)' : 'white') : 'var(--bg-light)',
          }}
          title={gtQuestion ? gtQuestion.question_text : 'Not in ground truth'}
        >
          {gtQuestion ? (
            <>
              <div style={{ marginBottom: '0.25rem', lineHeight: '1.4' }}>
                {gtQuestion.question_text.length > 200 
                  ? gtQuestion.question_text.substring(0, 200) + '...'
                  : gtQuestion.question_text}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span className="question-type" style={{ fontSize: '0.6875rem' }}>
                  {gtQuestion.question_type}
                </span>
                {row.gtDuplicateRows.length > 0 && (
                  <span 
                    style={{ 
                      fontSize: '0.625rem',
                      background: 'var(--warning)',
                      color: 'white',
                      padding: '0.125rem 0.375rem',
                      borderRadius: '3px',
                      fontWeight: '600',
                    }}
                    title={`Duplicate: rows ${row.gtDuplicateRows.map(r => '#' + r).join(', ')}`}
                  >
                    DUP
                  </span>
                )}
                {gtQuestion.is_problematic && (
                  <span style={{ fontSize: '0.6875rem', color: 'var(--error)', fontWeight: '600' }}>
                    ⚠️
                  </span>
                )}
              </div>
            </>
          ) : (
            <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>Not in GT</span>
          )}
        </div>
      )}
      {/* Approach columns */}
      {approachKeys.map(key => {
        const question = row.questions[key];
        const cellStyle = getCellStyle(row, key, hasGroundTruth);
        const matchInfo = row.matchInfo[key];
        
        return (
          <div 
            key={key} 
            style={{ 
              padding: '0.5rem',
              fontSize: '0.8125rem',
              borderLeft: `2px solid ${cellStyle.borderColor || 'var(--border)'}`,
              background: cellStyle.background,
            }}
            title={question ? getFullQuestionText(question) : 'Not found'}
          >
            {question ? (
              <>
                <div style={{ marginBottom: '0.25rem', lineHeight: '1.4' }}>
                  {question.question_text.length > 200 
                    ? question.question_text.substring(0, 200) + '...'
                    : question.question_text}
                  {/* Show help_text if present */}
                  {question.help_text && (
                    <span style={{ 
                      color: 'var(--text-secondary)', 
                      fontStyle: 'italic',
                      fontSize: '0.75rem',
                      display: 'block',
                      marginTop: '0.125rem'
                    }}>
                      {question.help_text.length > 100 
                        ? question.help_text.substring(0, 100) + '...'
                        : question.help_text}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.25rem' }}>
                  <span className="question-type" style={{ fontSize: '0.6875rem' }}>
                    {question.question_type}
                  </span>
                  {matchInfo?.isFuzzy && (
                    <span style={{ fontSize: '0.625rem', background: 'rgba(72, 187, 120, 0.9)', color: 'white', padding: '0.125rem 0.375rem', borderRadius: '3px', fontWeight: '600' }}>
                      FUZZY
                    </span>
                  )}
                  {hasGroundTruth && gtQuestion && question.question_type !== gtQuestion.question_type && (
                    <span style={{ fontSize: '0.625rem', background: 'var(--warning)', color: 'white', padding: '0.125rem 0.375rem', borderRadius: '3px', fontWeight: '600' }}>
                      TYPE
                    </span>
                  )}
                  {/* Answer difference badge */}
                  {hasGroundTruth && gtQuestion && (() => {
                    const gtAnswerCount = gtQuestion.answers?.length || 0;
                    const approachAnswerCount = question.answers?.length || 0;
                    
                    if (gtAnswerCount === 0 && approachAnswerCount === 0) return null;
                    
                    // Calculate match percentage using proper normalization (same as question matching)
                    const gtSet = new Set((gtQuestion.answers || []).map(normalizeAnswer));
                    const approachSet = new Set((question.answers || []).map(normalizeAnswer));
                    const intersection = [...gtSet].filter(a => approachSet.has(a)).length;
                    const matchPercent = gtSet.size > 0 ? Math.round((intersection / gtSet.size) * 100) : 100;
                    
                    const countDiffers = gtAnswerCount !== approachAnswerCount;
                    const isFullMatch = matchPercent === 100 && !countDiffers;
                    
                    if (isFullMatch) return null; // Don't show badge if perfect match
                    
                    return (
                      <span 
                        style={{ 
                          fontSize: '0.625rem',
                          background: matchPercent === 0 ? 'var(--error)' : 'var(--warning)',
                          color: 'white',
                          padding: '0.125rem 0.375rem',
                          borderRadius: '3px',
                          fontWeight: '600',
                        }}
                        title={`Answers: ${intersection}/${gtSet.size} match. Approach has ${approachAnswerCount}, GT has ${gtAnswerCount}`}
                      >
                        ANS {countDiffers ? `${approachAnswerCount}/${gtAnswerCount}` : `${matchPercent}%`}
                      </span>
                    );
                  })()}
                  {hasGroundTruth && question && !gtQuestion && (
                    <span style={{ fontSize: '0.625rem', background: 'var(--error)', color: 'white', padding: '0.125rem 0.375rem', borderRadius: '3px', fontWeight: '600' }}>
                      EXTRA
                    </span>
                  )}
                  {question.confidence !== undefined && key.includes('approach_3') && (
                    <span style={{ fontSize: '0.6875rem', color: question.confidence >= 0.7 ? 'var(--success)' : 'var(--warning)' }}>
                      {(question.confidence * 100).toFixed(0)}%
                    </span>
                  )}
                  {/* Dependencies badges */}
                  {question.dependencies && question.dependencies.length > 0 && question.dependencies.map((dep, depIdx) => {
                    const depAction = dep.dependency_action || 'show';
                    const depQuestionId = dep.depends_on_question_id;
                    const bgColor = depAction === 'skip' ? '#8b5cf6' : '#0ea5e9'; // purple for skip, cyan for show
                    
                    // Map the dependency's composite key (sheet:row) to table row position
                    const tableRowNum = depQuestionId ? questionIdToTableRow.get(depQuestionId) : undefined;
                    // If lookup fails, show the raw dependency ID to help debug
                    const displayId = tableRowNum !== undefined ? `#${tableRowNum}` : (depQuestionId ? `(${depQuestionId})` : '?');
                    
                    return (
                      <span
                        key={depIdx}
                        style={{
                          fontSize: '0.5625rem',
                          background: bgColor,
                          color: 'white',
                          padding: '0.125rem 0.375rem',
                          borderRadius: '3px',
                          fontWeight: '600',
                          textTransform: 'uppercase',
                        }}
                        title={`${depAction.toUpperCase()}: Depends on ${tableRowNum !== undefined ? `table row #${tableRowNum}` : `ref ${depQuestionId || '?'} (not found in table)`} when "${dep.depends_on_answer_value || 'condition met'}"`}
                      >
                        {depAction === 'skip' ? 'SKIP' : 'DEP'}: {displayId}
                      </span>
                    );
                  })}
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
});

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
      missedIds.push(gtQ.question_id || `R${gtQ.row_index || '?'}`);
    }
  }

  // Track extra IDs (in approach but not matched to GT)
  const extraIds: string[] = [];
  let extraIndex = 1;
  for (let appIdx = 0; appIdx < approachQuestions.length; appIdx++) {
    if (!matchedApproachIndices.has(appIdx)) {
      const approachQ = approachQuestions[appIdx];
      extraIds.push(approachQ.question_id || (approachQ.row_index ? `R${approachQ.row_index}` : `E${extraIndex++}`));
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
      
      // First pass: build the duplicate map (use full text including help_text)
      for (let gtIndex = 0; gtIndex < gtQuestions.length; gtIndex++) {
        const gtNormalized = normalizeText(getFullQuestionText(gtQuestions[gtIndex]));
        if (!gtTextToRowIndices.has(gtNormalized)) {
          gtTextToRowIndices.set(gtNormalized, []);
        }
        gtTextToRowIndices.get(gtNormalized)!.push(gtIndex);
      }
      
      for (let gtIndex = 0; gtIndex < gtQuestions.length; gtIndex++) {
        const gtQuestion = gtQuestions[gtIndex];
        // Use full text (question_text + help_text) for matching
        const gtFullText = getFullQuestionText(gtQuestion);
        const gtNormalized = normalizeText(gtFullText);
        
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
          
          // First pass: collect all exact text matches
          let matchedIndex = -1;
          let isFuzzyMatch = false;
          let similarity = 1.0;
          
          const exactMatches: number[] = [];
          for (let i = 0; i < result.questions.length; i++) {
            if (matchedApproachQuestions[key].has(i)) continue;
            
            // Use full text (question_text + help_text) for matching
            const approachFullText = getFullQuestionText(result.questions[i]);
            const approachNormalized = normalizeText(approachFullText);
            if (approachNormalized === gtNormalized) {
              exactMatches.push(i);
            }
          }
          
          // If multiple exact matches, use answer similarity to pick best
          if (exactMatches.length === 1) {
            matchedIndex = exactMatches[0];
            isFuzzyMatch = false;
            similarity = 1.0;
          } else if (exactMatches.length > 1) {
            // Pick the one with best answer similarity
            let bestAnswerSim = -1;
            for (const idx of exactMatches) {
              const answerSim = answerSimilarity(gtQuestion.answers, result.questions[idx].answers);
              if (answerSim > bestAnswerSim) {
                bestAnswerSim = answerSim;
                matchedIndex = idx;
              }
            }
            isFuzzyMatch = false;
            similarity = 1.0;
          }
          
          // Second pass: fuzzy matching if no exact match found
          // Uses combined text + answer similarity score
          if (matchedIndex === -1) {
            let bestScore = 0;
            let bestIndex = -1;
            let bestTextSimilarity = 0;
            
            for (let i = 0; i < result.questions.length; i++) {
              if (matchedApproachQuestions[key].has(i)) continue;
              
              // Use full text (question_text + help_text) for fuzzy matching
              const approachFullText = getFullQuestionText(result.questions[i]);
              const textSim = textSimilarity(gtFullText, approachFullText);
              if (textSim < FUZZY_THRESHOLD) continue;
              
              const answerSim = answerSimilarity(gtQuestion.answers, result.questions[i].answers);
              
              // Combined score: weight text more if answers are missing
              const hasAnswers = (gtQuestion.answers?.length || 0) > 0;
              const combinedScore = hasAnswers 
                ? textSim * 0.5 + answerSim * 0.5 
                : textSim;
              
              if (combinedScore > bestScore) {
                bestScore = combinedScore;
                bestIndex = i;
                bestTextSimilarity = textSim;
              }
            }
            
            if (bestIndex >= 0) {
              matchedIndex = bestIndex;
              isFuzzyMatch = true;
              similarity = bestTextSimilarity;
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

  // Build mapping from question_id (GUID) to table row position (1-based)
  // Dependencies reference other questions by their GUID
  const questionIdToTableRow = useMemo(() => {
    const mapping = new Map<string, number>();
    
    comparisonData.forEach((row, index) => {
      const tableRowNum = index + 1; // 1-based table row
      
      // For each question in the row, map its GUID to this table row
      Object.values(row.questions).forEach(question => {
        if (question?.question_id) {
          if (!mapping.has(question.question_id)) {
            mapping.set(question.question_id, tableRowNum);
          }
        }
      });
    });
    
    return mapping;
  }, [comparisonData]);

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

        {/* Rows - memoized to prevent re-renders when modal opens/closes */}
        <ComparisonRows 
          comparisonData={comparisonData}
          approachKeys={approachKeys}
          results={results}
          groundTruth={groundTruth}
          onRowClick={setSelectedRowIndex}
        />
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
          questionIdToTableRow={questionIdToTableRow}
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
  questionIdToTableRow: Map<string, number>;
}

// Memoize the modal component to prevent unnecessary re-renders
const QuestionDetailModal = memo(function QuestionDetailModal({ row, rowIndex, approachKeys, results, groundTruth, onClose, questionIdToTableRow }: QuestionDetailModalProps) {
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
                      marginBottom: question.help_text ? '0.5rem' : '1rem',
                    }}>
                      {question.question_text}
                    </div>

                    {/* Help text / Instructions if present */}
                    {question.help_text && (
                      <div style={{ 
                        fontSize: '0.8125rem',
                        lineHeight: '1.5',
                        marginBottom: '1rem',
                        padding: '0.5rem 0.75rem',
                        background: 'var(--bg-light)',
                        borderRadius: '4px',
                        color: 'var(--text-secondary)',
                        fontStyle: 'italic',
                        borderLeft: '3px solid var(--primary)',
                      }}>
                        {question.help_text}
                      </div>
                    )}

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

                    {/* Dependencies */}
                    {question.dependencies && question.dependencies.length > 0 && (
                      <div style={{ marginBottom: '0.75rem' }}>
                        <div style={{ 
                          fontSize: '0.6875rem', 
                          fontWeight: '500', 
                          color: 'var(--text-secondary)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          marginBottom: '0.5rem'
                        }}>
                          Dependencies ({question.dependencies.length})
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {question.dependencies.map((dep, depIdx) => {
                            const depAction = dep.dependency_action || 'show';
                            const bgColor = depAction === 'skip' ? 'rgba(139, 92, 246, 0.15)' : 'rgba(14, 165, 233, 0.15)';
                            const borderColor = depAction === 'skip' ? '#8b5cf6' : '#0ea5e9';
                            const textColor = depAction === 'skip' ? '#7c3aed' : '#0284c7';
                            const depQuestionId = dep.depends_on_question_id;
                            const tableRowNum = depQuestionId ? questionIdToTableRow.get(depQuestionId) : undefined;
                            const displayId = tableRowNum !== undefined ? `table row #${tableRowNum}` : (depQuestionId ? `ref: ${depQuestionId}` : '?');
                            const lookupFailed = tableRowNum === undefined && depQuestionId;
                            
                            return (
                              <div
                                key={depIdx}
                                style={{
                                  padding: '0.5rem 0.75rem',
                                  background: bgColor,
                                  borderLeft: `3px solid ${borderColor}`,
                                  borderRadius: '4px',
                                  fontSize: '0.8125rem',
                                }}
                              >
                                <div style={{ fontWeight: '600', color: textColor, marginBottom: '0.25rem' }}>
                                  {depAction.toUpperCase()}: Depends on {displayId}
                                  {lookupFailed && <span style={{ fontSize: '0.7rem', opacity: 0.7 }}> (not in table)</span>}
                                </div>
                                {dep.depends_on_answer_value && (
                                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                                    When: "{dep.depends_on_answer_value}"
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
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
                          MARKED AS PROBLEMATIC
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
                        {/* Help text / Instructions if present */}
                        {question.help_text && (
                          <div style={{ 
                            marginTop: '0.5rem',
                            paddingTop: '0.5rem',
                            borderTop: '1px solid var(--border)',
                            fontSize: '0.8125rem',
                            color: 'var(--text-secondary)',
                            fontStyle: 'italic',
                          }}>
                            {question.help_text}
                          </div>
                        )}
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

                    {/* Dependencies */}
                    {question.dependencies && question.dependencies.length > 0 && (
                      <div style={{ marginBottom: '1rem' }}>
                        <div style={{ 
                          fontSize: '0.6875rem', 
                          fontWeight: '500', 
                          color: 'var(--text-secondary)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          marginBottom: '0.5rem'
                        }}>
                          Dependencies ({question.dependencies.length})
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {question.dependencies.map((dep, depIdx) => {
                            const depAction = dep.dependency_action || 'show';
                            const bgColor = depAction === 'skip' ? 'rgba(139, 92, 246, 0.15)' : 'rgba(14, 165, 233, 0.15)';
                            const borderColor = depAction === 'skip' ? '#8b5cf6' : '#0ea5e9';
                            const textColor = depAction === 'skip' ? '#7c3aed' : '#0284c7';
                            const depQuestionId = dep.depends_on_question_id;
                            const tableRowNum = depQuestionId ? questionIdToTableRow.get(depQuestionId) : undefined;
                            const displayId = tableRowNum !== undefined ? `table row #${tableRowNum}` : (depQuestionId ? `ref: ${depQuestionId}` : '?');
                            const lookupFailed = tableRowNum === undefined && depQuestionId;
                            
                            return (
                              <div
                                key={depIdx}
                                style={{
                                  padding: '0.5rem 0.75rem',
                                  background: bgColor,
                                  borderLeft: `3px solid ${borderColor}`,
                                  borderRadius: '4px',
                                  fontSize: '0.8125rem',
                                }}
                              >
                                <div style={{ fontWeight: '600', color: textColor, marginBottom: '0.25rem' }}>
                                  {depAction.toUpperCase()}: Depends on {displayId}
                                  {lookupFailed && <span style={{ fontSize: '0.7rem', opacity: 0.7 }}> (not in table)</span>}
                                </div>
                                {dep.depends_on_answer_value && (
                                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                                    When: "{dep.depends_on_answer_value}"
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
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

