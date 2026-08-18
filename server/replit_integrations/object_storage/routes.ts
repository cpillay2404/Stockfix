import type { Express } from "express";
import {
  createPhotoUploadUrl,
  proxyPhoto,
} from "../../supabase-storage";

/**
 * Register photo storage routes backed by Supabase Storage.
 *
 * Flow:
 * 1. POST /api/uploads/request-url — returns a Supabase signed upload URL
 *    and the objectPath to save in the DB (image1/2/3/4 columns).
 * 2. Client uploads the file directly to the signed URL (PUT).
 * 3. GET /objects/:objectPath(*) — proxies the photo from Supabase Storage.
 */
export function registerObjectStorageRoutes(app: Express): void {
  /** Request a presigned upload URL for a new photo. */
  app.post("/api/uploads/request-url", async (req, res) => {
    try {
      const { name, size, contentType } = req.body;

      if (!name) {
        return res.status(400).json({ error: "Missing required field: name" });
      }

      const { uploadURL, objectPath } = await createPhotoUploadUrl(name);

      res.json({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      });
    } catch (error) {
      console.error("[storage] Error generating upload URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  /** Serve / proxy a stored photo by its objectPath. */
  app.get("/objects/:objectPath(*)", async (req, res) => {
    try {
      // req.path is e.g. /objects/uploads/uuid.jpg
      const objectPath = req.path.replace(/^\/objects\//, "");
      await proxyPhoto(objectPath, res);
    } catch (error) {
      console.error("[storage] Error serving photo:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to serve photo" });
      }
    }
  });
}
