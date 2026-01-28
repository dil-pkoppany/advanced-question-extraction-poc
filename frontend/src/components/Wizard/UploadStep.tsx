import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useMutation } from '@tanstack/react-query';
import { uploadFile } from '../../api/client';
import type { FileMetadata } from '../../types';

interface UploadStepProps {
  onUploadComplete: (metadata: FileMetadata) => void;
  onError: (error: string) => void;
}

export function UploadStep({ onUploadComplete, onError }: UploadStepProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const uploadMutation = useMutation({
    mutationFn: uploadFile,
    onSuccess: (response) => {
      onUploadComplete(response.metadata);
    },
    onError: (error: Error) => {
      onError(error.message || 'Failed to upload file');
    },
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      setSelectedFile(file);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
    },
    maxFiles: 1,
  });

  const handleUpload = () => {
    if (selectedFile) {
      uploadMutation.mutate(selectedFile);
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <span style={{ fontSize: '1.5rem' }}>📄</span>
        <h2>Upload File</h2>
      </div>

      <div
        {...getRootProps()}
        className={`dropzone ${isDragActive ? 'active' : ''}`}
      >
        <input {...getInputProps()} />
        <div className="dropzone-icon">📁</div>
        <p className="dropzone-text">
          {isDragActive ? (
            'Drop the file here...'
          ) : (
            <>
              Drag and drop a file here, or{' '}
              <strong>click to select</strong>
            </>
          )}
        </p>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
          Supported formats: .xlsx, .xls, .csv
        </p>
      </div>

      {selectedFile && (
        <div style={{ marginTop: '1.5rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1rem',
              background: 'var(--bg-light)',
              borderRadius: '8px',
            }}
          >
            <div>
              <p style={{ fontWeight: '500' }}>{selectedFile.name}</p>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                {(selectedFile.size / 1024).toFixed(1)} KB
              </p>
            </div>
            <button
              className="btn btn-secondary"
              onClick={() => setSelectedFile(null)}
              style={{ padding: '0.5rem 1rem' }}
            >
              Remove
            </button>
          </div>

          <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
            <button
              className="btn btn-primary"
              onClick={handleUpload}
              disabled={uploadMutation.isPending}
            >
              {uploadMutation.isPending ? (
                <>
                  <span className="spinner" style={{ width: '16px', height: '16px' }} />
                  Uploading...
                </>
              ) : (
                'Upload & Continue'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
