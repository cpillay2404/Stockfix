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

  const resp = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=onedrive`,
    {
      headers: {
        Accept: 'application/json',
        'X-Replit-Token': xReplitToken,
      },
    }
  );

  const data = await resp.json() as any;
  const conn = data.items?.[0];
  const token =
    conn?.settings?.access_token ||
    conn?.settings?.oauth?.credentials?.access_token;

  if (!token) {
    throw new Error('OneDrive token not found — make sure the OneDrive integration is connected in this project');
  }

  const expiresAt = conn?.settings?.expires_at
    ? new Date(conn.settings.expires_at).getTime()
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

// Search for a file by name across the user's OneDrive
export async function findFileByName(name: string): Promise<{ id: string; name: string; webUrl: string } | null> {
  const data = await graphGet(`/me/drive/root/search(q='${encodeURIComponent(name)}')?$select=id,name,webUrl`);
  const match = (data.value || []).find((f: any) =>
    f.name.toLowerCase().includes(name.toLowerCase())
  );
  return match || null;
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
