import assert from "node:assert/strict";
import test from "node:test";
import {
  getEmbeddedTaskFallbackRequest,
  SYNDICATED_CLIENT_UNAVAILABLE_ERROR,
} from "./embedded-task-fallback";

test("uses token-scoped P&G task fallback when a signed store has tasks but no P&G live overview", () => {
  const request = getEmbeddedTaskFallbackRequest({
    store: "CHECKERS HYPER FX GATEWAY",
    isEmbedded: true,
    liveOverviewStatus: 404,
  });

  assert.equal(
    request?.url,
    "/api/nexus-tasks/pending?store=CHECKERS+HYPER+FX+GATEWAY",
  );
});

test("allows the token-scoped fallback when the page client state is all clients", () => {
  const request = getEmbeddedTaskFallbackRequest({
    store: "CHECKERS HYPER FX GATEWAY",
    isEmbedded: true,
    liveOverviewStatus: 404,
  });
  assert.match(
    request?.url || "",
    /^\/api\/nexus-tasks\/pending\?store=/,
  );
});

test("uses the token-scoped fallback for the known syndicated client-unavailable response", () => {
  const request = getEmbeddedTaskFallbackRequest({
    store: "CHECKERS HYPER FX GATEWAY",
    isEmbedded: true,
    liveOverviewStatus: 403,
    liveOverviewError: SYNDICATED_CLIENT_UNAVAILABLE_ERROR,
  });
  assert.equal(
    request?.url,
    "/api/nexus-tasks/pending?store=CHECKERS+HYPER+FX+GATEWAY",
  );
});

test("does not mask unrelated authentication or server failures", () => {
  assert.equal(
    getEmbeddedTaskFallbackRequest({
      store: "CHECKERS HYPER FX GATEWAY",
      isEmbedded: true,
      liveOverviewStatus: 403,
      liveOverviewError: "Capture token is not scoped to this client",
    }),
    null,
  );
  assert.equal(
    getEmbeddedTaskFallbackRequest({
      store: "CHECKERS HYPER FX GATEWAY",
      isEmbedded: false,
      liveOverviewStatus: 404,
    }),
    null,
  );
});