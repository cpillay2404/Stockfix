// OneDrive integration via Replit Connectors proxy
// Uses connection:conn_onedrive_01KNC3R3T1ZH6BX23D7NXP66T7

let cachedToken: { token: string; expiresAt: number } | null = null;

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
// Resolves the real site ID from the hostname + site path automatically.
export async function uploadToSharePoint(
  siteHostname: string,   // e.g. "meridiangroupza.sharepoint.com"
  sitePath: string,       // e.g. "/sites/MeridianNexus"
  folderPath: string,     // path inside Shared Documents, e.g. "Stock Fix/Output"
  filename: string,
  content: Buffer | string,
  contentType = 'text/csv'
): Promise<{ webUrl: string }> {
  const token = await getOneDriveToken();

  // Step 1: resolve the real site ID
  const siteResp = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteHostname}:${sitePath}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!siteResp.ok) {
    const text = await siteResp.text();
    throw new Error(`Could not resolve SharePoint site: ${siteResp.status} ${text}`);
  }
  const siteData = await siteResp.json() as any;
  const siteId: string = siteData.id;
  console.log(`[SharePoint Upload] Resolved siteId: ${siteId}`);

  // Step 2: encode path and upload using site's default drive (/drive singular = main Documents library)
  const encodedFolder = folderPath.split('/').map(encodeURIComponent).join('/');
  const encodedFile = encodeURIComponent(filename);
  const body = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;

  // Try site default drive first
  const uploadUrl = `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodedFolder}/${encodedFile}:/content`;
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
        `SharePoint upload blocked (403 Access Denied). The Microsoft account connected to Replit needs write permission (Files.ReadWrite or Sites.ReadWrite.All) granted by your M365 tenant admin.`
      );
    }
    throw new Error(`SharePoint upload failed ${status}: ${text}`);
  }
  const data = await uploadResp.json() as any;
  return { webUrl: data.webUrl || '' };
}
