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
  id?: string;
  status: 'processing' | 'completed' | 'failed';
  progress: number;
  totalRows: number;
  processedRows: number;
  createdCount: number;
  skippedCount: number;
  error?: string;
  message?: string;
}

export async function checkImportStatus(jobId: string): Promise<ImportJobStatus> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${API_BASE}/tasks/import/status/${jobId}`);
      if (!res.ok) {
        throw new Error("Failed to check import status");
      }
      return res.json();
    } catch (err: any) {
      lastError = err;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  throw lastError || new Error("Failed to check import status");
}

export async function importExcel(
  file: File, 
  clearExisting = true,
  onProgress?: (status: ImportJobStatus) => void
): Promise<ImportResult> {
  const formData = new FormData();
  formData.append("file", file);
  
  const url = clearExisting ? `${API_BASE}/tasks/import?clear=true` : `${API_BASE}/tasks/import`;
  
  if (onProgress) {
    onProgress({ status: 'processing', progress: 0, totalRows: 0, processedRows: 0, createdCount: 0, skippedCount: 0, message: `Uploading ${(file.size / (1024 * 1024)).toFixed(1)}MB file...` });
  }
  
  const result = await new Promise<any>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.timeout = 15 * 60 * 1000;
    
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        const uploadPercent = Math.round((e.loaded / e.total) * 100);
        onProgress({ 
          status: 'processing', 
          progress: 0, 
          totalRows: 0, 
          processedRows: 0, 
          createdCount: 0, 
          skippedCount: 0, 
          message: `Uploading... ${uploadPercent}% (${(e.loaded / (1024*1024)).toFixed(1)}MB / ${(e.total / (1024*1024)).toFixed(1)}MB)` 
        });
      }
    };
    
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("Invalid response from server"));
        }
      } else {
        let errorMessage = `Upload failed with status ${xhr.status}`;
        try {
          const errorData = JSON.parse(xhr.responseText);
          errorMessage = errorData.error || errorMessage;
        } catch {
          if (xhr.responseText) errorMessage = xhr.responseText;
        }
        reject(new Error(errorMessage));
      }
    };
    
    xhr.onerror = () => reject(new Error("Network error. Check your connection and try again."));
    xhr.ontimeout = () => reject(new Error("Upload timed out after 15 minutes. Please try again."));
    
    xhr.send(formData);
  });
  
  // If async import, poll for status
  if (result.async && result.jobId) {
    return new Promise((resolve, reject) => {
      let consecutiveErrors = 0;
      const maxConsecutiveErrors = 5;
      const pollInterval = setInterval(async () => {
        try {
          const status = await checkImportStatus(result.jobId);
          consecutiveErrors = 0;
          
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
          consecutiveErrors++;
          console.warn(`Import status poll error (${consecutiveErrors}/${maxConsecutiveErrors}):`, err);
          if (consecutiveErrors >= maxConsecutiveErrors) {
            clearInterval(pollInterval);
            reject(new Error('Lost connection to import job. The import may still be processing on the server - check back shortly.'));
          }
        }
      }, 3000);
    });
  }
  
  return result;
}
