import { Task } from "@shared/schema";

const API_BASE = "/api";

export async function fetchTasks(): Promise<Task[]> {
  const res = await fetch(`${API_BASE}/tasks`);
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
