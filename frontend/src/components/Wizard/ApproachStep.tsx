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
      'Let the LLM automatically detect and extract all questions. No configuration needed.',
    icon: '🤖',
    needsConfig: false,
  },
  {
    id: 2 as const,
    title: 'Approach 2: User-Guided + LLM',
    description:
      'You specify which columns contain questions and answers. The LLM extracts with your context.',
    icon: '🎯',
    needsConfig: true,
  },
  {
    id: 3 as const,
    title: 'Approach 3: Deterministic + Judge',
    description:
      'Parse questions directly from columns. A fast LLM scores confidence for each item.',
    icon: '⚖️',
    needsConfig: true,
  },
  {
    id: 4 as const,
    title: 'Approach 4: Multi-Step Pipeline',
    description:
      'Auto-discovers structure, extracts with dependencies, separates help text, validates.',
    icon: '🔬',
    needsConfig: false,
  },
];

export function ApproachStep({
  config,
  onConfigChange,
  onNext,
  onBack,
}: ApproachStepProps) {
  const toggleApproach = (approachId: 1 | 2 | 3 | 4) => {
    const current = config.approaches || [];
    let newApproaches: (1 | 2 | 3 | 4)[];
    
    if (current.includes(approachId)) {
      // Remove if already selected (but keep at least one)
      newApproaches = current.filter(a => a !== approachId);
      if (newApproaches.length === 0) {
        return; // Don't allow deselecting all
      }
    } else {
      // Add to selection
      newApproaches = [...current, approachId].sort((a, b) => a - b);
    }
    
    // Update config with new approaches list
    // Set primary approach to first selected for backward compatibility
    onConfigChange({
      ...config,
      approaches: newApproaches,
      approach: newApproaches[0],
      run_all_approaches: newApproaches.length === 4,
    });
  };

  const selectAllApproaches = () => {
    onConfigChange({
      ...config,
      approaches: [1, 2, 3, 4],
      approach: 1,
      run_all_approaches: true,
    });
  };

  const handleModelChange = (model: 'opus-4.5' | 'sonnet-4.5') => {
    onConfigChange({ ...config, model });
  };

  const handleCompareModelsChange = (compareModels: boolean) => {
    onConfigChange({ ...config, compare_models: compareModels });
  };

  const selectedApproaches = config.approaches || [config.approach];
  const needsConfig = selectedApproaches.some(a => a === 2 || a === 3);

  return (
    <div className="card">
      <div className="card-header">
        <span style={{ fontSize: '1.5rem' }}>🔧</span>
        <h2>Select Extraction Approaches</h2>
      </div>

      <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '0.9rem' }}>
        Select one or more approaches to run. Multiple selections will be compared side-by-side.
      </p>

      <div className="radio-group">
        {APPROACHES.map((approach) => {
          const isSelected = selectedApproaches.includes(approach.id);
          return (
            <label
              key={approach.id}
              className={`radio-option ${isSelected ? 'selected' : ''}`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleApproach(approach.id)}
              />
              <div className="radio-option-content">
                <h4>
                  <span style={{ marginRight: '0.5rem' }}>{approach.icon}</span>
                  {approach.title}
                  {approach.needsConfig && (
                    <span style={{ 
                      fontSize: '0.7rem', 
                      background: 'var(--primary)', 
                      color: 'white',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      marginLeft: '0.5rem',
                      fontWeight: 'normal'
                    }}>
                      needs config
                    </span>
                  )}
                </h4>
                <p>{approach.description}</p>
              </div>
            </label>
          );
        })}
      </div>

      <div style={{ marginTop: '0.5rem' }}>
        <button 
          className="btn btn-secondary" 
          onClick={selectAllApproaches}
          style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}
        >
          Select All Approaches
        </button>
        <span style={{ marginLeft: '1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          {selectedApproaches.length} approach{selectedApproaches.length !== 1 ? 'es' : ''} selected
        </span>
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
          <label className={`radio-option ${config.model === 'sonnet-4.5' ? 'selected' : ''}`}>
            <input
              type="radio"
              name="model"
              checked={config.model === 'sonnet-4.5'}
              onChange={() => handleModelChange('sonnet-4.5')}
            />
            <div className="radio-option-content">
              <h4>Claude Sonnet 4.5</h4>
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
              Run extraction with both Opus 4.5 and Sonnet 4.5 to compare quality, speed, and token usage.
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
          {needsConfig ? 'Configure Columns' : 'Run Extraction'}
        </button>
      </div>
    </div>
  );
}
