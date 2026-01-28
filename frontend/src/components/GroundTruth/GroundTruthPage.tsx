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

    return (
      <GroundTruthEditor
        existingData={existingData}
        fileMetadata={fileMetadata}
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
            isDeleting={deleteMutation.isPending}
          />
        )}
      </div>
    </div>
  );
}

/** Ground Truth List Component */
function GroundTruthList({
  items,
  onEdit,
  onDelete,
  isDeleting,
}: {
  items: GroundTruthSummary[];
  onEdit: (id: string) => void;
  onDelete: (id: string, fileName: string) => void;
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
