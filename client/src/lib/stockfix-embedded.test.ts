import assert from "node:assert/strict";
import test from "node:test";
import {
  getStockFixEmbeddedHeaders,
  installEmbeddedRosterFetchGuard,
  preserveEmbeddedCaptureToken,
} from "./stockfix-embedded";
import {
  buildActionCaptureUrl,
  buildSkuDetailUrl,
  buildStoreIssueListUrl,
  getCaptureReturnUrl,
} from "./action-capture-navigation";

function installEmbeddedWindow(search = "?captureToken=signed-token") {
  const values = new Map<string, string>();
  const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const mockWindow = {
    parent: {},
    location: {
      search,
      origin: "https://stockfix.test",
    },
    sessionStorage: {
      getItem: (key: string) => values.get(key) || null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({ input, init });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
  };

  Object.assign(globalThis, {
    window: mockWindow,
    document: { referrer: "https://perfectstorepro.replit.app/embed" },
  });

  return { mockWindow, fetchCalls };
}

test("keeps the signed iframe token available after internal navigation removes it from the URL", () => {
  const { mockWindow } = installEmbeddedWindow();

  assert.equal(getStockFixEmbeddedHeaders()["X-StockFix-Capture-Token"], "signed-token");
  mockWindow.location.search = "";

  assert.equal(getStockFixEmbeddedHeaders()["X-StockFix-Capture-Token"], "signed-token");
  assert.equal(
    preserveEmbeddedCaptureToken("/store-detail/list?store=Demo"),
    "/store-detail/list?store=Demo&captureToken=signed-token",
  );
});

test("keeps the signed token through overview, list, SKU, capture, and return navigation", () => {
  const { mockWindow } = installEmbeddedWindow();
  const context = {
    store: "Demo Store",
    rep: "Untrusted URL Rep",
    classification: "oos",
    client: "P&G",
    scope: "nexus",
  };

  const listUrl = buildStoreIssueListUrl(context);
  mockWindow.location.search = "";
  const skuUrl = buildSkuDetailUrl({ ...context, barcode: "12345", returnTo: listUrl });
  const captureUrl = buildActionCaptureUrl({ ...context, barcode: "12345", returnTo: skuUrl });
  const returnUrl = getCaptureReturnUrl(context, listUrl);

  [listUrl, skuUrl, captureUrl, returnUrl].forEach((url) => {
    assert.match(url, /captureToken=signed-token/);
  });
});

test("adds embedded proof to roster requests and removes an untrusted rep query", async () => {
  const { mockWindow, fetchCalls } = installEmbeddedWindow();
  installEmbeddedRosterFetchGuard();

  await mockWindow.fetch("/api/roster/sku-list?store=Demo&rep=Untrusted&client=P%26G");

  assert.equal(fetchCalls.length, 1);
  assert.equal(String(fetchCalls[0].input), "/api/roster/sku-list?store=Demo&client=P%26G");
  const headers = new Headers(fetchCalls[0].init?.headers);
  assert.equal(headers.get("X-StockFix-Embedded"), "perfectstorepro");
  assert.equal(headers.get("X-StockFix-Capture-Token"), "signed-token");
});