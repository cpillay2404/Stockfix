// Typed client for the /api/nexus/* routes (server/routes.ts + server/nexus.ts).
// Response shapes mirror server/nexus.ts's NexusStoreCurrentRecord /
// NexusOosDetailRecord / etc. interfaces — all marked SHAPE UNVERIFIED there
// until confirmed against a live Nexus response.

export interface NexusActionQueue {
  total: number;
  orderableNow: number;
  toEscalate: number;
}

export interface NexusStoreCurrentRecord {
  store: string;
  client: string;
  weekEnding: string;
  totalSkus: number;
  inStockPct: number;
  outOfStockCount: number;
  lowStockCount: number;
  overstockCount: number;
  noSalesStockPresentCount: number;
  optimalCount: number;
  actionQueue?: NexusActionQueue;
  trend13Week?: Array<{ weekEnding: string; inStockPct: number }>;
  trend9Week?: Array<{ weekEnding: string; healthScore: number }>;
}

export type NexusClassification =
  | 'Out of stock'
  | 'Low stock'
  | 'No sales stock present'
  | 'Overstocked'
  | 'Optimal';

export interface NexusLineListRecord {
  barcode: string;
  articleDescription: string;
  store: string;
  client: string;
  classification?: NexusClassification;
  unitsMissedPerWeek: number;
  dcStock: number;
  suggestedOrder: number;
  storeSoh: number;
  weeksOfCover?: number;
  peerDistribution?: Array<{ store: string; soh: number }>;
  chronic?: boolean;
  dcHasStock?: boolean;
}

export interface NexusSkuRecord {
  barcode: string;
  articleDescription: string;
  store: string;
  client: string;
  classification: NexusClassification;
  storeSoh: number;
  dcStock: number;
  suggestedOrder: number;
  unitsSold13Week?: number[];
  storeSoh13Week?: number[];
  weekEndings13Week?: string[];
  peerDistribution?: Array<{ store: string; soh: number }>;
  rootCauseHint?: 'dc-no-stock' | 'dc-has-stock-not-ordered' | 'no-sales' | 'unknown';
}

interface NexusEnvelope<T> {
  weekEnding: string;
  clientSlug: string;
  records: T;
  error?: string;
}

async function nexusFetch<T>(path: string, params: Record<string, string | undefined>): Promise<NexusEnvelope<T>> {
  const qp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) qp.set(k, v);
  }
  const res = await fetch(`${path}?${qp.toString()}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error || `Nexus request failed (${res.status})`);
  }
  return json as NexusEnvelope<T>;
}

export function fetchNexusStoreOverview(params: { rep?: string; store?: string; client?: string }) {
  return nexusFetch<NexusStoreCurrentRecord[]>('/api/nexus/store-overview', params);
}

export function fetchNexusAvailability(params: { rep?: string; store?: string; client?: string }) {
  return nexusFetch<NexusLineListRecord[]>('/api/nexus/availability', params);
}

export function fetchNexusLineList(params: { rep?: string; store?: string; client?: string; classification?: string }) {
  return nexusFetch<NexusLineListRecord[]>('/api/nexus/line-list', params);
}

export function fetchNexusSkuRecord(params: { barcode: string; store?: string; client?: string; scope?: 'this-store' | 'all-mine' }) {
  return nexusFetch<NexusSkuRecord[]>('/api/nexus/sku-record', params);
}
