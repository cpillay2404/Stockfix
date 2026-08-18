import type { Express } from "express";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";

/**
 * Photo storage routes using Replit Object Storage (GCS via local sidecar).
 *
 * Requires a Replit Object Storage bucket to be created via the Replit UI
 * (Tools → Object Storage → Create bucket). Once created, Replit automatically
 * sets PRIVATE_OBJECT_DIR and PUBLIC_OBJECT_SEARCH_PATHS env vars.
 *
 * Flow:
 * 1. POST /api/uploads/request-url — returns a signed PUT URL + objectPath
 * 2. Client uploads file directly to the signed URL (PUT)
 * 3. GET /objects/:path — serves the file from object storage
 */
export function registerObjectStorageRoutes(app: Express): void {
  const objectStorageService = new ObjectStorageService();

  app.post("/api/uploads/request-url", async (req, res) => {
    try {
      const { name, size, contentType } = req.body;
      if (!name) {
        return res.status(400).json({ error: "Missing required field: name" });
      }

      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

      res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
    } catch (error: any) {
      const isSetupError =
        error?.message?.includes("PRIVATE_OBJECT_DIR") ||
        error?.message?.includes("Object Storage");

      console.error("[storage] Error generating upload URL:", error?.message);
      res.status(500).json({
        error: isSetupError
          ? "Photo storage not configured — create an Object Storage bucket in the Replit UI"
          : "Failed to generate upload URL",
      });
    }
  });

  app.get("/objects/:objectPath(*)", async (req, res) => {
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Photo not found" });
      }
      console.error("[storage] Error serving photo:", error);
      return res.status(500).json({ error: "Failed to serve photo" });
    }
  });
}
