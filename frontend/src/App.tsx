import { useState } from 'react';
import type { WizardState, WizardStep, ExtractionConfig } from './types';
import { UploadStep } from './components/Wizard/UploadStep';
import { ApproachStep } from './components/Wizard/ApproachStep';
import { ConfigStep } from './components/Wizard/ConfigStep';
import { ResultsStep } from './components/Wizard/ResultsStep';

const STEPS: { key: WizardStep; label: string }[] = [
  { key: 'upload', label: 'Upload' },
  { key: 'approach', label: 'Approach' },
  { key: 'config', label: 'Configure' },
  { key: 'results', label: 'Results' },
];

const initialConfig: ExtractionConfig = {
  approach: 1,
  run_all_approaches: false,
  column_mappings: [],
  question_types: [],
  model: 'opus-4.5',
  compare_models: false,
};

export default function App() {
  const [state, setState] = useState<WizardState>({
    step: 'upload',
    config: initialConfig,
  });

  const currentStepIndex = STEPS.findIndex((s) => s.key === state.step);

  const goToStep = (step: WizardStep) => {
    setState((prev) => ({ ...prev, step, error: undefined }));
  };

  const setError = (error: string) => {
    setState((prev) => ({ ...prev, error }));
  };

  const renderStep = () => {
    switch (state.step) {
      case 'upload':
        return (
          <UploadStep
            onUploadComplete={(metadata) => {
              setState((prev) => ({
                ...prev,
                fileMetadata: metadata,
                step: 'approach',
              }));
            }}
            onError={setError}
          />
        );

      case 'approach':
        return (
          <ApproachStep
            config={state.config}
            onConfigChange={(config) => {
              setState((prev) => ({ ...prev, config }));
            }}
            onNext={() => {
              // Skip config step for approach 1
              if (state.config.approach === 1 && !state.config.run_all_approaches) {
                goToStep('running');
              } else {
                goToStep('config');
              }
            }}
            onBack={() => goToStep('upload')}
          />
        );

      case 'config':
        return (
          <ConfigStep
            config={state.config}
            fileMetadata={state.fileMetadata!}
            onConfigChange={(config) => {
              setState((prev) => ({ ...prev, config }));
            }}
            onNext={() => goToStep('running')}
            onBack={() => goToStep('approach')}
          />
        );

      case 'running':
      case 'results':
        return (
          <ResultsStep
            fileId={state.fileMetadata!.file_id}
            config={state.config}
            results={state.results}
            onResultsReceived={(results) => {
              setState((prev) => ({ ...prev, results, step: 'results' }));
            }}
            onError={setError}
            onReset={() => {
              setState({
                step: 'upload',
                config: initialConfig,
              });
            }}
          />
        );

      default:
        return null;
    }
  };

  // Use wide container for results step
  const isResultsStep = state.step === 'results' || state.step === 'running';
  const containerClass = `container ${isResultsStep ? 'container-wide' : ''}`;

  return (
    <div className={containerClass}>
      <header style={{ textAlign: 'center', marginBottom: '2rem', color: 'white' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: '600', marginBottom: '0.5rem' }}>
          Question Extraction Testing Framework
        </h1>
        <p style={{ opacity: 0.8 }}>
          Compare different approaches for extracting questions from Excel files
        </p>
      </header>

      {/* Step indicator */}
      <div className="steps">
        {STEPS.map((step, index) => {
          const isActive = step.key === state.step || 
            (state.step === 'running' && step.key === 'results');
          const isCompleted = index < currentStepIndex;

          return (
            <div
              key={step.key}
              className={`step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
            >
              <span className="step-number">{index + 1}</span>
              <span>{step.label}</span>
            </div>
          );
        })}
      </div>

      {/* Error display */}
      {state.error && (
        <div className="error-message" style={{ marginBottom: '1rem' }}>
          {state.error}
        </div>
      )}

      {/* Current step content */}
      {renderStep()}
    </div>
  );
}
