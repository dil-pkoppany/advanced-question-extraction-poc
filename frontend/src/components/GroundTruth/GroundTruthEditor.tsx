import { useState, useCallback, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import {
  uploadFile,
  createGroundTruth,
  updateGroundTruth,
} from '../../api/client';
import type {
  GroundTruth,
  GroundTruthSheet,
  GroundTruthQuestion,
  FileMetadata,
  QuestionType,
} from '../../types';

interface GroundTruthEditorProps {
  existingData?: GroundTruth;
  fileMetadata?: FileMetadata | null;
  existingFileNames?: string[]; // Lowercase normalized names of all ground truths
  onSave: () => void;
  onCancel: () => void;
}

const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: 'open_ended', label: 'Open Ended' },
  { value: 'single_choice', label: 'Single Choice' },
  { value: 'multiple_choice', label: 'Multiple Choice' },
  { value: 'grouped_question', label: 'Grouped Question' },
  { value: 'yes_no', label: 'Yes/No' },
];

export function GroundTruthEditor({
  existingData,
  fileMetadata: initialFileMetadata,
  existingFileNames = [],
  onSave,
  onCancel,
}: GroundTruthEditorProps) {
  const isEditing = !!existingData;
  
  // Form state
  const [fileName, setFileName] = useState(existingData?.file_name || '');
  const [createdBy, setCreatedBy] = useState(existingData?.created_by || '');
  const [notes, setNotes] = useState(existingData?.notes || '');
  const [sheets, setSheets] = useState<GroundTruthSheet[]>(
    existingData?.sheets || []
  );
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [fileMetadata, setFileMetadata] = useState<FileMetadata | null>(
    initialFileMetadata || null
  );
  const [error, setError] = useState<string | null>(null);
  const [showBulkInput, setShowBulkInput] = useState(false);
  const [bulkQuestionsText, setBulkQuestionsText] = useState('');
  const [bulkQuestionType, setBulkQuestionType] = useState<QuestionType>('open_ended');

  // Upload mutation for extracting file metadata
  const uploadMutation = useMutation({
    mutationFn: uploadFile,
    onSuccess: (response) => {
      setFileMetadata(response.metadata);
      setFileName(response.metadata.file_name);
      
      // Initialize sheets from file metadata
      const newSheets: GroundTruthSheet[] = response.metadata.sheets.map((s) => ({
        sheet_name: s.name,
        questions: [],
      }));
      setSheets(newSheets);
      setActiveSheetIndex(0);
      setError(null);
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to upload file');
    },
  });

  // Save mutations
  const createMutation = useMutation({
    mutationFn: createGroundTruth,
    onSuccess: onSave,
    onError: (err: Error) => {
      setError(err.message || 'Failed to create ground truth');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateGroundTruth>[1] }) =>
      updateGroundTruth(id, data),
    onSuccess: onSave,
    onError: (err: Error) => {
      setError(err.message || 'Failed to update ground truth');
    },
  });

  // Dropzone for file upload
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      uploadMutation.mutate(acceptedFiles[0]);
    }
  }, [uploadMutation]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    maxFiles: 1,
    disabled: isEditing,
  });

  // Sheet management
  const addSheet = () => {
    const newSheet: GroundTruthSheet = {
      sheet_name: `Sheet ${sheets.length + 1}`,
      questions: [],
    };
    setSheets([...sheets, newSheet]);
    setActiveSheetIndex(sheets.length);
  };

  const updateSheetName = (index: number, name: string) => {
    const updated = [...sheets];
    updated[index] = { ...updated[index], sheet_name: name };
    setSheets(updated);
  };

  const removeSheet = (index: number) => {
    if (sheets.length <= 1) return;
    const updated = sheets.filter((_, i) => i !== index);
    setSheets(updated);
    if (activeSheetIndex >= updated.length) {
      setActiveSheetIndex(updated.length - 1);
    }
  };

  // Helper function to renumber questions sequentially
  const renumberQuestions = (questions: GroundTruthQuestion[]): GroundTruthQuestion[] => {
    return questions.map((q, index) => ({
      ...q,
      id: `Q${String(index + 1).padStart(3, '0')}`,
    }));
  };

  // Reverse question order and renumber IDs sequentially
  const reverseQuestionIds = () => {
    if (sheets.length === 0) return;
    
    const currentSheet = sheets[activeSheetIndex];
    if (currentSheet.questions.length === 0) return;
    
    // Reverse the array order and renumber IDs sequentially from 1
    const reversedAndRenumbered = [...currentSheet.questions]
      .reverse()
      .map((q, index) => ({
        ...q,
        id: `Q${String(index + 1).padStart(3, '0')}`,
      }));
    
    const updatedSheets = [...sheets];
    updatedSheets[activeSheetIndex] = {
      ...currentSheet,
      questions: reversedAndRenumbered,
    };
    setSheets(updatedSheets);
  };

  // Question management - adds new questions at the top for easier UX
  const addQuestion = () => {
    if (sheets.length === 0) return;
    
    const currentSheet = sheets[activeSheetIndex];
    
    const newQuestion: GroundTruthQuestion = {
      id: 'Q001', // Will be renumbered
      question_text: '',
      question_type: 'open_ended',
      answers: undefined,
      row_index: undefined,
      is_problematic: false,
      problematic_comment: undefined,
    };
    
    const updatedSheets = [...sheets];
    const newQuestions = renumberQuestions([newQuestion, ...currentSheet.questions]);
    updatedSheets[activeSheetIndex] = {
      ...currentSheet,
      questions: newQuestions,
    };
    setSheets(updatedSheets);
  };

  const updateQuestion = (questionIndex: number, updates: Partial<GroundTruthQuestion>) => {
    const updatedSheets = [...sheets];
    const currentSheet = updatedSheets[activeSheetIndex];
    const updatedQuestions = [...currentSheet.questions];
    updatedQuestions[questionIndex] = {
      ...updatedQuestions[questionIndex],
      ...updates,
    };
    updatedSheets[activeSheetIndex] = {
      ...currentSheet,
      questions: updatedQuestions,
    };
    setSheets(updatedSheets);
  };

  const removeQuestion = (questionIndex: number) => {
    const updatedSheets = [...sheets];
    const currentSheet = updatedSheets[activeSheetIndex];
    const filteredQuestions = currentSheet.questions.filter((_, i) => i !== questionIndex);
    const renumberedQuestions = renumberQuestions(filteredQuestions);
    updatedSheets[activeSheetIndex] = {
      ...currentSheet,
      questions: renumberedQuestions,
    };
    setSheets(updatedSheets);
  };

  // Bulk question creation
  const handleBulkCreate = () => {
    if (sheets.length === 0 || !bulkQuestionsText.trim()) return;
    
    const currentSheet = sheets[activeSheetIndex];
    
    // Split by double newlines or single newlines, filter empty
    const questionTexts = bulkQuestionsText
      .split(/\n\s*\n|\n/)  // Split by double newline or single newline
      .map(q => q.trim())
      .filter(q => q.length > 0);
    
    if (questionTexts.length === 0) return;
    
    // Generate new questions with selected type (IDs will be renumbered)
    const newQuestions: GroundTruthQuestion[] = questionTexts.map((text) => ({
      id: 'Q001', // Will be renumbered
      question_text: text,
      question_type: bulkQuestionType,
      answers: undefined,
      row_index: undefined,
      is_problematic: false,
      problematic_comment: undefined,
    }));
    
    // Add questions at the top and renumber all
    const updatedSheets = [...sheets];
    const combinedQuestions = renumberQuestions([...newQuestions, ...currentSheet.questions]);
    updatedSheets[activeSheetIndex] = {
      ...currentSheet,
      questions: combinedQuestions,
    };
    setSheets(updatedSheets);
    
    // Clear the bulk input and hide it
    setBulkQuestionsText('');
    setBulkQuestionType('open_ended'); // Reset to default
    setShowBulkInput(false);
  };

  // Calculate total question count
  const totalQuestions = sheets.reduce((sum, s) => sum + s.questions.length, 0);

  // Save handler
  const handleSave = () => {
    if (!fileName.trim()) {
      setError('File name is required');
      return;
    }
    if (!createdBy.trim()) {
      setError('Created by is required');
      return;
    }
    if (totalQuestions === 0) {
      setError('At least one question is required');
      return;
    }

    // Validate file name doesn't collide with other ground truths
    const normalizedNewName = fileName.trim().toLowerCase();
    const originalNormalizedName = existingData?.file_name.toLowerCase();
    
    // Check if name changed and conflicts with another ground truth
    if (isEditing && normalizedNewName !== originalNormalizedName) {
      if (existingFileNames.includes(normalizedNewName)) {
        setError('A ground truth with this file name already exists. Please choose a different name.');
        return;
      }
    } else if (!isEditing && existingFileNames.includes(normalizedNewName)) {
      setError('A ground truth with this file name already exists. Please choose a different name.');
      return;
    }

    // Validate all questions have text
    for (const sheet of sheets) {
      for (const q of sheet.questions) {
        if (!q.question_text.trim()) {
          setError(`Question ${q.id} in sheet "${sheet.sheet_name}" has no text`);
          return;
        }
      }
    }

    // Strip whitespace from all text fields before saving
    const cleanedSheets = sheets.map((sheet) => ({
      sheet_name: sheet.sheet_name.trim(),
      questions: sheet.questions.map((q) => ({
        ...q,
        id: q.id.trim(),
        question_text: q.question_text.trim(),
        answers: q.answers?.map((a) => a.trim()).filter((a) => a.length > 0),
      })),
    }));

    if (isEditing && existingData) {
      updateMutation.mutate({
        id: existingData.ground_truth_id,
        data: {
          file_name: fileName.trim(),
          created_by: createdBy.trim(),
          notes: notes?.trim() || undefined,
          sheets: cleanedSheets,
        },
      });
    } else {
      createMutation.mutate({
        file_name: fileName.trim(),
        created_by: createdBy.trim(),
        notes: notes?.trim() || undefined,
        sheets: cleanedSheets,
      });
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const currentSheet = sheets[activeSheetIndex];

  return (
    <div className="ground-truth-editor">
      <div className="editor-header">
        <h2>{isEditing ? 'Edit Ground Truth' : 'Create Ground Truth'}</h2>
        <div className="editor-actions">
          <button className="btn btn-secondary" onClick={onCancel} disabled={isSaving}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Ground Truth'}
          </button>
        </div>
      </div>

      {error && (
        <div className="error-message" style={{ marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {/* File Upload Section (only for new) */}
      {!isEditing && !fileMetadata && (
        <div className="editor-section">
          <h3>1. Upload Excel File</h3>
          <p className="section-description">
            Upload an Excel file to automatically extract sheet names, or enter details manually below.
          </p>
          <div
            {...getRootProps()}
            className={`dropzone ${isDragActive ? 'active' : ''}`}
          >
            <input {...getInputProps()} />
            {uploadMutation.isPending ? (
              <p>Uploading...</p>
            ) : (
              <>
                <div className="dropzone-icon">📁</div>
                <p className="dropzone-text">
                  <strong>Drop Excel file here</strong> or click to browse
                </p>
              </>
            )}
          </div>
          
          <div className="manual-entry-divider">
            <span>OR</span>
          </div>
          
          <div className="form-group">
            <label className="form-label">Enter File Name Manually</label>
            <input
              type="text"
              className="form-input"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="e.g., Survey_2024.xlsx"
            />
          </div>
          
          {fileName && !fileMetadata && (
            <button
              className="btn btn-secondary"
              onClick={() => {
                if (!sheets.length) {
                  setSheets([{ sheet_name: 'Sheet 1', questions: [] }]);
                }
              }}
            >
              Continue with Manual Entry
            </button>
          )}
        </div>
      )}

      {/* File Info Section */}
      {(fileMetadata || fileName) && (
        <div className="editor-section">
          <h3>{isEditing ? 'File Information' : '2. File Information'}</h3>
          
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">
                File Name *
                {isEditing && (
                  <span style={{ fontSize: '0.75rem', fontWeight: '400', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
                    (editable)
                  </span>
                )}
              </label>
              <input
                type="text"
                className="form-input"
                value={fileName}
                onChange={(e) => {
                  setFileName(e.target.value);
                  setError(null); // Clear error when user types
                }}
                placeholder="e.g., Survey_2024.xlsx"
              />
              {isEditing && (
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  Changing the file name will affect how this ground truth is matched with extraction results
                </p>
              )}
            </div>
            
            <div className="form-group">
              <label className="form-label">Created By *</label>
              <input
                type="text"
                className="form-input"
                value={createdBy}
                onChange={(e) => setCreatedBy(e.target.value)}
                placeholder="Your name or email"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Notes (optional)</label>
            <textarea
              className="form-input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Any notes about this ground truth..."
            />
          </div>
        </div>
      )}

      {/* Sheets Section */}
      {(sheets.length > 0 || (fileName && !fileMetadata)) && (
        <div className="editor-section">
          <h3>{isEditing ? 'Sheets & Questions' : '3. Sheets & Questions'}</h3>
          
          <div className="sheet-tabs">
            {sheets.map((sheet, index) => (
              <div
                key={index}
                className={`sheet-tab ${index === activeSheetIndex ? 'active' : ''}`}
                onClick={() => setActiveSheetIndex(index)}
              >
                <span>{sheet.sheet_name}</span>
                <span className="sheet-count">({sheet.questions.length})</span>
              </div>
            ))}
            <button className="btn btn-secondary btn-sm add-sheet-btn" onClick={addSheet}>
              + Add Sheet
            </button>
          </div>

          {/* Summary between tabs and sheet editor */}
          {sheets.length > 0 && totalQuestions > 0 && (
            <div className="editor-summary" style={{ marginTop: '1rem', marginBottom: '1rem' }}>
              <strong>Total Questions:</strong> {totalQuestions} across {sheets.length} sheet(s)
            </div>
          )}

          {currentSheet && (
            <div className="sheet-editor">
              <div className="sheet-header">
                <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                  <label className="form-label">Sheet Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={currentSheet.sheet_name}
                    onChange={(e) => updateSheetName(activeSheetIndex, e.target.value)}
                  />
                </div>
                {sheets.length > 1 && (
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => removeSheet(activeSheetIndex)}
                  >
                    Remove Sheet
                  </button>
                )}
              </div>

              <div className="questions-section">
                <div className="questions-header">
                  <h4>Questions ({currentSheet.questions.length})</h4>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button className="btn btn-primary btn-sm" onClick={addQuestion}>
                      + Add Question
                    </button>
                    <button 
                      className="btn btn-secondary btn-sm" 
                      onClick={() => setShowBulkInput(!showBulkInput)}
                    >
                      {showBulkInput ? 'Hide Bulk Input' : '📋 Bulk Add'}
                    </button>
                    {currentSheet.questions.length > 0 && (
                      <button 
                        className="btn btn-secondary btn-sm" 
                        onClick={reverseQuestionIds}
                        title="Reverse the question ID numbering (keeps questions in same order)"
                      >
                        🔄 Reverse IDs
                      </button>
                    )}
                  </div>
                </div>

                {/* Bulk question input */}
                {showBulkInput && (
                  <div className="bulk-input-section" style={{ 
                    marginBottom: '1rem', 
                    padding: '1rem', 
                    background: 'var(--bg-light)', 
                    borderRadius: '8px',
                    border: '2px dashed var(--border)'
                  }}>
                    <div style={{ marginBottom: '0.75rem' }}>
                      <label className="form-label" style={{ fontWeight: '600' }}>
                        Bulk Add Questions
                      </label>
                      <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                        Paste multiple questions below (one per line or separated by empty lines).
                      </p>
                      
                      <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                        <label className="form-label">Question Type (for all questions)</label>
                        <select
                          className="form-select"
                          value={bulkQuestionType}
                          onChange={(e) => setBulkQuestionType(e.target.value as QuestionType)}
                          style={{ maxWidth: '250px' }}
                        >
                          {QUESTION_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Questions</label>
                        <textarea
                          className="form-input"
                          value={bulkQuestionsText}
                          onChange={(e) => setBulkQuestionsText(e.target.value)}
                          rows={10}
                          placeholder="Question 1&#10;&#10;Question 2&#10;&#10;Question 3&#10;..."
                          style={{ fontFamily: 'inherit' }}
                        />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                      <button 
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setBulkQuestionsText('');
                          setBulkQuestionType('open_ended');
                          setShowBulkInput(false);
                        }}
                      >
                        Cancel
                      </button>
                      <button 
                        className="btn btn-primary btn-sm"
                        onClick={handleBulkCreate}
                        disabled={!bulkQuestionsText.trim()}
                      >
                        Create {bulkQuestionsText.trim() ? bulkQuestionsText.split(/\n\s*\n|\n/).filter(q => q.trim()).length : ''} Questions
                      </button>
                    </div>
                  </div>
                )}

                {currentSheet.questions.length === 0 && !showBulkInput && (
                  <div className="empty-state" style={{ padding: '2rem' }}>
                    No questions yet. Click "Add Question" or "Bulk Add" to start.
                  </div>
                )}

                <div className="questions-list-editor">
                  {currentSheet.questions.map((question, qIndex) => (
                    <QuestionForm
                      key={qIndex}
                      question={question}
                      onChange={(updates) => updateQuestion(qIndex, updates)}
                      onRemove={() => removeQuestion(qIndex)}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Question Form Component */
function QuestionForm({
  question,
  onChange,
  onRemove,
}: {
  question: GroundTruthQuestion;
  onChange: (updates: Partial<GroundTruthQuestion>) => void;
  onRemove: () => void;
}) {
  const [answersText, setAnswersText] = useState(
    question.answers?.join('\n') || ''
  );

  // Sync answersText with question.answers when it changes externally
  useEffect(() => {
    setAnswersText(question.answers?.join('\n') || '');
  }, [question.answers]);

  const handleAnswersChange = (text: string) => {
    setAnswersText(text);
  };

  const handleAnswersBlur = () => {
    // Only trim and filter when user finishes editing
    const answers = answersText
      .split('\n')
      .map((a) => a.trim())
      .filter((a) => a.length > 0);
    onChange({ answers: answers.length > 0 ? answers : undefined });
  };

  const showAnswers = ['single_choice', 'multiple_choice', 'yes_no'].includes(
    question.question_type
  );

  return (
    <div className="question-form">
      <div className="question-form-header">
        <div className="form-group" style={{ width: '100px', marginBottom: 0 }}>
          <label className="form-label">ID</label>
          <input
            type="text"
            className="form-input"
            value={question.id}
            onChange={(e) => onChange({ id: e.target.value })}
          />
        </div>
        
        <div className="form-group" style={{ width: '150px', marginBottom: 0 }}>
          <label className="form-label">Type</label>
          <select
            className="form-select"
            value={question.question_type}
            onChange={(e) => onChange({ question_type: e.target.value as QuestionType })}
          >
            {QUESTION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group" style={{ width: '80px', marginBottom: 0 }}>
          <label className="form-label">Row #</label>
          <input
            type="number"
            className="form-input"
            value={question.row_index || ''}
            onChange={(e) =>
              onChange({
                row_index: e.target.value ? parseInt(e.target.value) : undefined,
              })
            }
            placeholder="Opt."
          />
        </div>

        {/* Problematic question marker in header */}
        <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <input
              type="checkbox"
              checked={question.is_problematic || false}
              onChange={(e) => onChange({ 
                is_problematic: e.target.checked,
                problematic_comment: e.target.checked ? question.problematic_comment : undefined
              })}
              style={{ cursor: 'pointer' }}
            />
            <span style={{ fontSize: '0.75rem', fontWeight: '500' }}>Problematic</span>
          </label>
          {question.is_problematic && (
            <input
              type="text"
              className="form-input"
              value={question.problematic_comment || ''}
              onChange={(e) => onChange({ problematic_comment: e.target.value || undefined })}
              placeholder="Comment (optional)..."
              style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
            />
          )}
        </div>

        <button className="btn btn-danger btn-sm remove-btn" onClick={onRemove}>
          Remove
        </button>
      </div>

      <div className="form-group">
        <label className="form-label">Question Text *</label>
        <textarea
          className="form-input"
          value={question.question_text}
          onChange={(e) => onChange({ question_text: e.target.value })}
          rows={2}
          placeholder="Enter the question text..."
        />
      </div>

      {showAnswers && (
        <div className="form-group">
          <label className="form-label">
            Answer Options (one per line)
          </label>
          <textarea
            className="form-input"
            value={answersText}
            onChange={(e) => handleAnswersChange(e.target.value)}
            onBlur={handleAnswersBlur}
            rows={3}
            placeholder="Option A&#10;Option B&#10;Option C"
          />
        </div>
      )}
    </div>
  );
}
