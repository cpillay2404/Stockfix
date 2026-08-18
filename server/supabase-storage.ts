/**
 * Supabase Storage helpers using the REST API directly.
 * Avoids @supabase/supabase-js which requires native WebSocket (Node 22+).
 */
import { randomUUID } from "crypto";
import path from "path";
import type { Response } from "express";

const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_KEY || "";
export const PHOTOS_BUCKET = "stockfix-photos";

function storageUrl(rest: string) {
  return `${supabaseUrl}/storage/v1${rest}`;
}

function authHeaders(extra?: Record<string, string>) {
  return {
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

/** Ensure the photos bucket exists — call once at startup. */
export async function ensurePhotosBucket(): Promise<void> {
  const res = await fetch(storageUrl("/bucket"), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      id: PHOTOS_BUCKET,
      name: PHOTOS_BUCKET,
      public: false,
      file_size_limit: 15 * 1024 * 1024,
      allowed_mime_types: [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/heic",
        "image/heif",
      ],
    }),
  });

  if (res.ok) {
    console.log("[storage] stockfix-photos bucket created");
    return;
  }

  const body = await res.json().catch(() => ({}));
  if (body?.error === "Duplicate" || (body?.message || "").includes("already exists")) {
    console.log("[storage] stockfix-photos bucket already exists — ready");
    return;
  }

  console.error("[storage] Failed to create bucket:", body);
}

/**
 * Generate a Supabase signed upload URL for a new photo.
 * Returns the upload URL and the objectPath to store in the DB image columns.
 */
export async function createPhotoUploadUrl(
  originalName: string
): Promise<{ uploadURL: string; objectPath: string }> {
  const ext = path.extname(originalName).toLowerCase() || ".jpg";
  const objectPath = `uploads/${randomUUID()}${ext}`;

  const res = await fetch(
    storageUrl(`/object/upload/sign/${PHOTOS_BUCKET}/${objectPath}`),
    { method: "POST", headers: authHeaders() }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Supabase signed upload URL failed: ${err?.message || res.status}`);
  }

  const { url } = await res.json();
  // url is a relative path like /storage/v1/object/upload/sign/... — make it absolute
  const uploadURL = url.startsWith("http") ? url : `${supabaseUrl}${url}`;
  return { uploadURL, objectPath };
}

/**
 * Generate a short-lived signed download URL for a stored objectPath.
 */
export async function createPhotoDownloadUrl(
  objectPath: string,
  ttlSeconds = 3600
): Promise<string> {
  if (objectPath.startsWith("http")) return objectPath;

  const cleanPath = sanitizePath(objectPath);

  const res = await fetch(
    storageUrl(`/object/sign/${PHOTOS_BUCKET}/${cleanPath}`),
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ expiresIn: ttlSeconds }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Supabase signed download URL failed: ${err?.message || res.status}`);
  }

  const { signedURL } = await res.json();
  return signedURL.startsWith("http") ? signedURL : `${supabaseUrl}${signedURL}`;
}

/**
 * Proxy a photo from Supabase Storage to an Express response.
 */
export async function proxyPhoto(
  objectPath: string,
  res: Response
): Promise<void> {
  const cleanPath = sanitizePath(objectPath);

  const photoRes = await fetch(
    storageUrl(`/object/authenticated/${PHOTOS_BUCKET}/${cleanPath}`),
    { headers: { Authorization: `Bearer ${serviceKey}` } }
  );

  if (!photoRes.ok) {
    res.status(photoRes.status === 404 ? 404 : 500).json({ error: "Photo not found" });
    return;
  }

  const buffer = Buffer.from(await photoRes.arrayBuffer());
  const contentType = photoRes.headers.get("content-type") || "image/jpeg";
  res.set({
    "Content-Type": contentType,
    "Cache-Control": "private, max-age=3600",
    "Content-Length": buffer.length,
  });
  res.end(buffer);
}

/** Strip /objects/ prefix and normalise double-slashes */
function sanitizePath(p: string): string {
  return p
    .replace(/^\/objects\//, "")
    .replace(/^uploads\/uploads\//, "uploads/")
    .replace(/\/\/+/g, "/");
}
