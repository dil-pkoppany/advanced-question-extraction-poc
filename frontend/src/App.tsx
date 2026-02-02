import { useState } from 'react';
import type { WizardState, WizardStep, ExtractionConfig, AppView, ExtractionResponse } from './types';
import { UploadStep } from './components/Wizard/UploadStep';
import { ApproachStep } from './components/Wizard/ApproachStep';
import { ConfigStep } from './components/Wizard/ConfigStep';
import { ResultsStep } from './components/Wizard/ResultsStep';
import { HistoryPage } from './components/History';
import { GroundTruthPage } from './components/GroundTruth';

const STEPS: { key: WizardStep; label: string }[] = [
  { key: 'upload', label: 'Upload' },
  { key: 'approach', label: 'Approach' },
  { key: 'config', label: 'Configure' },
  { key: 'results', label: 'Results' },
];

const initialConfig: ExtractionConfig = {
  approach: 1,
  approaches: [1],  // Selected approaches to run
  run_all_approaches: false,
  column_mappings: [],
  question_types: [],
  model: 'opus-4.5',
  compare_models: false,
};

export default function App() {
  const [currentView, setCurrentView] = useState<AppView>('wizard');
  const [state, setState] = useState<WizardState>({
    step: 'upload',
    config: initialConfig,
  });
  
  // State for viewing historical results
  const [historicalView, setHistoricalView] = useState<{
    fileName: string;
    results: ExtractionResponse;
  } | null>(null);

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
              // Check if any selected approach needs column mappings (approaches 2 or 3)
              const needsConfig = state.config.approaches.some(a => a === 2 || a === 3);
              if (needsConfig) {
                goToStep('config');
              } else {
                goToStep('running');
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
            fileName={state.fileMetadata!.file_name}
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

  // Use wide container for results step, history view, or ground truth view
  const isWideView = state.step === 'results' || state.step === 'running' || currentView !== 'wizard';
  const containerClass = `container ${isWideView ? 'container-wide' : ''}`;

  // Navigation component
  const renderNavigation = () => (
    <div className="nav-bar">
      <button 
        className={`nav-btn ${currentView === 'wizard' ? 'active' : ''}`}
        onClick={() => setCurrentView('wizard')}
      >
        New Extraction
      </button>
      <button 
        className={`nav-btn ${currentView === 'history' ? 'active' : ''}`}
        onClick={() => setCurrentView('history')}
      >
        History
      </button>
      <button 
        className={`nav-btn ${currentView === 'groundtruth' ? 'active' : ''}`}
        onClick={() => setCurrentView('groundtruth')}
      >
        Ground Truth
      </button>
    </div>
  );

  // Render ground truth view
  if (currentView === 'groundtruth') {
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

        {renderNavigation()}

        <GroundTruthPage onBackToWizard={() => setCurrentView('wizard')} />
      </div>
    );
  }

  // Render history view
  if (currentView === 'history') {
    // If viewing historical results, show the results page
    if (historicalView) {
      return (
        <div className={containerClass}>
          <header style={{ textAlign: 'center', marginBottom: '2rem', color: 'white' }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: '600', marginBottom: '0.5rem' }}>
              Question Extraction Testing Framework
            </h1>
            <p style={{ opacity: 0.8 }}>
              Viewing Historical Results
            </p>
          </header>

          {renderNavigation()}

          <ResultsStep
            fileId=""
            fileName={historicalView.fileName}
            config={initialConfig}
            results={historicalView.results}
            onResultsReceived={() => {}}
            onError={() => {}}
            onReset={() => {
              setHistoricalView(null);
            }}
            isHistoricalView={true}
          />
        </div>
      );
    }

    // Show history list
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

        {renderNavigation()}

        <HistoryPage 
          onBackToWizard={() => setCurrentView('wizard')}
          onViewResults={(fileName, results) => {
            setHistoricalView({ fileName, results });
          }}
        />
      </div>
    );
  }

  // Render wizard view
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

      {renderNavigation()}

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
