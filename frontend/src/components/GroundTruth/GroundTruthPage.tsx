import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listGroundTruths, deleteGroundTruth, getGroundTruth } from '../../api/client';
import type { GroundTruthSummary, FileMetadata } from '../../types';
import { GroundTruthEditor } from './GroundTruthEditor';

interface GroundTruthPageProps {
  onBackToWizard: () => void;
}

type ViewMode = 'list' | 'create' | 'edit';

export function GroundTruthPage({ onBackToWizard }: GroundTruthPageProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fileMetadata, setFileMetadata] = useState<FileMetadata | null>(null);
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Fetch list of ground truths
  const groundTruthsQuery = useQuery({
    queryKey: ['groundTruths'],
    queryFn: listGroundTruths,
  });

  // Fetch single ground truth for editing
  const editQuery = useQuery({
    queryKey: ['groundTruth', editingId],
    queryFn: () => getGroundTruth(editingId!),
    enabled: !!editingId && viewMode === 'edit',
  });

  // Fetch ground truth for duplicating
  const duplicateQuery = useQuery({
    queryKey: ['groundTruth', duplicatingId],
    queryFn: () => getGroundTruth(duplicatingId!),
    enabled: !!duplicatingId && duplicateModalOpen,
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: deleteGroundTruth,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groundTruths'] });
    },
  });

  const handleCreate = (metadata?: FileMetadata) => {
    setFileMetadata(metadata || null);
    setEditingId(null);
    setViewMode('create');
  };

  const handleEdit = (id: string) => {
    setEditingId(id);
    setFileMetadata(null);
    setViewMode('edit');
  };

  const handleDelete = async (id: string, fileName: string) => {
    if (confirm(`Are you sure you want to delete ground truth for "${fileName}"?`)) {
      await deleteMutation.mutateAsync(id);
    }
  };

  const handleSaved = () => {
    queryClient.invalidateQueries({ queryKey: ['groundTruths'] });
    setViewMode('list');
    setEditingId(null);
    setFileMetadata(null);
  };

  const handleCancel = () => {
    setViewMode('list');
    setEditingId(null);
    setFileMetadata(null);
  };

  const handleDuplicate = (id: string) => {
    setDuplicatingId(id);
    setDuplicateModalOpen(true);
  };

  const handleDuplicateConfirm = () => {
    setDuplicateModalOpen(false);
    setDuplicatingId(null);
    queryClient.invalidateQueries({ queryKey: ['groundTruths'] });
  };

  const handleDuplicateCancel = () => {
    setDuplicateModalOpen(false);
    setDuplicatingId(null);
  };

  // Render editor view
  if (viewMode === 'create' || viewMode === 'edit') {
    const existingData = viewMode === 'edit' ? editQuery.data : undefined;
    
    if (viewMode === 'edit' && editQuery.isLoading) {
      return (
        <div className="ground-truth-page">
          <div className="loading">Loading ground truth...</div>
        </div>
      );
    }

    // Get list of existing file names (excluding current one if editing)
    const existingFileNames = groundTruthsQuery.data
      ?.filter(gt => viewMode !== 'edit' || gt.ground_truth_id !== editingId)
      .map(gt => gt.file_name.toLowerCase()) || [];

    return (
      <GroundTruthEditor
        existingData={existingData}
        fileMetadata={fileMetadata}
        existingFileNames={existingFileNames}
        onSave={handleSaved}
        onCancel={handleCancel}
      />
    );
  }

  // Render list view
  return (
    <div className="ground-truth-page">
      <div className="ground-truth-header">
        <button className="btn btn-secondary" onClick={onBackToWizard}>
          &larr; Back to Wizard
        </button>
        <h1>Ground Truth Manager</h1>
        <button className="btn btn-primary" onClick={() => handleCreate()}>
          + Create New
        </button>
      </div>

      <div className="ground-truth-content">
        <p className="ground-truth-description">
          Create and manage validated question sets for Excel files. 
          Ground truths can be used to measure extraction accuracy.
        </p>

        {groundTruthsQuery.isLoading && (
          <div className="loading">Loading ground truths...</div>
        )}

        {groundTruthsQuery.error && (
          <div className="error-message">
            Failed to load ground truths: {(groundTruthsQuery.error as Error).message}
          </div>
        )}

        {groundTruthsQuery.data && groundTruthsQuery.data.length === 0 && (
          <div className="empty-state">
            <p>No ground truths created yet.</p>
            <p>Create one to start validating extraction results!</p>
          </div>
        )}

        {groundTruthsQuery.data && groundTruthsQuery.data.length > 0 && (
          <GroundTruthList
            items={groundTruthsQuery.data}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onDuplicate={handleDuplicate}
            isDeleting={deleteMutation.isPending}
          />
        )}

        {/* Duplicate Modal */}
        {duplicateModalOpen && duplicateQuery.data && (
          <DuplicateModal
            sourceGroundTruth={duplicateQuery.data}
            existingFileNames={groundTruthsQuery.data?.map(gt => gt.file_name.toLowerCase()) || []}
            onConfirm={handleDuplicateConfirm}
            onCancel={handleDuplicateCancel}
          />
        )}
      </div>
    </div>
  );
}

/** Duplicate Modal Component */
function DuplicateModal({
  sourceGroundTruth,
  existingFileNames,
  onConfirm,
  onCancel,
}: {
  sourceGroundTruth: import('../../types').GroundTruth;
  existingFileNames: string[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [newFileName, setNewFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async (data: Parameters<typeof import('../../api/client').createGroundTruth>[0]) => {
      const { createGroundTruth } = await import('../../api/client');
      return createGroundTruth(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groundTruths'] });
      onConfirm();
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to duplicate ground truth');
    },
  });

  const handleDuplicate = () => {
    const trimmedName = newFileName.trim();
    
    if (!trimmedName) {
      setError('File name is required');
      return;
    }

    // Check for collision with existing names (case-insensitive)
    const normalizedNew = trimmedName.toLowerCase();
    const normalizedSource = sourceGroundTruth.file_name.toLowerCase();
    
    if (normalizedNew === normalizedSource) {
      setError('New name must be different from the original');
      return;
    }

    if (existingFileNames.includes(normalizedNew)) {
      setError('A ground truth with this file name already exists');
      return;
    }

    // Create the duplicate with new name
    createMutation.mutate({
      file_name: trimmedName,
      created_by: sourceGroundTruth.created_by,
      notes: sourceGroundTruth.notes 
        ? `Duplicated from "${sourceGroundTruth.file_name}". ${sourceGroundTruth.notes}`
        : `Duplicated from "${sourceGroundTruth.file_name}"`,
      sheets: sourceGroundTruth.sheets,
    });
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Duplicate Ground Truth</h3>
          <button className="modal-close" onClick={onCancel}>&times;</button>
        </div>

        <div className="modal-body">
          <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
            Duplicating: <strong>{sourceGroundTruth.file_name}</strong>
          </p>
          <p style={{ marginBottom: '1rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            This will create a copy with all {sourceGroundTruth.total_question_count} questions. 
            You can edit the questions later.
          </p>

          <div className="form-group">
            <label className="form-label">New File Name *</label>
            <input
              type="text"
              className="form-input"
              value={newFileName}
              onChange={(e) => {
                setNewFileName(e.target.value);
                setError(null);
              }}
              placeholder="e.g., Survey_2024_v2.xlsx"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleDuplicate();
                }
              }}
            />
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
              Must be different from existing ground truth names
            </p>
          </div>

          {error && (
            <div className="error-message" style={{ marginTop: '0.5rem' }}>
              {error}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button 
            className="btn btn-secondary" 
            onClick={onCancel}
            disabled={createMutation.isPending}
          >
            Cancel
          </button>
          <button 
            className="btn btn-primary" 
            onClick={handleDuplicate}
            disabled={createMutation.isPending || !newFileName.trim()}
          >
            {createMutation.isPending ? 'Duplicating...' : 'Duplicate'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Ground Truth List Component */
function GroundTruthList({
  items,
  onEdit,
  onDelete,
  onDuplicate,
  isDeleting,
}: {
  items: GroundTruthSummary[];
  onEdit: (id: string) => void;
  onDelete: (id: string, fileName: string) => void;
  onDuplicate: (id: string) => void;
  isDeleting: boolean;
}) {
  return (
    <div className="ground-truth-list">
      <table className="ground-truth-table">
        <thead>
          <tr>
            <th>File Name</th>
            <th>Questions</th>
            <th>Created By</th>
            <th>Last Updated</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.ground_truth_id}>
              <td className="file-name-cell">{item.file_name}</td>
              <td className="count-cell">{item.total_question_count}</td>
              <td>{item.created_by}</td>
              <td>{new Date(item.updated_at).toLocaleDateString()}</td>
              <td className="actions-cell">
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => onEdit(item.ground_truth_id)}
                >
                  Edit
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => onDuplicate(item.ground_truth_id)}
                  title="Create a copy with a different name"
                >
                  Duplicate
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => onDelete(item.ground_truth_id, item.file_name)}
                  disabled={isDeleting}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
