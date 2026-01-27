import type { ExtractionConfig } from '../../types';

interface ApproachStepProps {
  config: ExtractionConfig;
  onConfigChange: (config: ExtractionConfig) => void;
  onNext: () => void;
  onBack: () => void;
}

const APPROACHES = [
  {
    id: 1 as const,
    title: 'Approach 1: Fully Automatic',
    description:
      'Let the LLM automatically detect and extract all questions. No configuration needed. Best for quick analysis.',
    icon: '🤖',
  },
  {
    id: 2 as const,
    title: 'Approach 2: User-Guided + LLM',
    description:
      'You specify which columns contain questions and answers. The LLM extracts with your context for better accuracy.',
    icon: '🎯',
  },
  {
    id: 3 as const,
    title: 'Approach 3: Deterministic + Judge',
    description:
      'Parse questions directly from columns (no LLM). A fast LLM then scores confidence for each item. Best for validation.',
    icon: '⚖️',
  },
];

export function ApproachStep({
  config,
  onConfigChange,
  onNext,
  onBack,
}: ApproachStepProps) {
  const handleApproachChange = (approach: 1 | 2 | 3) => {
    onConfigChange({ ...config, approach });
  };

  const handleRunAllChange = (runAll: boolean) => {
    onConfigChange({ ...config, run_all_approaches: runAll });
  };

  const handleModelChange = (model: 'opus-4.5' | 'sonnet-4') => {
    onConfigChange({ ...config, model });
  };

  const handleCompareModelsChange = (compareModels: boolean) => {
    onConfigChange({ ...config, compare_models: compareModels });
  };

  return (
    <div className="card">
      <div className="card-header">
        <span style={{ fontSize: '1.5rem' }}>🔧</span>
        <h2>Select Extraction Approach</h2>
      </div>

      <div className="radio-group">
        {APPROACHES.map((approach) => (
          <label
            key={approach.id}
            className={`radio-option ${config.approach === approach.id ? 'selected' : ''}`}
          >
            <input
              type="radio"
              name="approach"
              checked={config.approach === approach.id}
              onChange={() => handleApproachChange(approach.id)}
            />
            <div className="radio-option-content">
              <h4>
                <span style={{ marginRight: '0.5rem' }}>{approach.icon}</span>
                {approach.title}
              </h4>
              <p>{approach.description}</p>
            </div>
          </label>
        ))}
      </div>

      <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }}>
        <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>Model Selection</h3>
        <div className="radio-group" style={{ marginBottom: '1rem' }}>
          <label className={`radio-option ${config.model === 'opus-4.5' ? 'selected' : ''}`}>
            <input
              type="radio"
              name="model"
              checked={config.model === 'opus-4.5'}
              onChange={() => handleModelChange('opus-4.5')}
            />
            <div className="radio-option-content">
              <h4>Claude Opus 4.5</h4>
              <p>Most capable model with highest accuracy. Supports up to 24K output tokens.</p>
            </div>
          </label>
          <label className={`radio-option ${config.model === 'sonnet-4' ? 'selected' : ''}`}>
            <input
              type="radio"
              name="model"
              checked={config.model === 'sonnet-4'}
              onChange={() => handleModelChange('sonnet-4')}
            />
            <div className="radio-option-content">
              <h4>Claude Sonnet 4</h4>
              <p>Balanced performance and speed. Good for most use cases.</p>
            </div>
          </label>
        </div>

        <label
          className={`radio-option ${config.compare_models ? 'selected' : ''}`}
          style={{ background: config.compare_models ? 'rgba(102, 126, 234, 0.1)' : undefined }}
        >
          <input
            type="checkbox"
            checked={config.compare_models}
            onChange={(e) => handleCompareModelsChange(e.target.checked)}
          />
          <div className="radio-option-content">
            <h4>
              <span style={{ marginRight: '0.5rem' }}>🔄</span>
              Compare Both Models
            </h4>
            <p>
              Run extraction with both Opus 4.5 and Sonnet 4 to compare quality, speed, and token usage.
            </p>
          </div>
        </label>
      </div>

      <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }}>
        <label
          className={`radio-option ${config.run_all_approaches ? 'selected' : ''}`}
          style={{ background: config.run_all_approaches ? 'rgba(102, 126, 234, 0.1)' : undefined }}
        >
          <input
            type="checkbox"
            checked={config.run_all_approaches}
            onChange={(e) => handleRunAllChange(e.target.checked)}
          />
          <div className="radio-option-content">
            <h4>
              <span style={{ marginRight: '0.5rem' }}>📊</span>
              Run All Approaches for Comparison
            </h4>
            <p>
              Run all three approaches and compare results side-by-side. Useful for
              benchmarking and finding the best approach for your data.
            </p>
          </div>
        </label>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: '1.5rem',
          paddingTop: '1.5rem',
          borderTop: '1px solid var(--border)',
        }}
      >
        <button className="btn btn-secondary" onClick={onBack}>
          Back
        </button>
        <button className="btn btn-primary" onClick={onNext}>
          {config.approach === 1 && !config.run_all_approaches
            ? 'Run Extraction'
            : 'Configure Columns'}
        </button>
      </div>
    </div>
  );
}
