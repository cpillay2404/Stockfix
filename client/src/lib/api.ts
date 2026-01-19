import { Task } from "@shared/schema";
import { normalizeObjectUrl } from "@shared/urlUtils";

const API_BASE = "/api";

export interface DashboardStats {
  totalTasks: number;
  totalStores: number;
  pendingCount: number;
  completedCount: number;
  totalP4WeekSales: number;
  statusCounts: Record<string, number>;
  actionBreakdown: { action: string; count: number }[];
  stockClassifications: { classification: string; count: number }[];
  topStores: { name: string; count: number }[];
  topReps: { name: string; count: number }[];
  clients: { name: string; count: number }[];
  filters: {
    regions: string[];
    reps: string[];
    stores: string[];
    clients: string[];
    issueTypes: string[];
  };
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const res = await fetch(`${API_BASE}/dashboard/stats`);
  if (!res.ok) throw new Error("Failed to fetch dashboard stats");
  return res.json();
}

export interface TasksResponse {
  tasks: Task[];
  total: number;
  page: number;
  totalPages: number;
}

export interface TaskFilters {
  region?: string;
  rep?: string;
  store?: string;
  client?: string;
  issue?: string;
  category?: string;
  article?: string;
}

export async function fetchTasks(page = 1, limit = 50, search = '', status = '', filters: TaskFilters = {}): Promise<TasksResponse> {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
    ...(search && { search }),
    ...(status && { status }),
    ...(filters.region && { region: filters.region }),
    ...(filters.rep && { rep: filters.rep }),
    ...(filters.store && { store: filters.store }),
    ...(filters.client && { client: filters.client }),
    ...(filters.issue && { issue: filters.issue }),
    ...(filters.category && { category: filters.category }),
    ...(filters.article && { article: filters.article }),
  });
  const res = await fetch(`${API_BASE}/tasks?${params}`);
  if (!res.ok) throw new Error("Failed to fetch tasks");
  return res.json();
}

export async function fetchTask(uniqueId: string): Promise<Task> {
  const res = await fetch(`${API_BASE}/tasks/${uniqueId}`);
  if (!res.ok) throw new Error("Failed to fetch task");
  return res.json();
}

export async function updateTask(
  uniqueId: string,
  updates: {
    actionStatus?: string;
    reasonCode?: string | null;
    actionTakenComment?: string | null;
    feedback?: string | null;
    captureDate?: string;
    physicalCount?: string | null;
    variance?: string | null;
    systemAdjusted?: string | null;
    image1?: string | null;
    image2?: string | null;
  }
): Promise<Task> {
  const res = await fetch(`${API_BASE}/tasks/${uniqueId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error("Failed to update task");
  return res.json();
}

export async function uploadImage(file: File): Promise<{ url: string }> {
  // Step 1: Request presigned URL from backend
  const requestRes = await fetch(`${API_BASE}/uploads/request-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: file.name,
      size: file.size,
      contentType: file.type,
    }),
  });
  
  if (!requestRes.ok) throw new Error("Failed to get upload URL");
  const { uploadURL, objectPath } = await requestRes.json();
  
  // Step 2: Upload file directly to cloud storage
  const uploadRes = await fetch(uploadURL, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });
  
  if (!uploadRes.ok) throw new Error("Failed to upload image");
  
  // Return the normalized public URL path
  return { url: normalizeObjectUrl(objectPath) };
}

export interface ImportResult {
  success: boolean;
  count?: number;
  message: string;
  async?: boolean;
  jobId?: string;
}

export interface ImportJobStatus {
  id: string;
  status: 'processing' | 'completed' | 'failed';
  progress: number;
  totalRows: number;
  processedRows: number;
  createdCount: number;
  skippedCount: number;
  error?: string;
}

export async function checkImportStatus(jobId: string): Promise<ImportJobStatus> {
  const res = await fetch(`${API_BASE}/tasks/import/status/${jobId}`);
  if (!res.ok) {
    throw new Error("Failed to check import status");
  }
  return res.json();
}

export async function importExcel(
  file: File, 
  clearExisting = true,
  onProgress?: (status: ImportJobStatus) => void
): Promise<ImportResult> {
  const formData = new FormData();
  formData.append("file", file);
  
  const url = clearExisting ? `${API_BASE}/tasks/import?clear=true` : `${API_BASE}/tasks/import`;
  const res = await fetch(url, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to import file");
  }
  
  const result = await res.json();
  
  // If async import, poll for status
  if (result.async && result.jobId) {
    return new Promise((resolve, reject) => {
      const pollInterval = setInterval(async () => {
        try {
          const status = await checkImportStatus(result.jobId);
          
          if (onProgress) {
            onProgress(status);
          }
          
          if (status.status === 'completed') {
            clearInterval(pollInterval);
            resolve({
              success: true,
              count: status.createdCount,
              message: `Successfully imported ${status.createdCount} tasks (${status.skippedCount} skipped)`,
            });
          } else if (status.status === 'failed') {
            clearInterval(pollInterval);
            reject(new Error(status.error || 'Import failed'));
          }
        } catch (err) {
          clearInterval(pollInterval);
          reject(err);
        }
      }, 2000); // Poll every 2 seconds
    });
  }
  
  return result;
}
