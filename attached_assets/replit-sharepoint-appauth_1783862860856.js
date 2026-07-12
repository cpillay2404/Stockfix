/**
 * StockFix — SharePoint upload via app-only (client credentials)
 * ==============================================================
 * Drop-in replacement for Replit's built-in Microsoft OAuth connector.
 *
 * WHY: the built-in connector uses a delegated (per-user) token that is
 * read-only for your account, so every write returns 403. App-only
 * credentials from the "StockFix Automation" app registration are not tied
 * to any person and get full write once the tenant admin grants consent
 * (Sites.ReadWrite.All / Files.ReadWrite.All) — a one-time click.
 *
 * SETUP
 * -----
 * 1) npm i @azure/identity node-fetch     (node-fetch only if Node < 18)
 * 2) Add these Replit Secrets (from the app registration):
 *      GRAPH_TENANT_ID       (Directory / tenant ID)
 *      GRAPH_CLIENT_ID       (Application / client ID)
 *      GRAPH_CLIENT_SECRET   (a client secret VALUE)
 *      SP_HOSTNAME=meridiangroupza.sharepoint.com
 *      SP_SITE_PATH=/sites/MeridianNexus
 * 3) Replace your current SharePoint upload code with uploadToSharePoint().
 *
 * Requires admin consent on the StockFix Automation app before writes work.
 */

const { ClientSecretCredential } = require("@azure/identity");
// Node 18+ has global fetch. For older Node: const fetch = require("node-fetch");

const GRAPH = "https://graph.microsoft.com/v1.0";
const SP_HOSTNAME = process.env.SP_HOSTNAME || "meridiangroupza.sharepoint.com";
const SP_SITE_PATH = process.env.SP_SITE_PATH || "/sites/MeridianNexus";

const cred = new ClientSecretCredential(
  process.env.GRAPH_TENANT_ID,
  process.env.GRAPH_CLIENT_ID,
  process.env.GRAPH_CLIENT_SECRET
);

let _siteId = null;

async function token() {
  const t = await cred.getToken("https://graph.microsoft.com/.default");
  return t.token;
}

async function graph(path, opts = {}) {
  const res = await fetch(GRAPH + path, {
    ...opts,
    headers: {
      Authorization: `Bearer ${await token()}`,
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Graph ${res.status} on ${path}: ${body}`);
  }
  return res;
}

async function siteId() {
  if (_siteId) return _siteId;
  // Resolve the site once: /sites/{hostname}:{server-relative-path}
  const r = await graph(`/sites/${SP_HOSTNAME}:${SP_SITE_PATH}`);
  _siteId = (await r.json()).id;
  return _siteId;
}

/**
 * Encode each path segment but keep the slashes between them.
 * e.g. "Stock Fix/Reporting/Historical feedback/file.csv"
 */
function encodePath(p) {
  return p
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
}

/**
 * Upload (create or OVERWRITE) a file to the site's default document library.
 * Uses /sites/{id}/drive (singular) = the main "Documents" library, so we
 * never enumerate /drives (which the delegated token couldn't do anyway).
 *
 * @param {string} folder   e.g. "Stock Fix/Reporting/Historical feedback"
 * @param {string} filename e.g. "stockfix-weekly-export-2026-07-07.csv"
 * @param {Buffer|string} content  file bytes / text
 * @returns {object} { ok, filename, webUrl, size }
 */
async function uploadToSharePoint(folder, filename, content) {
  const id = await siteId();
  const rel = encodePath(`${folder}/${filename}`);
  const r = await graph(
    `/sites/${id}/drive/root:/${rel}:/content`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: content,
    }
  );
  const j = await r.json();
  return { ok: true, filename: j.name, webUrl: j.webUrl, size: j.size };
}

/**
 * Download a file (for reading parquet/master files) — same library.
 */
async function downloadFromSharePoint(folder, filename) {
  const id = await siteId();
  const rel = encodePath(`${folder}/${filename}`);
  const r = await graph(`/sites/${id}/drive/root:/${rel}:/content`);
  return Buffer.from(await r.arrayBuffer());
}

module.exports = { uploadToSharePoint, downloadFromSharePoint, siteId };

/* -----------------------------------------------------------------
   Wire into your existing endpoints, e.g.:

   const { uploadToSharePoint } = require("./sharepoint-appauth");

   app.post("/api/tasks/save-to-sharepoint", async (req, res) => {
     try {
       const csv = buildFullExportCsv();               // your existing logic
       const week = currentWeekIso();                  // e.g. "2026-07-07"
       const filename = `stockfix-weekly-export-${week}.csv`;
       const out = await uploadToSharePoint(
         "Stock Fix/Reporting/Historical feedback", filename, csv
       );
       res.json({ ok: true, filename: out.filename, rows: csv.split("\n").length - 1,
                  week, webUrl: out.webUrl });
     } catch (e) {
       res.status(500).json({ ok: false, error: e.message });
     }
   });

   app.post("/api/tasks/save-to-sharepoint/completed", async (req, res) => {
     try {
       const csv = buildCompletedCsv();
       const week = currentWeekIso();
       const filename = `stockfix-completed-${week}.csv`;
       const out = await uploadToSharePoint(
         "Stock Fix/Stock Fix App Output Data/This weeks feedback file", filename, csv
       );
       res.json({ ok: true, filename: out.filename, rows: csv.split("\n").length - 1,
                  week, webUrl: out.webUrl });
     } catch (e) {
       res.status(500).json({ ok: false, error: e.message });
     }
   });
------------------------------------------------------------------ */
