import { useEffect, useState, useMemo } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { runExtraction, compareWithGroundTruth, getGroundTruthByFilename } from '../../api/client';
import type { ExtractionConfig, ExtractionResponse, ExtractionResult, ExtractedQuestion, GroundTruthComparisonResult, GroundTruth } from '../../types';

interface ResultsStepProps {
  fileId: string;
  fileName: string;
  config: ExtractionConfig;
  results?: ExtractionResponse;
  onResultsReceived: (results: ExtractionResponse) => void;
  onError: (error: string) => void;
  onReset: () => void;
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

  // Ground truth comparison query
  const groundTruthQuery = useQuery({
    queryKey: ['groundTruthComparison', fileName, results?.run_id],
    queryFn: () => compareWithGroundTruth(fileName, results!.results),
    enabled: !!results && !!fileName,
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

      {/* Ground Truth Comparison */}
      {groundTruthQuery.data && Object.keys(groundTruthQuery.data).length > 0 && (
        <GroundTruthComparisonSection 
          comparisons={groundTruthQuery.data} 
          approachKeys={approachKeys}
          results={results.results}
        />
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
          Start Over
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
              {question.confidence !== undefined && (
                <div style={{ marginLeft: '1rem', minWidth: '60px', textAlign: 'right' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {(question.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              )}
            </div>
            {question.confidence !== undefined && (
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
    .trim()
    .substring(0, 100); // Compare first 100 chars
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
function calculateDetailedMetrics(
  approachQuestions: ExtractedQuestion[],
  gtQuestions: ExtractedQuestion[]
): {
  textMatchRate: number;
  typeMatchRate: number;
  answerMatchRate: number;
  overallAccuracy: number;
  matchedCount: number;
} {
  if (gtQuestions.length === 0) {
    return { textMatchRate: 0, typeMatchRate: 0, answerMatchRate: 0, overallAccuracy: 0, matchedCount: 0 };
  }

  let textMatches = 0;
  let typeMatches = 0;
  let answerMatches = 0;
  let answerComparisons = 0;

  const gtNormalized = new Map<string, ExtractedQuestion>();
  for (const q of gtQuestions) {
    gtNormalized.set(normalizeText(q.question_text), q);
  }

  for (const approachQ of approachQuestions) {
    const normalized = normalizeText(approachQ.question_text);
    const gtQ = gtNormalized.get(normalized);
    
    if (gtQ) {
      textMatches++;
      
      // Type match
      if (approachQ.question_type === gtQ.question_type) {
        typeMatches++;
      }
      
      // Answer match (only if GT has answers)
      if (gtQ.answers && gtQ.answers.length > 0) {
        answerComparisons++;
        const gtAnswers = new Set(gtQ.answers.map(a => a.toLowerCase().trim()));
        const approachAnswers = new Set((approachQ.answers || []).map(a => a.toLowerCase().trim()));
        
        // Check if answers match (same set)
        if (gtAnswers.size === approachAnswers.size && 
            [...gtAnswers].every(a => approachAnswers.has(a))) {
          answerMatches++;
        }
      }
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
  };
}

function ComparisonView({ results, approachKeys, groundTruth }: ComparisonViewProps) {
  // State for modal
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);

  // Include ground truth as a column
  const allColumnKeys = groundTruth ? ['ground_truth', ...approachKeys] : approachKeys;

  // Build a unified list of all questions across approaches
  const comparisonData = useMemo(() => {
    // Create a map of normalized text -> question data per approach
    const questionMap = new Map<string, Record<string, ExtractedQuestion | null>>();
    
    // Add ground truth questions first (if available)
    if (groundTruth) {
      const gtQuestions = groundTruthToExtractedQuestions(groundTruth);
      for (const question of gtQuestions) {
        const normalized = normalizeText(question.question_text);
        if (!questionMap.has(normalized)) {
          questionMap.set(normalized, {});
        }
        questionMap.get(normalized)!['ground_truth'] = question;
      }
    }
    
    // Collect all questions from all approaches
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
    
    // Convert to array and sort by first appearance
    const rows: Array<{
      id: string;
      questions: Record<string, ExtractedQuestion | null>;
      isUnique: boolean;
      hasDifferences: boolean;
      inGroundTruth: boolean;
      missingFromGroundTruth: boolean;
    }> = [];
    
    for (const [normalized, questions] of questionMap) {
      const presentIn = allColumnKeys.filter(k => questions[k]);
      const isUnique = presentIn.length === 1;
      const inGroundTruth = !!questions['ground_truth'];
      const missingFromGroundTruth = groundTruth && !inGroundTruth;
      
      // Check for type differences
      const types = new Set(
        Object.values(questions)
          .filter(Boolean)
          .map(q => q!.question_type)
      );
      const hasDifferences = isUnique || types.size > 1;
      
      rows.push({
        id: normalized,
        questions,
        isUnique,
        hasDifferences,
        inGroundTruth,
        missingFromGroundTruth: !!missingFromGroundTruth,
      });
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
  const detailedMetrics = useMemo(() => {
    if (!groundTruth) return {};
    
    const gtQuestions = groundTruthToExtractedQuestions(groundTruth);
    const metrics: Record<string, ReturnType<typeof calculateDetailedMetrics>> = {};
    
    for (const key of approachKeys) {
      const result = results[key];
      if (result.success) {
        metrics[key] = calculateDetailedMetrics(result.questions, gtQuestions);
      }
    }
    
    return metrics;
  }, [groundTruth, results, approachKeys]);

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
            </>
          )}
        </div>
        
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
                return (
                  <div 
                    style={{ 
                      padding: '0.5rem',
                      fontSize: '0.8125rem',
                      borderLeft: '1px solid var(--border)',
                      background: question ? 'white' : 'var(--bg-light)',
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
                        <span className="question-type" style={{ fontSize: '0.6875rem' }}>
                          {question.question_type}
                        </span>
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
                
                // Determine what icons/indicators to show
                let indicator = null;
                if (groundTruth && question) {
                  if (!gtQuestion) {
                    indicator = <span style={{ color: 'var(--error)', marginLeft: '0.5rem' }} title="Extra (not in GT)">✗</span>;
                  } else {
                    const typeMatch = question.question_type === gtQuestion.question_type;
                    if (!typeMatch) {
                      indicator = <span style={{ color: 'var(--warning)', marginLeft: '0.5rem' }} title={`Type differs: expected ${gtQuestion.question_type}`}>◐</span>;
                    }
                  }
                } else if (groundTruth && !question && gtQuestion) {
                  indicator = null; // Missing is shown differently
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
                        <span className="question-type" style={{ fontSize: '0.6875rem' }}>
                          {question.question_type}
                        </span>
                        {indicator}
                        {question.confidence !== undefined && (
                          <span 
                            style={{ 
                              marginLeft: '0.5rem', 
                              fontSize: '0.6875rem',
                              color: question.confidence >= 0.7 ? 'var(--success)' : 'var(--warning)'
                            }}
                            title={`Confidence: ${(question.confidence * 100).toFixed(1)}%`}
                          >
                            {(question.confidence * 100).toFixed(0)}%
                          </span>
                        )}
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
          onClose={() => setSelectedRowIndex(null)}
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

function QuestionDetailModal({ row, rowIndex, approachKeys, results, groundTruth, onClose }: QuestionDetailModalProps) {
  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
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
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
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

                    {/* Confidence if available */}
                    {question.confidence !== undefined && (
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
}

/** Ground Truth Comparison Section */
function GroundTruthComparisonSection({
  comparisons,
  approachKeys,
  results,
}: {
  comparisons: Record<string, GroundTruthComparisonResult>;
  approachKeys: string[];
  results: Record<string, ExtractionResult>;
}) {
  const firstComparison = Object.values(comparisons)[0];
  if (!firstComparison) return null;

  return (
    <div className="ground-truth-comparison-section">
      <h3>
        <span style={{ marginRight: '0.5rem' }}>🎯</span>
        Ground Truth Comparison
      </h3>
      <p className="gt-comparison-subtitle">
        Comparing against: <strong>{firstComparison.ground_truth_file_name}</strong>
      </p>

      {/* Metrics Grid */}
      <div className="gt-comparison-grid" style={{
        display: 'grid',
        gridTemplateColumns: `150px repeat(${approachKeys.length}, 1fr)`,
        gap: '1px',
        background: 'var(--border)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        overflow: 'hidden',
        marginBottom: '1rem',
      }}>
        {/* Header */}
        <div style={{ background: 'var(--bg-light)', padding: '0.75rem', fontWeight: '600' }}>
          Metric
        </div>
        {approachKeys.map((key) => (
          <div key={key} style={{ 
            background: 'var(--bg-light)', 
            padding: '0.75rem', 
            fontWeight: '500', 
            textAlign: 'center',
            fontSize: '0.85rem'
          }}>
            {formatResultKey(key, results[key])}
          </div>
        ))}

        {/* Ground Truth Count */}
        <div style={{ background: 'white', padding: '0.75rem' }}>Ground Truth</div>
        {approachKeys.map((key) => (
          <div key={key} style={{ background: 'white', padding: '0.75rem', textAlign: 'center' }}>
            {comparisons[key]?.ground_truth_count ?? '-'}
          </div>
        ))}

        {/* Extracted Count */}
        <div style={{ background: 'white', padding: '0.75rem' }}>Extracted</div>
        {approachKeys.map((key) => (
          <div key={key} style={{ background: 'white', padding: '0.75rem', textAlign: 'center' }}>
            {comparisons[key]?.extracted_count ?? '-'}
          </div>
        ))}

        {/* Exact Matches */}
        <div style={{ background: 'white', padding: '0.75rem' }}>Exact Matches</div>
        {approachKeys.map((key) => (
          <div key={key} style={{ 
            background: 'white', 
            padding: '0.75rem', 
            textAlign: 'center',
            color: comparisons[key]?.exact_matches ? 'var(--success)' : 'inherit',
            fontWeight: comparisons[key]?.exact_matches ? '600' : 'normal'
          }}>
            {comparisons[key]?.exact_matches ?? '-'}
          </div>
        ))}

        {/* Fuzzy Matches */}
        <div style={{ background: 'white', padding: '0.75rem' }}>Fuzzy Matches</div>
        {approachKeys.map((key) => (
          <div key={key} style={{ background: 'white', padding: '0.75rem', textAlign: 'center' }}>
            {comparisons[key]?.fuzzy_matches ?? '-'}
          </div>
        ))}

        {/* Missed */}
        <div style={{ background: 'white', padding: '0.75rem' }}>Missed</div>
        {approachKeys.map((key) => (
          <div key={key} style={{ 
            background: 'white', 
            padding: '0.75rem', 
            textAlign: 'center',
            color: comparisons[key]?.missed_questions ? 'var(--error)' : 'inherit'
          }}>
            {comparisons[key]?.missed_questions ?? '-'}
          </div>
        ))}

        {/* Extra */}
        <div style={{ background: 'white', padding: '0.75rem' }}>Extra</div>
        {approachKeys.map((key) => (
          <div key={key} style={{ background: 'white', padding: '0.75rem', textAlign: 'center' }}>
            {comparisons[key]?.extra_questions ?? '-'}
          </div>
        ))}

        {/* Precision */}
        <div style={{ background: 'var(--bg-light)', padding: '0.75rem', fontWeight: '500' }}>Precision</div>
        {approachKeys.map((key) => (
          <div key={key} style={{ 
            background: 'var(--bg-light)', 
            padding: '0.75rem', 
            textAlign: 'center',
            fontWeight: '600'
          }}>
            {comparisons[key] ? `${(comparisons[key].precision * 100).toFixed(1)}%` : '-'}
          </div>
        ))}

        {/* Recall */}
        <div style={{ background: 'var(--bg-light)', padding: '0.75rem', fontWeight: '500' }}>Recall</div>
        {approachKeys.map((key) => (
          <div key={key} style={{ 
            background: 'var(--bg-light)', 
            padding: '0.75rem', 
            textAlign: 'center',
            fontWeight: '600'
          }}>
            {comparisons[key] ? `${(comparisons[key].recall * 100).toFixed(1)}%` : '-'}
          </div>
        ))}

        {/* F1 Score */}
        <div style={{ background: 'var(--bg-light)', padding: '0.75rem', fontWeight: '500' }}>F1 Score</div>
        {approachKeys.map((key) => (
          <div key={key} style={{ 
            background: 'var(--bg-light)', 
            padding: '0.75rem', 
            textAlign: 'center',
            fontWeight: '600',
            color: comparisons[key]?.f1_score >= 0.8 ? 'var(--success)' : 
                   comparisons[key]?.f1_score >= 0.5 ? 'var(--warning)' : 'var(--error)'
          }}>
            {comparisons[key] ? `${(comparisons[key].f1_score * 100).toFixed(1)}%` : '-'}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{ 
        fontSize: '0.75rem', 
        color: 'var(--text-secondary)',
        display: 'flex',
        gap: '1.5rem',
        flexWrap: 'wrap'
      }}>
        <span><strong>Precision</strong> = matches / extracted</span>
        <span><strong>Recall</strong> = matches / ground truth</span>
        <span><strong>F1</strong> = harmonic mean of precision &amp; recall</span>
      </div>
    </div>
  );
}
