import { useEffect, useState, useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { runExtraction } from '../../api/client';
import type { ExtractionConfig, ExtractionResponse, ExtractionResult, ExtractedQuestion } from '../../types';

interface ResultsStepProps {
  fileId: string;
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

  useEffect(() => {
    if (!results) {
      extractionMutation.mutate();
    } else {
      const firstKey = Object.keys(results.results)[0];
      if (firstKey && !selectedApproach) setSelectedApproach(firstKey);
    }
  }, []);

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

  return (
    <div className="card">
      <div className="card-header">
        <span style={{ fontSize: '1.5rem' }}>📊</span>
        <h2>Extraction Results</h2>
        {/* View mode toggle */}
        {hasMultipleApproaches && (
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
      {viewMode === 'comparison' && hasMultipleApproaches ? (
        <ComparisonView results={results.results} approachKeys={approachKeys} />
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
}

function ComparisonView({ results, approachKeys }: ComparisonViewProps) {
  // State for modal
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);

  // Build a unified list of all questions across approaches
  const comparisonData = useMemo(() => {
    // Create a map of normalized text -> question data per approach
    const questionMap = new Map<string, Record<string, ExtractedQuestion | null>>();
    
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
    }> = [];
    
    for (const [normalized, questions] of questionMap) {
      const presentIn = approachKeys.filter(k => questions[k]);
      const isUnique = presentIn.length === 1;
      
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
      });
    }
    
    return rows;
  }, [results, approachKeys]);

  // Stats
  const totalUnique = comparisonData.filter(r => r.isUnique).length;
  const totalDifferences = comparisonData.filter(r => r.hasDifferences).length;
  const totalCommon = comparisonData.length - totalUnique;

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
        fontSize: '0.875rem'
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
      </div>

      {/* Metrics comparison */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '0.9375rem', fontWeight: '500', marginBottom: '0.75rem' }}>
          Metrics Comparison
        </h3>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: `80px repeat(${approachKeys.length}, 1fr)`,
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
          {approachKeys.map(key => (
            <div key={key} style={{ background: 'var(--bg-light)', padding: '0.5rem', fontWeight: '500', textAlign: 'center', fontSize: '0.85rem' }}>
              {formatResultKey(key, results[key])}
            </div>
          ))}
          
          {/* Count row */}
          <div style={{ background: 'white', padding: '0.5rem' }}>Count</div>
          {approachKeys.map(key => (
            <div key={key} style={{ background: 'white', padding: '0.5rem', textAlign: 'center' }}>
              {results[key]?.metrics?.extraction_count ?? '-'}
            </div>
          ))}
          
          {/* Time row */}
          <div style={{ background: 'white', padding: '0.5rem' }}>Time</div>
          {approachKeys.map(key => (
            <div key={key} style={{ background: 'white', padding: '0.5rem', textAlign: 'center' }}>
              {results[key]?.metrics?.total_time_ms 
                ? `${(results[key].metrics!.total_time_ms / 1000).toFixed(1)}s` 
                : '-'}
            </div>
          ))}
          
          {/* Accuracy row */}
          <div style={{ background: 'white', padding: '0.5rem' }}>Accuracy</div>
          {approachKeys.map(key => (
            <div key={key} style={{ background: 'white', padding: '0.5rem', textAlign: 'center' }}>
              {results[key]?.metrics?.accuracy !== undefined
                ? `${(results[key].metrics!.accuracy! * 100).toFixed(0)}%`
                : '-'}
            </div>
          ))}
        </div>
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
          color: 'var(--text-secondary)'
        }}>
          <span title="Question found in all approaches with same type">
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
          <span title="Question only found in one approach (missing from others)">
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
            <span style={{ color: 'var(--warning)' }}>●</span> Unique
          </span>
          <span title="Question found in multiple approaches but classified with different types">
            <span style={{ 
              display: 'inline-block', 
              width: '12px', 
              height: '12px', 
              background: 'rgba(245, 101, 101, 0.15)', 
              border: '1px solid var(--error)',
              borderRadius: '2px',
              marginRight: '0.25rem',
              verticalAlign: 'middle'
            }}></span>
            <span style={{ color: 'var(--error)' }}>◐</span> Type differs
          </span>
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
          gridTemplateColumns: `50px repeat(${approachKeys.length}, 1fr)`,
          background: 'var(--bg-light)',
          borderBottom: '1px solid var(--border)',
          position: 'sticky',
          top: 0,
          zIndex: 1
        }}>
          <div style={{ padding: '0.5rem', fontSize: '0.75rem', fontWeight: '500' }} title="Row number and status indicator">#</div>
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
        {comparisonData.map((row, index) => (
          <div 
            key={row.id}
            onClick={() => setSelectedRowIndex(index)}
            style={{ 
              display: 'grid', 
              gridTemplateColumns: `50px repeat(${approachKeys.length}, 1fr)`,
              borderBottom: '1px solid var(--border)',
              background: row.isUnique 
                ? 'rgba(237, 137, 54, 0.08)' 
                : row.hasDifferences 
                  ? 'rgba(245, 101, 101, 0.05)' 
                  : 'white',
              cursor: 'pointer',
              transition: 'background 0.15s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = row.isUnique 
                ? 'rgba(237, 137, 54, 0.15)' 
                : row.hasDifferences 
                  ? 'rgba(245, 101, 101, 0.12)' 
                  : 'var(--bg-light)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = row.isUnique 
                ? 'rgba(237, 137, 54, 0.08)' 
                : row.hasDifferences 
                  ? 'rgba(245, 101, 101, 0.05)' 
                  : 'white';
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
              title={
                row.isUnique 
                  ? `Row ${index + 1}: UNIQUE - This question was only found by one approach` 
                  : row.hasDifferences 
                    ? `Row ${index + 1}: TYPE DIFFERS - Approaches classified this question differently`
                    : `Row ${index + 1}: Common - All approaches found this question with the same type`
              }
            >
              {index + 1}
              {row.isUnique && (
                <span style={{ marginLeft: '0.25rem', color: 'var(--warning)' }}>●</span>
              )}
              {!row.isUnique && row.hasDifferences && (
                <span style={{ marginLeft: '0.25rem', color: 'var(--error)' }}>◐</span>
              )}
            </div>
            {approachKeys.map(key => {
              const question = row.questions[key];
              return (
                <div 
                  key={key} 
                  style={{ 
                    padding: '0.5rem',
                    fontSize: '0.8125rem',
                    borderLeft: '1px solid var(--border)',
                    background: question ? 'transparent' : 'var(--bg-light)',
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
                      Not found
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Detail Modal */}
      {selectedRowIndex !== null && comparisonData[selectedRowIndex] && (
        <QuestionDetailModal
          row={comparisonData[selectedRowIndex]}
          rowIndex={selectedRowIndex}
          approachKeys={approachKeys}
          results={results}
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
  };
  rowIndex: number;
  approachKeys: string[];
  results: Record<string, ExtractionResult>;
  onClose: () => void;
}

function QuestionDetailModal({ row, rowIndex, approachKeys, results, onClose }: QuestionDetailModalProps) {
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
          background: row.isUnique 
            ? 'rgba(237, 137, 54, 0.1)' 
            : row.hasDifferences 
              ? 'rgba(245, 101, 101, 0.08)' 
              : 'var(--bg-light)',
          borderRadius: '12px 12px 0 0',
        }}>
          <div>
            <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.25rem' }}>
              Question #{rowIndex + 1}
              {row.isUnique && (
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
              {!row.isUnique && row.hasDifferences && (
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
          gridTemplateColumns: `repeat(${approachKeys.length}, 1fr)`,
          gap: '1px',
          background: 'var(--border)',
        }}>
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
