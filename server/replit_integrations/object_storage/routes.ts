import type { Express } from "express";
import { Client } from "@replit/object-storage";
import { randomUUID } from "crypto";

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
    const contentType =
      req.headers["content-type"] || "application/octet-stream";

    try {
      const client = makeClient();
      const objectKey = `${PREFIX}/${objectId}`;
      // uploadFromStream returns Promise<void> — resolves on success, rejects with
      // StreamRequestError on failure. Do NOT check result.ok (there is no Result wrapper).
      await client.uploadFromStream(objectKey, req, { contentType });

      res.status(200).json({ ok: true });
    } catch (err: any) {
      console.error("[storage] proxy-put error:", err?.message);
      res.status(500).json({ error: "Failed to store uploaded file" });
    }
  });

  // Serve stored objects
  // downloadAsStream() returns a PassThrough stream directly (not Promise<Result>).
  // Errors surface via the stream's "error" event.
  app.get("/objects/:objectId(*)", (req, res) => {
    const objectId = req.params.objectId;
    const objectKey = `${PREFIX}/${objectId}`;

    const client = makeClient();
    const stream = client.downloadAsStream(objectKey);

    res.set("Content-Type", "application/octet-stream");
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
