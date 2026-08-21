import assert from "node:assert/strict";
import test from "node:test";
import {
  getStockFixEmbeddedCaptureContext,
  getStockFixEmbeddedHeaders,
  installEmbeddedRosterFetchGuard,
  notifyStockFixTaskCaptured,
  preserveEmbeddedCaptureToken,
  PERFECT_STORE_PRO_ORIGIN,
} from "./stockfix-embedded";
import {
  buildActionCaptureUrl,
  buildSkuDetailUrl,
  buildStoreIssueListUrl,
  getCaptureReturnUrl,
} from "./action-capture-navigation";

function installEmbeddedWindow(
  search = "?captureToken=signed-token",
  frameMode: "direct" | "nested" | "top-level" = "direct",
) {
  const values = new Map<string, string>();
  const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const parentMessages: Array<{ message: unknown; targetOrigin: string }> = [];
  const topWindow = {};
  const parentWindow = {
    postMessage: (message: unknown, targetOrigin: string) => {
      parentMessages.push({ message, targetOrigin });
    },
  };
  const mockWindow = {
    parent: parentWindow as object,
    top: topWindow as object,
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
  if (frameMode === "top-level") {
    mockWindow.parent = mockWindow;
    mockWindow.top = mockWindow;
  } else if (frameMode === "nested") {
    mockWindow.top = topWindow;
  } else {
    mockWindow.top = parentWindow;
  }

  Object.assign(globalThis, {
    window: mockWindow,
    document: { referrer: "https://proxy.example.test/embed" },
  });

  return { mockWindow, fetchCalls, parentMessages };
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

test("posts only the exact task callback from a direct StockFix iframe", () => {
  const { parentMessages } = installEmbeddedWindow();
  const uniqueId = "CHECKERS-HYPER-FX-GATEWAY-6001234567890-2026-08-19";

  notifyStockFixTaskCaptured(uniqueId);

  assert.deepEqual(parentMessages, [{
    message: { type: "stockfix-task-captured", uniqueId },
    targetOrigin: PERFECT_STORE_PRO_ORIGIN,
  }]);
});

test("derives initial store context from a token in a genuine iframe", () => {
  const payload = Buffer
    .from(JSON.stringify({ store: "CHECKERS HYPER FX GATEWAY", client: "P&G", repName: "Demo Rep" }))
    .toString("base64url");
  installEmbeddedWindow(`?captureToken=${payload}.signature`);

  assert.deepEqual(getStockFixEmbeddedCaptureContext(), {
    store: "CHECKERS HYPER FX GATEWAY",
    client: "P&G",
    repName: "Demo Rep",
  });
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

test("does not turn a top-level URL token into an embedded request", async () => {
  const { mockWindow, fetchCalls, parentMessages } = installEmbeddedWindow(
    "?captureToken=signed-token",
    "top-level",
  );

  assert.deepEqual(getStockFixEmbeddedHeaders(), {});
  assert.equal(getStockFixEmbeddedCaptureContext(), null);
  assert.equal(
    preserveEmbeddedCaptureToken("/store-detail/list?store=Demo"),
    "/store-detail/list?store=Demo",
  );

  installEmbeddedRosterFetchGuard();
  await mockWindow.fetch("/api/roster/sku-list?store=Demo&rep=Direct%20Rep");

  assert.equal(fetchCalls.length, 1);
  assert.equal(String(fetchCalls[0].input), "/api/roster/sku-list?store=Demo&rep=Direct%20Rep");
  assert.equal(new Headers(fetchCalls[0].init?.headers).get("X-StockFix-Embedded"), null);

  notifyStockFixTaskCaptured("top-level-task");
  assert.deepEqual(parentMessages, []);
});

test("does not post a callback from a nested StockFix window", () => {
  const { parentMessages } = installEmbeddedWindow("?captureToken=signed-token", "nested");

  notifyStockFixTaskCaptured("nested-task");

  assert.deepEqual(parentMessages, []);
});
