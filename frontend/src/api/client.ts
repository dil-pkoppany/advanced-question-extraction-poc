import axios from 'axios';
import type {
  UploadResponse,
  ExtractionConfig,
  ExtractionResponse,
  FileMetadata,
  ComparisonResult,
  RunMetadata,
} from '../types';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

/** Upload an Excel file */
export async function uploadFile(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await api.post<UploadResponse>('/upload/', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  return response.data;
}

/** Get metadata for an uploaded file */
export async function getFileMetadata(fileId: string): Promise<FileMetadata> {
  const response = await api.get<FileMetadata>(`/upload/${fileId}`);
  return response.data;
}

/** Run extraction with the specified configuration */
export async function runExtraction(
  fileId: string,
  config: ExtractionConfig
): Promise<ExtractionResponse> {
  const response = await api.post<ExtractionResponse>('/extract/', {
    file_id: fileId,
    config,
  });

  return response.data;
}

/** Get details of a specific extraction run */
export async function getRunDetails(runId: string): Promise<ExtractionResponse> {
  const response = await api.get<ExtractionResponse>(`/extract/runs/${runId}`);
  return response.data;
}

/** List all extraction runs */
export async function listRuns(): Promise<RunMetadata[]> {
  const response = await api.get<RunMetadata[]>('/extract/runs');
  return response.data;
}

/** Get comparison results */
export async function getComparison(comparisonId: string): Promise<ComparisonResult> {
  const response = await api.get<ComparisonResult>(`/comparisons/${comparisonId}`);
  return response.data;
}

/** List all comparisons */
export async function listComparisons(): Promise<ComparisonResult[]> {
  const response = await api.get<ComparisonResult[]>('/comparisons/');
  return response.data;
}

export default api;
