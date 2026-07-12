// OneDrive integration via Replit Connectors proxy
// Uses connection:conn_onedrive_01KNC3R3T1ZH6BX23D7NXP66T7

import { ClientSecretCredential } from '@azure/identity';

let cachedToken: { token: string; expiresAt: number } | null = null;
let appCredential: ClientSecretCredential | null = null;

// App-only token using StockFix Automation app registration (for writes)
async function getAppOnlyToken(): Promise<string | null> {
  const tenantId = process.env.GRAPH_TENANT_ID;
  const clientId = process.env.GRAPH_CLIENT_ID;
  const clientSecret = process.env.GRAPH_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) return null;
  if (!appCredential) {
    appCredential = new ClientSecretCredential(tenantId, clientId, clientSecret);
  }
  const t = await appCredential.getToken('https://graph.microsoft.com/.default');
  return t?.token || null;
}

export async function getOneDriveToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) {
    return cachedToken.token;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const replIdentity = process.env.REPL_IDENTITY;
  const webReplRenewal = process.env.WEB_REPL_RENEWAL;

  const xReplitToken = replIdentity
    ? 'repl ' + replIdentity
    : webReplRenewal
    ? 'depl ' + webReplRenewal
    : null;

  if (!hostname || !xReplitToken) {
    throw new Error('Replit connector env vars missing (REPLIT_CONNECTORS_HOSTNAME / REPL_IDENTITY)');
  }

  // Try sharepoint connector first, fall back to onedrive (same OAuth token)
  let token: string | undefined;
  let expiresAtRaw: string | undefined;
  for (const connectorName of ['sharepoint', 'onedrive']) {
    const resp = await fetch(
      `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=${connectorName}`,
      { headers: { Accept: 'application/json', 'X-Replit-Token': xReplitToken } }
    );
    const data = await resp.json() as any;
    const conn = data.items?.[0];
    token = conn?.settings?.access_token || conn?.settings?.oauth?.credentials?.access_token;
    expiresAtRaw = conn?.settings?.expires_at;
    if (token) break;
  }

  if (!token) {
    throw new Error('SharePoint token not found — make sure the SharePoint or OneDrive integration is connected in this project');
  }

  const expiresAt = expiresAtRaw
    ? new Date(expiresAtRaw).getTime()
    : Date.now() + 3500000;

  cachedToken = { token, expiresAt };
  return token;
}

export async function graphGet(path: string): Promise<any> {
  const token = await getOneDriveToken();
  const url = `https://graph.microsoft.com/v1.0${path}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Graph API error ${resp.status}: ${text}`);
  }
  return resp.json();
}

// The pilot Excel file sharing URL (from user's OneDrive/SharePoint)
const PILOT_FILE_SHARE_URL = 'https://meridiangroupza-my.sharepoint.com/:x:/g/personal/cpillay_meridiangroup_co_za1/IQCXfoSmji4rSIYy7dA2cAcLAYTze7g9RlyWjvm8Te1GbKo?e=a9IPwj';

// Encode a sharing URL into the Microsoft Graph shares format
function encodeSharingUrl(url: string): string {
  const b64 = Buffer.from(url).toString('base64').replace(/=/g, '').replace(/\//g, '_').replace(/\+/g, '-');
  return 'u!' + b64;
}

// Get the driveItem for the pilot file via its sharing URL
export async function getPilotFileItem(): Promise<{ id: string; name: string; webUrl: string }> {
  const encoded = encodeSharingUrl(PILOT_FILE_SHARE_URL);
  const data = await graphGet(`/shares/${encoded}/driveItem?$select=id,name,webUrl`);
  if (data.error) throw new Error(`Could not access file: ${data.error.message}`);
  return data;
}

// Search for a file by name across the user's OneDrive (fallback)
export async function findFileByName(name: string): Promise<{ id: string; name: string; webUrl: string } | null> {
  try {
    // First try via the known sharing URL
    return await getPilotFileItem();
  } catch {
    // Fallback: search the drive
    const data = await graphGet(`/me/drive/root/search(q='${encodeURIComponent(name)}')?$select=id,name,webUrl`);
    const match = (data.value || []).find((f: any) =>
      f.name.toLowerCase().includes(name.toLowerCase())
    );
    return match || null;
  }
}

// Read a worksheet's used range and return as array of row arrays
export async function readWorksheetRows(fileId: string, sheetName: string): Promise<string[][]> {
  const data = await graphGet(
    `/me/drive/items/${fileId}/workbook/worksheets/${encodeURIComponent(sheetName)}/usedRange`
  );
  return (data.values || []) as string[][];
}

// List worksheet names in a workbook
export async function listWorksheets(fileId: string): Promise<string[]> {
  const data = await graphGet(`/me/drive/items/${fileId}/workbook/worksheets`);
  return (data.value || []).map((ws: any) => ws.name);
}

// Upload a file to a SharePoint site folder via the Graph API.
// Uses app-only credentials (GRAPH_TENANT_ID/CLIENT_ID/CLIENT_SECRET) when available,
// otherwise falls back to the Replit delegated connector token.
export async function uploadToSharePoint(
  siteHostname: string,
  sitePath: string,
  folderPath: string,
  filename: string,
  content: Buffer | string,
  contentType = 'text/csv'
): Promise<{ webUrl: string }> {
  // Prefer app-only token (has write access); fall back to delegated connector token
  const appToken = await getAppOnlyToken();
  const token = appToken || await getOneDriveToken();
  const authMode = appToken ? 'app-only' : 'delegated';
  console.log(`[SharePoint Upload] Auth mode: ${authMode}`);

  // Step 1: resolve site ID
  const siteResp = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteHostname}:${sitePath}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!siteResp.ok) {
    const text = await siteResp.text();
    throw new Error(`Could not resolve SharePoint site: ${siteResp.status} ${text}`);
  }
  const siteId: string = (await siteResp.json() as any).id;
  console.log(`[SharePoint Upload] Resolved siteId: ${siteId}`);

  // Step 2: upload to site's default document library (/drive singular)
  const encodedPath = [...folderPath.split('/'), filename].filter(Boolean).map(encodeURIComponent).join('/');
  const body = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
  const uploadUrl = `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodedPath}:/content`;

  const uploadResp = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType },
    body,
  });

  if (!uploadResp.ok) {
    const text = await uploadResp.text();
    const status = uploadResp.status;
    if (status === 403) {
      throw new Error(
        authMode === 'app-only'
          ? `SharePoint upload blocked (403). Ensure the StockFix Automation app has admin consent for Sites.ReadWrite.All or Files.ReadWrite.All.`
          : `SharePoint upload blocked (403). Set GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET secrets in Replit to use app-only auth with write access.`
      );
    }
    throw new Error(`SharePoint upload failed ${status}: ${text}`);
  }
  const data = await uploadResp.json() as any;
  return { webUrl: data.webUrl || '' };
}
