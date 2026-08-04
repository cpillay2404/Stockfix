// Meridian Nexus Inventory Dashboard proxy — server-side only, so the
// Nexus function key never reaches the browser. Mirrors the external-API
// pattern already used in onedrive.ts (graphGet) / sharepoint-appauth.ts
// (graphRequest): a small typed fetch helper, descriptive errors on
// non-OK responses, and a module-level cache reusing the same
// Map<string, {data,timestamp}> + TTL shape already used for
// dashboardStatsCache/gamificationCache in routes.ts.

const NEXUS_API_BASE = "https://stockfix-validate-fdhkefdwc6dmejda.northeurope-01.azurewebsites.net/api/dashboard-data/";

interface NexusCacheEntry {
  data: any;
  timestamp: number;
}

const nexusCache: Map<string, NexusCacheEntry> = new Map();
const NEXUS_CACHE_TTL_MS = 60 * 1000; // 1 minute, matches DASHBOARD_CACHE_TTL_MS convention

// Nexus's own clientSlug() (see Meridian Nexus.dc.html) uppercases and
// replaces non-alphanumerics with "-". StockFix's tasks.client is free
// text and won't always match verbatim - confirmed live against Nexus's
// index.json client list (AGROSERVE, ALPEN, ANCHOR YEAST, AQUELLE, ASPEN,
// BUTTERFLY, CAPE COOKIES, DAVIDOFF, DURACELL, DYNAMIC BRANDS, ETHICA,
// LINDT, MAGALIES, P&G, PENFLEX, PMI, SCJ, SIR JUICE, SODASTREAM, SOILL,
// STAEDTLER, SWEET NOTHINGS, TACOMA) that "P&G" -> "P-G" needs the
// explicit override below; plain normalization handles the rest.
const CLIENT_SLUG_OVERRIDES: Record<string, string> = {
  "P&G": "P-G",
};

export function nexusClientSlug(clientName: string): string {
  const upper = (clientName || "").trim().toUpperCase();
  if (CLIENT_SLUG_OVERRIDES[upper]) return CLIENT_SLUG_OVERRIDES[upper];
  return upper.replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function nexusApiKey(): string {
  const key = process.env.NEXUS_API_KEY;
  if (!key) {
    throw new Error(
      "NEXUS_API_KEY is not set - add it as a Replit Secret (same undocumented-secrets convention as GRAPH_CLIENT_SECRET etc.)"
    );
  }
  return key;
}

/**
 * Fetches one Nexus dashboard-data stem (e.g. "oos_detail", "store_current",
 * "distribution_gaps") for a given week + client, with optional extra query
 * params (store, banner, rep, region, q, etc. - same param names Nexus's own
 * frontend already uses). Cached in-memory for NEXUS_CACHE_TTL_MS.
 */
export async function fetchNexusJson(
  week: string,
  clientSlug: string,
  stem: string,
  params: Record<string, string | undefined> = {}
): Promise<any> {
  const cacheKey = `${week}_${clientSlug}_${stem}_${JSON.stringify(params)}`;
  const cached = nexusCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < NEXUS_CACHE_TTL_MS) {
    return cached.data;
  }

  const qs = new URLSearchParams();
  qs.set("code", nexusApiKey());
  for (const [k, v] of Object.entries(params)) {
    if (v) qs.set(k, v);
  }

  const url = `${NEXUS_API_BASE}weeks/${encodeURIComponent(week)}/clients/${encodeURIComponent(clientSlug)}/${stem}.json?${qs.toString()}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Nexus API error ${resp.status} on ${stem}: ${text}`);
  }
  const data = await resp.json();
  nexusCache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
}

export function clearNexusCache() {
  nexusCache.clear();
}

/**
 * Nexus's index.json ({"latest": "2026-07-29", "weeks":[...], "clients":[...]})
 * is whole-network, not per-client - cached separately from the per-stem cache
 * above since its key shape is different (no client/stem/params).
 */
let latestWeekCache: { week: string; timestamp: number } | null = null;

export async function fetchNexusLatestWeek(): Promise<string> {
  if (latestWeekCache && Date.now() - latestWeekCache.timestamp < NEXUS_CACHE_TTL_MS) {
    return latestWeekCache.week;
  }
  const url = `${NEXUS_API_BASE}index.json?code=${encodeURIComponent(nexusApiKey())}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Nexus API error ${resp.status} on index.json: ${text}`);
  }
  const data = await resp.json() as { latest: string };
  latestWeekCache = { week: data.latest, timestamp: Date.now() };
  return data.latest;
}
