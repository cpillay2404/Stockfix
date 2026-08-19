---
name: Object Storage SDK metadata
description: Limitation of the installed Replit Object Storage SDK relevant to serving typed files.
---

The installed `@replit/object-storage` SDK does not expose custom metadata upload options or an object stat/metadata retrieval method. Its upload options only support compression, and object listing returns names only.

**Why:** The object-storage download route must set the original MIME type so browsers display uploaded photos rather than treating them as binary downloads. Relying on object metadata is not available through this SDK version.

**How to apply:** Store application-level MIME metadata in the database after a successful object upload, resolve it when serving the object, and keep a safe image fallback for legacy photo objects without a metadata row.