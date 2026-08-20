import assert from "node:assert/strict";
import test from "node:test";
import {
  buildActionCaptureUrl,
  buildSkuDetailUrl,
  getCaptureReturnNavigation,
  getCaptureReturnUrl,
} from "./action-capture-navigation.ts";

function getCaptureParams(path: string): URLSearchParams {
  return new URL(path, "https://stockfix.test").searchParams;
}

function assertCaptureReturnsToSource(capturePath: string, expectedSource: string) {
  const params = getCaptureParams(capturePath);
  const destination = getCaptureReturnUrl(
    {
      store: params.get("store") || "",
      rep: params.get("rep") || "",
      classification: params.get("classification") || "",
      client: params.get("client") || undefined,
      scope: params.get("scope") || undefined,
    },
    params.get("returnTo") || undefined,
  );

  const cancellation = getCaptureReturnNavigation(destination);
  const completion = getCaptureReturnNavigation(destination);

  assert.equal(cancellation.destination, expectedSource);
  assert.equal(completion.destination, expectedSource);
  assert.deepEqual(cancellation.options, { replace: true });
  assert.deepEqual(completion.options, { replace: true });
}

test("a capture launched from Store Overview returns there after cancel or completion", () => {
  const overview = "/store-detail?store=JHB-101&rep=Amina%20Pillay&client=Fresh%20Mart";
  const capture = buildActionCaptureUrl({
    store: "JHB-101",
    rep: "Amina Pillay",
    classification: "overstock",
    barcode: "6001234567890",
    client: "Fresh Mart",
    returnTo: overview,
  });
  const params = getCaptureParams(capture);

  assert.equal(new URL(capture, "https://stockfix.test").pathname, "/store-detail/action-capture");
  assert.equal(params.get("store"), "JHB-101");
  assert.equal(params.get("client"), "Fresh Mart");
  assert.equal(params.get("classification"), "overstock");
  assert.equal(params.get("returnTo"), overview);
  assertCaptureReturnsToSource(capture, overview);
});

test("a capture launched through a scoped issue list preserves its exact list context", () => {
  const issueList = "/store-detail/list?store=JHB-101&rep=Amina%20Pillay&classification=overstock&client=Fresh%20Mart&scope=fix";
  const skuDetail = buildSkuDetailUrl({
    store: "JHB-101",
    rep: "Amina Pillay",
    classification: "overstock",
    barcode: "6001234567890",
    client: "Fresh Mart",
    scope: "fix",
    returnTo: issueList,
  });
  const capture = buildActionCaptureUrl({
    store: "JHB-101",
    rep: "Amina Pillay",
    classification: "overstock",
    barcode: "6001234567890",
    client: "Fresh Mart",
    scope: "fix",
    returnTo: getCaptureParams(skuDetail).get("returnTo") || undefined,
  });
  const params = getCaptureParams(capture);

  assert.equal(params.get("store"), "JHB-101");
  assert.equal(params.get("client"), "Fresh Mart");
  assert.equal(params.get("classification"), "overstock");
  assert.equal(params.get("scope"), "fix");
  assert.equal(params.get("returnTo"), issueList);
  assertCaptureReturnsToSource(capture, issueList);
});

test("an invalid return URL falls back to the matching scoped issue list", () => {
  assert.equal(
    getCaptureReturnUrl(
      {
        store: "JHB-101",
        rep: "Amina Pillay",
        classification: "overstock",
        client: "Fresh Mart",
        scope: "fix",
      },
      "/store-overview/insights",
    ),
    "/store-detail/list?store=JHB-101&rep=Amina+Pillay&classification=overstock&client=Fresh+Mart&scope=fix",
  );
});