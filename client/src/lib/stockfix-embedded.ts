export const PERFECT_STORE_PRO_ORIGIN = "https://perfectstorepro.replit.app";
const CAPTURE_TOKEN_SESSION_KEY = "stockfix.perfectstorepro.capture-token";
const ROSTER_FETCH_GUARD_KEY = "__stockFixEmbeddedRosterFetchGuardInstalled";

export interface StockFixEmbeddedCaptureContext {
  store: string;
  client: string;
  repName: string;
}

export function isEmbeddedInPerfectStorePro(): boolean {
  if (typeof window === "undefined") return false;
  return window.parent !== window && Boolean(getStockFixEmbeddedCaptureToken());
}

export function getStockFixEmbeddedCaptureToken(): string {
  if (typeof window === "undefined") return "";

  const queryToken =
    new URLSearchParams(window.location.search).get("captureToken")?.trim() || "";
  if (queryToken) {
    window.sessionStorage.setItem(CAPTURE_TOKEN_SESSION_KEY, queryToken);
    return queryToken;
  }

  return window.sessionStorage.getItem(CAPTURE_TOKEN_SESSION_KEY) || "";
}

// The server remains the authority for token verification. This decoded
// context only lets the iframe render its initial route when PerfectStorePro
// intentionally passes a token without duplicating store/client/rep in the
// URL. It is unavailable to direct top-level URLs by design.
export function getStockFixEmbeddedCaptureContext(): StockFixEmbeddedCaptureContext | null {
  if (!isEmbeddedInPerfectStorePro()) return null;
  const token = getStockFixEmbeddedCaptureToken();
  const payloadSegment = token.split(".")[0];
  if (!payloadSegment) return null;

  try {
    const base64 = payloadSegment
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(payloadSegment.length / 4) * 4, "=");
    const payload = JSON.parse(atob(base64)) as Partial<StockFixEmbeddedCaptureContext>;
    if (
      typeof payload.store !== "string"
      || !payload.store.trim()
      || typeof payload.client !== "string"
      || !payload.client.trim()
      || typeof payload.repName !== "string"
      || !payload.repName.trim()
    ) {
      return null;
    }
    return {
      store: payload.store.trim(),
      client: payload.client.trim(),
      repName: payload.repName.trim(),
    };
  } catch {
    return null;
  }
}

export function getStockFixEmbeddedHeaders(): Record<string, string> {
  if (!isEmbeddedInPerfectStorePro()) return {};
  const captureToken = getStockFixEmbeddedCaptureToken();
  if (!captureToken) return {};
  return {
    "X-StockFix-Embedded": "perfectstorepro",
    "X-StockFix-Capture-Token": captureToken,
  };
}

export function preserveEmbeddedCaptureToken(url: string): string {
  if (!isEmbeddedInPerfectStorePro()) return url;
  const captureToken = getStockFixEmbeddedCaptureToken();
  if (!captureToken || !url.startsWith("/store-detail")) return url;

  const destination = new URL(url, window.location.origin);
  if (!destination.searchParams.has("captureToken")) {
    destination.searchParams.set("captureToken", captureToken);
  }
  return `${destination.pathname}${destination.search}${destination.hash}`;
}

export function installEmbeddedRosterFetchGuard(): void {
  const managedWindow = window as Window & { [ROSTER_FETCH_GUARD_KEY]?: boolean };
  if (managedWindow[ROSTER_FETCH_GUARD_KEY]) return;
  managedWindow[ROSTER_FETCH_GUARD_KEY] = true;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const headersToApply = getStockFixEmbeddedHeaders();
    if (!headersToApply["X-StockFix-Embedded"]) {
      return nativeFetch(input, init);
    }

    const rawUrl = typeof input === "string" || input instanceof URL ? String(input) : input.url;
    const requestUrl = new URL(rawUrl, window.location.origin);
    if (requestUrl.origin !== window.location.origin || !requestUrl.pathname.startsWith("/api/roster/")) {
      return nativeFetch(input, init);
    }

    requestUrl.searchParams.delete("rep");
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    Object.entries(headersToApply).forEach(([key, value]) => headers.set(key, value));

    return nativeFetch(`${requestUrl.pathname}${requestUrl.search}`, { ...init, headers });
  };
}