import axios from 'axios';
import type {
  UploadResponse,
  ExtractionConfig,
  ExtractionResponse,
  ExtractionResult,
  FileMetadata,
  ComparisonResult,
  RunMetadata,
  GroundTruth,
  GroundTruthSummary,
  GroundTruthCreate,
  GroundTruthUpdate,
  GroundTruthComparisonResult,
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

// Ground Truth API functions

/** List all ground truths */
export async function listGroundTruths(): Promise<GroundTruthSummary[]> {
  const response = await api.get<GroundTruthSummary[]>('/ground-truth/');
  return response.data;
}

/** Get a specific ground truth by ID */
export async function getGroundTruth(groundTruthId: string): Promise<GroundTruth> {
  const response = await api.get<GroundTruth>(`/ground-truth/${groundTruthId}`);
  return response.data;
}

/** Create a new ground truth */
export async function createGroundTruth(data: GroundTruthCreate): Promise<GroundTruth> {
  const response = await api.post<GroundTruth>('/ground-truth/', data);
  return response.data;
}

/** Update an existing ground truth */
export async function updateGroundTruth(
  groundTruthId: string,
  data: GroundTruthUpdate
): Promise<GroundTruth> {
  const response = await api.put<GroundTruth>(`/ground-truth/${groundTruthId}`, data);
  return response.data;
}

/** Delete a ground truth */
export async function deleteGroundTruth(groundTruthId: string): Promise<void> {
  await api.delete(`/ground-truth/${groundTruthId}`);
}

/** Find ground truth by Excel filename */
export async function getGroundTruthByFilename(
  filename: string
): Promise<GroundTruth | null> {
  const response = await api.get<GroundTruth | null>(
    `/ground-truth/by-filename/${encodeURIComponent(filename)}`
  );
  return response.data;
}

/** Compare extraction results with ground truth */
export async function compareWithGroundTruth(
  filename: string,
  results: Record<string, ExtractionResult>
): Promise<Record<string, GroundTruthComparisonResult>> {
  const response = await api.post<Record<string, GroundTruthComparisonResult>>(
    `/ground-truth/compare/${encodeURIComponent(filename)}`,
    { results }
  );
  return response.data;
}

export default api;
