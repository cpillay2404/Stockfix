import { ClientSecretCredential } from '@azure/identity';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const SP_HOSTNAME = process.env.SP_HOSTNAME || 'meridiangroupza.sharepoint.com';
const SP_SITE_PATH = process.env.SP_SITE_PATH || '/sites/MeridianNexus';

let _cred: ClientSecretCredential | null = null;
function getCred(): ClientSecretCredential {
  if (!_cred) {
    _cred = new ClientSecretCredential(
      process.env.GRAPH_TENANT_ID!,
      process.env.GRAPH_CLIENT_ID!,
      process.env.GRAPH_CLIENT_SECRET!
    );
  }
  return _cred;
}

let _siteId: string | null = null;

async function getToken(): Promise<string> {
  const t = await getCred().getToken('https://graph.microsoft.com/.default');
  return t!.token;
}

async function graphRequest(path: string, opts: RequestInit = {}): Promise<Response> {
  const res = await fetch(GRAPH + path, {
    ...opts,
    headers: {
      Authorization: `Bearer ${await getToken()}`,
      ...((opts.headers as Record<string, string>) || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Graph ${res.status} on ${path}: ${body}`);
  }
  return res;
}

async function getSiteId(): Promise<string> {
  if (_siteId) return _siteId;
  const r = await graphRequest(`/sites/${SP_HOSTNAME}:${SP_SITE_PATH}`);
  _siteId = ((await r.json()) as any).id;
  console.log(`[SP App-Only] Resolved siteId: ${_siteId}`);
  return _siteId!;
}

function encodePath(p: string): string {
  return p.split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

export async function uploadToSharePoint(
  folder: string,
  filename: string,
  content: Buffer | string
): Promise<{ ok: boolean; filename: string; webUrl: string; size: number }> {
  const id = await getSiteId();
  const rel = encodePath(`${folder}/${filename}`);
  const body = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
  const r = await graphRequest(`/sites/${id}/drive/root:/${rel}:/content`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    body,
  });
  const j = (await r.json()) as any;
  return { ok: true, filename: j.name, webUrl: j.webUrl, size: j.size };
}
