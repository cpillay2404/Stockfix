import { Task } from "@shared/schema";

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
    reasonCode?: string;
    actionTakenComment?: string;
    feedback?: string;
    captureDate?: string;
    image1?: string;
    image2?: string;
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
  const formData = new FormData();
  formData.append("image", file);
  
  const res = await fetch(`${API_BASE}/tasks/upload-image`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error("Failed to upload image");
  return res.json();
}

export async function importExcel(file: File): Promise<{ success: boolean; count: number; message: string }> {
  const formData = new FormData();
  formData.append("file", file);
  
  const res = await fetch(`${API_BASE}/tasks/import`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to import file");
  }
  return res.json();
}
