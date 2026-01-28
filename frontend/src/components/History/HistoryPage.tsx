import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listRuns, getRunDetails } from '../../api/client';
import type { RunMetadata, ExtractionResponse, ExtractionResult } from '../../types';

interface HistoryPageProps {
  onBackToWizard: () => void;
}

export function HistoryPage({ onBackToWizard }: HistoryPageProps) {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  // Fetch list of runs
  const runsQuery = useQuery({
    queryKey: ['runs'],
    queryFn: listRuns,
  });

  // Fetch selected run details
  const runDetailQuery = useQuery({
    queryKey: ['run', selectedRunId],
    queryFn: () => getRunDetails(selectedRunId!),
    enabled: !!selectedRunId,
  });

  return (
    <div className="history-page">
      <div className="history-header">
        <button className="btn btn-secondary" onClick={onBackToWizard}>
          &larr; Back to Wizard
        </button>
        <h1>Extraction History</h1>
      </div>

      <div className="history-layout">
        {/* Run List Panel */}
        <div className="run-list-panel">
          <h2>Past Runs</h2>
          
          {runsQuery.isLoading && (
            <div className="loading">Loading runs...</div>
          )}

          {runsQuery.error && (
            <div className="error-message">
              Failed to load runs: {(runsQuery.error as Error).message}
            </div>
          )}

          {runsQuery.data && runsQuery.data.length === 0 && (
            <div className="empty-state">
              No extraction runs found. Run an extraction first!
            </div>
          )}

          {runsQuery.data && runsQuery.data.length > 0 && (
            <div className="run-list">
              {runsQuery.data.map((run) => (
                <RunListItem
                  key={run.run_id}
                  run={run}
                  isSelected={selectedRunId === run.run_id}
                  onClick={() => setSelectedRunId(run.run_id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Run Detail Panel */}
        <div className="run-detail-panel">
          {!selectedRunId && (
            <div className="empty-state">
              Select a run from the list to view details
            </div>
          )}

          {selectedRunId && runDetailQuery.isLoading && (
            <div className="loading">Loading run details...</div>
          )}

          {selectedRunId && runDetailQuery.error && (
            <div className="error-message">
              Failed to load run: {(runDetailQuery.error as Error).message}
            </div>
          )}

          {selectedRunId && runDetailQuery.data && (
            <RunDetail
              runId={selectedRunId}
              data={runDetailQuery.data}
              metadata={runsQuery.data?.find((r) => r.run_id === selectedRunId)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** Run list item component */
function RunListItem({
  run,
  isSelected,
  onClick,
}: {
  run: RunMetadata;
  isSelected: boolean;
  onClick: () => void;
}) {
  const date = new Date(run.timestamp);
  const formattedDate = date.toLocaleDateString();
  const formattedTime = date.toLocaleTimeString();

  // Get unique approaches
  const uniqueApproaches = [...new Set(run.approaches_run)].sort();

  return (
    <div
      className={`run-list-item ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
    >
      <div className="run-list-item-header">
        <span className="run-id">{run.run_id.slice(-12)}</span>
        <span className="run-date">{formattedDate}</span>
      </div>
      <div className="run-list-item-details">
        <span className="run-time">{formattedTime}</span>
        <span className="run-approaches">
          {uniqueApproaches.map((a) => `A${a}`).join(', ')}
          {run.config.compare_models && ' (model comparison)'}
        </span>
      </div>
      <div className="run-list-item-model">
        Model: {run.config.model}
      </div>
    </div>
  );
}

/** Run detail component */
function RunDetail({
  runId,
  data,
  metadata,
}: {
  runId: string;
  data: ExtractionResponse;
  metadata?: RunMetadata;
}) {
  const [activeTab, setActiveTab] = useState<'results' | 'prompts' | 'config'>('results');
  const approachKeys = Object.keys(data.results).sort();

  return (
    <div className="run-detail">
      <h2>Run: {runId.slice(-12)}</h2>
      
      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab ${activeTab === 'results' ? 'active' : ''}`}
          onClick={() => setActiveTab('results')}
        >
          Results
        </button>
        <button
          className={`tab ${activeTab === 'prompts' ? 'active' : ''}`}
          onClick={() => setActiveTab('prompts')}
        >
          Prompts
        </button>
        <button
          className={`tab ${activeTab === 'config' ? 'active' : ''}`}
          onClick={() => setActiveTab('config')}
        >
          Configuration
        </button>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab === 'results' && (
          <ResultsTab results={data.results} approachKeys={approachKeys} />
        )}
        {activeTab === 'prompts' && (
          <PromptsTab results={data.results} approachKeys={approachKeys} />
        )}
        {activeTab === 'config' && metadata && (
          <ConfigTab metadata={metadata} />
        )}
      </div>
    </div>
  );
}

/** Results tab showing metrics and question counts */
function ResultsTab({
  results,
  approachKeys,
}: {
  results: Record<string, ExtractionResult>;
  approachKeys: string[];
}) {
  return (
    <div className="results-tab">
      {/* Metrics Summary */}
      <h3>Metrics Summary</h3>
      <div className="metrics-grid" style={{
        display: 'grid',
        gridTemplateColumns: `150px repeat(${approachKeys.length}, 1fr)`,
        gap: '1px',
        background: 'var(--border)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        overflow: 'hidden',
        marginBottom: '1.5rem',
      }}>
        {/* Header */}
        <div style={{ background: 'var(--bg-light)', padding: '0.75rem', fontWeight: '600' }}>
          Metric
        </div>
        {approachKeys.map((key) => (
          <div key={key} style={{ background: 'var(--bg-light)', padding: '0.75rem', fontWeight: '500', textAlign: 'center', fontSize: '0.85rem' }}>
            {formatApproachKey(key, results[key])}
          </div>
        ))}

        {/* Status */}
        <div style={{ background: 'white', padding: '0.75rem' }}>Status</div>
        {approachKeys.map((key) => (
          <div key={key} style={{ 
            background: 'white', 
            padding: '0.75rem', 
            textAlign: 'center',
            color: results[key]?.success ? 'var(--success)' : 'var(--error)',
          }}>
            {results[key]?.success ? 'Success' : 'Failed'}
          </div>
        ))}

        {/* Count */}
        <div style={{ background: 'white', padding: '0.75rem' }}>Question Count</div>
        {approachKeys.map((key) => (
          <div key={key} style={{ background: 'white', padding: '0.75rem', textAlign: 'center', fontWeight: '600' }}>
            {results[key]?.metrics?.extraction_count ?? '-'}
          </div>
        ))}

        {/* Time */}
        <div style={{ background: 'white', padding: '0.75rem' }}>Time</div>
        {approachKeys.map((key) => (
          <div key={key} style={{ background: 'white', padding: '0.75rem', textAlign: 'center' }}>
            {results[key]?.metrics?.total_time_ms 
              ? `${(results[key].metrics!.total_time_ms / 1000).toFixed(1)}s` 
              : '-'}
          </div>
        ))}

        {/* Accuracy */}
        <div style={{ background: 'white', padding: '0.75rem' }}>Accuracy</div>
        {approachKeys.map((key) => (
          <div key={key} style={{ background: 'white', padding: '0.75rem', textAlign: 'center' }}>
            {results[key]?.metrics?.accuracy != null 
              ? `${(results[key].metrics!.accuracy * 100).toFixed(1)}%` 
              : '-'}
          </div>
        ))}

        {/* Confidence */}
        <div style={{ background: 'white', padding: '0.75rem' }}>Avg Confidence</div>
        {approachKeys.map((key) => (
          <div key={key} style={{ background: 'white', padding: '0.75rem', textAlign: 'center' }}>
            {results[key]?.metrics?.avg_confidence != null 
              ? `${(results[key].metrics!.avg_confidence * 100).toFixed(1)}%` 
              : '-'}
          </div>
        ))}
      </div>

      {/* Sample Questions */}
      <h3>Sample Questions (first 5 per approach)</h3>
      <div className="sample-questions">
        {approachKeys.map((key) => (
          <div key={key} className="approach-sample">
            <h4>{formatApproachKey(key, results[key])}</h4>
            {results[key]?.questions.slice(0, 5).map((q, idx) => (
              <div key={idx} className="sample-question">
                <span className="q-type">{q.question_type}</span>
                <span className="q-text">{q.question_text.slice(0, 150)}{q.question_text.length > 150 ? '...' : ''}</span>
              </div>
            ))}
            {results[key]?.questions.length === 0 && (
              <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>No questions extracted</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Prompts tab showing the prompts used for each approach */
function PromptsTab({
  results,
  approachKeys,
}: {
  results: Record<string, ExtractionResult>;
  approachKeys: string[];
}) {
  const [selectedPrompt, setSelectedPrompt] = useState<string>(approachKeys[0] || '');

  return (
    <div className="prompts-tab">
      {/* Prompt Selector */}
      <div className="prompt-selector">
        <label>Select Approach:</label>
        <select 
          value={selectedPrompt} 
          onChange={(e) => setSelectedPrompt(e.target.value)}
          className="prompt-select"
        >
          {approachKeys.map((key) => (
            <option key={key} value={key}>
              {formatApproachKey(key, results[key])}
            </option>
          ))}
        </select>
      </div>

      {/* Prompt Display */}
      {selectedPrompt && results[selectedPrompt] && (
        <div className="prompt-display">
          <div className="prompt-header">
            <h4>Prompt for {formatApproachKey(selectedPrompt, results[selectedPrompt])}</h4>
            <button 
              className="btn btn-secondary btn-sm"
              onClick={() => {
                if (results[selectedPrompt]?.prompt) {
                  navigator.clipboard.writeText(results[selectedPrompt].prompt!);
                }
              }}
            >
              Copy to Clipboard
            </button>
          </div>
          
          {results[selectedPrompt]?.prompt ? (
            <pre className="prompt-content">
              {results[selectedPrompt].prompt}
            </pre>
          ) : (
            <p className="no-prompt">
              No prompt available for this approach. 
              {!results[selectedPrompt]?.success && ' (Extraction may have failed before prompt was generated)'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Config tab showing the configuration used */
function ConfigTab({ metadata }: { metadata: RunMetadata }) {
  return (
    <div className="config-tab">
      <h3>Run Configuration</h3>
      
      <div className="config-section">
        <h4>General Settings</h4>
        <div className="config-grid">
          <div className="config-item">
            <span className="config-label">Run ID:</span>
            <span className="config-value">{metadata.run_id}</span>
          </div>
          <div className="config-item">
            <span className="config-label">File ID:</span>
            <span className="config-value">{metadata.file_id}</span>
          </div>
          <div className="config-item">
            <span className="config-label">Timestamp:</span>
            <span className="config-value">{new Date(metadata.timestamp).toLocaleString()}</span>
          </div>
          <div className="config-item">
            <span className="config-label">Model:</span>
            <span className="config-value">{metadata.config.model}</span>
          </div>
          <div className="config-item">
            <span className="config-label">Compare Models:</span>
            <span className="config-value">{metadata.config.compare_models ? 'Yes' : 'No'}</span>
          </div>
          <div className="config-item">
            <span className="config-label">Run All Approaches:</span>
            <span className="config-value">{metadata.config.run_all_approaches ? 'Yes' : 'No'}</span>
          </div>
        </div>
      </div>

      {metadata.config.column_mappings && metadata.config.column_mappings.length > 0 && (
        <div className="config-section">
          <h4>Column Mappings</h4>
          {metadata.config.column_mappings.map((mapping, idx) => (
            <div key={idx} className="mapping-card">
              <h5>Sheet: {mapping.sheet_name}</h5>
              <div className="config-grid">
                <div className="config-item">
                  <span className="config-label">Question Column:</span>
                  <span className="config-value">{mapping.question_column}</span>
                </div>
                {mapping.answer_column && (
                  <div className="config-item">
                    <span className="config-label">Answer Column:</span>
                    <span className="config-value">{mapping.answer_column}</span>
                  </div>
                )}
                <div className="config-item">
                  <span className="config-label">Start Row:</span>
                  <span className="config-value">{mapping.start_row}</span>
                </div>
                {mapping.end_row && (
                  <div className="config-item">
                    <span className="config-label">End Row:</span>
                    <span className="config-value">{mapping.end_row}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Helper to format approach key for display */
function formatApproachKey(key: string, result?: ExtractionResult): string {
  const parts = key.split('_');
  const approachNum = parts[1];
  
  let label = `Approach ${approachNum}`;
  
  if (result?.model) {
    label += ` (${result.model})`;
  } else if (parts.length > 2) {
    const modelParts = parts.slice(2);
    const modelName = modelParts.join('-').replace(/_/g, '.');
    label += ` (${modelName})`;
  }
  
  return label;
}
