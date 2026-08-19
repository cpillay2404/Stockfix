import type { Express } from "express";
import { Client } from "@replit/object-storage";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { objectMetadata } from "@shared/schema";
import { db } from "../../db";

/**
 * Photo storage via @replit/object-storage SDK.
 *
 * Uses a server-proxy upload flow so the client interface stays unchanged:
 * 1. POST /api/uploads/request-url  → { uploadURL: "/api/uploads/proxy-put/:id", objectPath: "/objects/:id" }
 * 2. Client PUTs file body to uploadURL (our server, not GCS directly)
 * 3. Server streams body into Object Storage via SDK
 * 4. GET /objects/:id → served back via SDK downloadAsStream
 *
 * Bucket: FrankGuiltyMatrix (created via Replit Tools → Object Storage)
 */

const PREFIX = "photos";
const DEFAULT_PHOTO_CONTENT_TYPE = "image/jpeg";

function normalizeContentType(value: string | string[] | undefined): string {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const contentType = rawValue?.split(";")[0]?.trim().toLowerCase();

  // Only allow a conventional MIME type through to the response header.
  // Invalid or missing values fall back to the photo-safe default.
  if (
    contentType &&
    /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(contentType)
  ) {
    return contentType;
  }

  return DEFAULT_PHOTO_CONTENT_TYPE;
}

function legacyContentType(objectId: string): string {
  const extension = objectId.toLowerCase().split(".").pop();
  const typesByExtension: Record<string, string> = {
    avif: "image/avif",
    gif: "image/gif",
    heic: "image/heic",
    heif: "image/heif",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  };

  // This route exclusively serves `photos/` objects. Older uploads were not
  // recorded in object_metadata, so treating an unknown legacy photo as JPEG
  // keeps captured photos displayable instead of forcing a binary download.
  return typesByExtension[extension ?? ""] ?? DEFAULT_PHOTO_CONTENT_TYPE;
}

// No bucketId — SDK auto-discovers the bucket attached to this Repl.
// The display name ("FrankGuiltyMatrix") is not the internal bucket ID.
function makeClient() {
  return new Client();
}

export function registerObjectStorageRoutes(app: Express): void {
  // Step 1 — client requests an upload slot
  app.post("/api/uploads/request-url", (req, res) => {
    const { name, size, contentType } = req.body ?? {};
    if (!name) {
      return res.status(400).json({ error: "Missing required field: name" });
    }

    const objectId = randomUUID();
    const uploadURL = `/api/uploads/proxy-put/${objectId}`;
    const objectPath = `/objects/${objectId}`;

    res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
  });

  // Step 2 — client PUTs raw file body here; we stream it into Object Storage
  app.put("/api/uploads/proxy-put/:objectId", async (req, res) => {
    const { objectId } = req.params;
    const contentType = normalizeContentType(req.headers["content-type"]);

    try {
      const client = makeClient();
      const objectKey = `${PREFIX}/${objectId}`;
      // uploadFromStream returns Promise<void> — resolves on success, rejects with
      // StreamRequestError on failure. Do NOT check result.ok (there is no Result wrapper).
      await client.uploadFromStream(objectKey, req);
      await db
        .insert(objectMetadata)
        .values({ objectId, contentType })
        .onConflictDoUpdate({
          target: objectMetadata.objectId,
          set: { contentType, updatedAt: new Date() },
        });

      res.status(200).json({ ok: true });
    } catch (err: any) {
      console.error("[storage] proxy-put error:", err?.message);
      res.status(500).json({ error: "Failed to store uploaded file" });
    }
  });

  // Serve stored objects
  // downloadAsStream() returns a PassThrough stream directly (not Promise<Result>).
  // Errors surface via the stream's "error" event.
  app.get("/objects/:objectId(*)", async (req, res) => {
    const objectId = req.params.objectId;
    const objectKey = `${PREFIX}/${objectId}`;
    let contentType = legacyContentType(objectId);

    try {
      const [metadata] = await db
        .select({ contentType: objectMetadata.contentType })
        .from(objectMetadata)
        .where(eq(objectMetadata.objectId, objectId))
        .limit(1);
      if (metadata?.contentType) {
        contentType = normalizeContentType(metadata.contentType);
      }
    } catch (err: any) {
      // A metadata lookup outage should not prevent photos from loading.
      // The legacy image fallback remains correct for the route's photos/* keys.
      console.error("[storage] metadata lookup error:", err?.message);
    }

    const client = makeClient();
    const stream = client.downloadAsStream(objectKey);

    res.set("Content-Type", contentType);
    res.set("Content-Disposition", "inline");
    res.set("Cache-Control", "private, max-age=3600");

    stream.on("error", (err: any) => {
      console.error("[storage] download error:", err?.message);
      if (!res.headersSent) {
        res.status(404).json({ error: "Photo not found" });
      }
    });

    stream.pipe(res);
  });
}
