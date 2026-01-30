import { useState } from 'react';
import type { ExtractionConfig, FileMetadata, ColumnMapping, QuestionType } from '../../types';

interface ConfigStepProps {
  config: ExtractionConfig;
  fileMetadata: FileMetadata;
  onConfigChange: (config: ExtractionConfig) => void;
  onNext: () => void;
  onBack: () => void;
}

/** Convert 0-based index to Excel column letter (0=A, 1=B, ..., 25=Z, 26=AA, etc.) */
function indexToExcelColumn(index: number): string {
  let column = '';
  let temp = index;
  while (temp >= 0) {
    column = String.fromCharCode((temp % 26) + 65) + column;
    temp = Math.floor(temp / 26) - 1;
  }
  return column;
}

/** Format column name with Excel letter prefix */
function formatColumnOption(columnName: string, index: number): string {
  const letter = indexToExcelColumn(index);
  // Truncate long column names
  const displayName = columnName.length > 50 
    ? columnName.substring(0, 47) + '...' 
    : columnName;
  return `${letter}: ${displayName}`;
}

const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: 'open_ended', label: 'Open Ended' },
  { value: 'single_choice', label: 'Single Choice' },
  { value: 'multiple_choice', label: 'Multiple Choice' },
  { value: 'grouped_question', label: 'Grouped Question' },
  { value: 'yes_no', label: 'Yes/No' },
];

export function ConfigStep({
  config,
  fileMetadata,
  onConfigChange,
  onNext,
  onBack,
}: ConfigStepProps) {
  // Track which sheets are included
  const [includedSheets, setIncludedSheets] = useState<Set<string>>(() => {
    // By default, include sheets with more than 10 rows (likely to contain data)
    const included = new Set<string>();
    fileMetadata.sheets.forEach(sheet => {
      if (sheet.row_count > 10) {
        included.add(sheet.name);
      }
    });
    // If no sheets qualify, include all
    if (included.size === 0) {
      fileMetadata.sheets.forEach(sheet => included.add(sheet.name));
    }
    return included;
  });

  const [mappings, setMappings] = useState<ColumnMapping[]>(
    config.column_mappings?.length
      ? config.column_mappings
      : fileMetadata.sheets.map((sheet) => ({
          sheet_name: sheet.name,
          question_column: sheet.columns[0] || '',
          answer_column: undefined,
          question_types: config.question_types || [],
          start_row: 2,
        }))
  );

  const toggleSheetIncluded = (sheetName: string) => {
    setIncludedSheets(prev => {
      const next = new Set(prev);
      if (next.has(sheetName)) {
        next.delete(sheetName);
      } else {
        next.add(sheetName);
      }
      return next;
    });
  };

  const updateMapping = (index: number, updates: Partial<ColumnMapping>) => {
    const newMappings = [...mappings];
    newMappings[index] = { ...newMappings[index], ...updates };
    setMappings(newMappings);
  };

  const toggleQuestionType = (sheetIndex: number, type: QuestionType) => {
    const currentTypes = mappings[sheetIndex]?.question_types || [];
    const newTypes = currentTypes.includes(type)
      ? currentTypes.filter((t) => t !== type)
      : [...currentTypes, type];
    updateMapping(sheetIndex, { question_types: newTypes });
  };

  const handleNext = () => {
    // Filter out excluded sheets and sheets with no question column selected
    const validMappings = mappings.filter(
      (m) => includedSheets.has(m.sheet_name) && m.question_column
    );
    
    // Collect all question types across all sheets for backward compatibility
    const allQuestionTypes = new Set<QuestionType>();
    validMappings.forEach(m => {
      m.question_types.forEach(t => allQuestionTypes.add(t));
    });
    
    onConfigChange({
      ...config,
      column_mappings: validMappings,
      question_types: Array.from(allQuestionTypes), // Keep for backward compatibility
    });
    onNext();
  };

  const isValid = mappings.some(
    (m) => includedSheets.has(m.sheet_name) && m.question_column
  );

  return (
    <div className="card">
      <div className="card-header">
        <span style={{ fontSize: '1.5rem' }}>⚙️</span>
        <h2>Configure Column Mappings</h2>
      </div>

      {/* Sheet/column mappings */}
      <div style={{ marginTop: '1.5rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: '500', marginBottom: '1rem' }}>
          Column Mappings by Sheet
        </h3>

        {fileMetadata.sheets.map((sheet, index) => {
          const isIncluded = includedSheets.has(sheet.name);
          
          return (
            <div
              key={sheet.name}
              style={{
                padding: '1rem',
                background: isIncluded ? 'var(--bg-light)' : 'transparent',
                borderRadius: '8px',
                marginBottom: '1rem',
                border: isIncluded ? 'none' : '1px dashed var(--border)',
                opacity: isIncluded ? 1 : 0.6,
                transition: 'all 0.2s',
              }}
            >
              {/* Sheet header with toggle */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                marginBottom: isIncluded ? '1rem' : 0
              }}>
                <label style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.75rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                }}>
                  <input
                    type="checkbox"
                    checked={isIncluded}
                    onChange={() => toggleSheetIncluded(sheet.name)}
                    style={{ 
                      width: '18px', 
                      height: '18px',
                      accentColor: 'var(--primary)',
                      cursor: 'pointer'
                    }}
                  />
                  <span>📋 {sheet.name}</span>
                  <span style={{ fontWeight: '400', color: 'var(--text-secondary)' }}>
                    ({sheet.row_count} rows)
                  </span>
                </label>
                {!isIncluded && (
                  <span style={{ 
                    fontSize: '0.75rem', 
                    color: 'var(--text-secondary)',
                    fontStyle: 'italic'
                  }}>
                    Excluded from extraction
                  </span>
                )}
              </div>

              {/* Column config - only show if included */}
              {isIncluded && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Question Column *</label>
                      <select
                        className="form-select"
                        value={mappings[index]?.question_column || ''}
                        onChange={(e) => updateMapping(index, { question_column: e.target.value })}
                      >
                        <option value="">Select column...</option>
                        {sheet.columns.map((col, colIndex) => (
                          <option key={col} value={col}>
                            {formatColumnOption(col, colIndex)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Answer Column (optional)</label>
                      <select
                        className="form-select"
                        value={mappings[index]?.answer_column || ''}
                        onChange={(e) =>
                          updateMapping(index, { answer_column: e.target.value || undefined })
                        }
                      >
                        <option value="">None</option>
                        {sheet.columns.map((col, colIndex) => (
                          <option key={col} value={col}>
                            {formatColumnOption(col, colIndex)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Per-sheet question types selection (for approach 2 or when comparing all approaches) */}
                  {(config.approach === 2 || config.run_all_approaches) && (
                    <div className="form-group" style={{ marginTop: '1rem' }}>
                      <label className="form-label">Expected Question Types (for this sheet)</label>
                      <div className="multiselect">
                        {QUESTION_TYPES.map((type) => (
                          <button
                            key={type.value}
                            type="button"
                            className={`multiselect-option ${(mappings[index]?.question_types || []).includes(type.value) ? 'selected' : ''}`}
                            onClick={() => toggleQuestionType(index, type.value)}
                          >
                            {type.label}
                          </button>
                        ))}
                      </div>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                        Select the types of questions you expect to find in this sheet (optional)
                        {config.run_all_approaches && ' - Used by Approach 2 (User-Guided)'}
                      </p>
                    </div>
                  )}

                  {/* Sample data preview */}
                  {sheet.sample_data.length > 0 && (
                    <div style={{ marginTop: '1rem' }}>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                        Sample data:
                      </p>
                      <div
                        style={{
                          fontSize: '0.75rem',
                          background: 'white',
                          padding: '0.5rem',
                          borderRadius: '4px',
                          maxHeight: '100px',
                          overflow: 'auto',
                        }}
                      >
                        {sheet.sample_data.slice(0, 2).map((row, rowIndex) => (
                          <div key={rowIndex} style={{ marginBottom: '0.25rem' }}>
                            {mappings[index]?.question_column && row[mappings[index].question_column] && (
                              <span>
                                <strong>Q:</strong> {row[mappings[index].question_column]?.substring(0, 80)}...
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
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
        <button className="btn btn-primary" onClick={handleNext} disabled={!isValid}>
          Run Extraction
        </button>
      </div>
    </div>
  );
}
