import assert from "node:assert/strict";
import test from "node:test";
import {
  clientScopeFromResourceType,
  dedicatedClientScopesAtStore,
  isSyndicatedResourceType,
  resolveEligibleResourceCoverage,
} from "@shared/resource-client-scope";

test("a dedicated resource with a stale SYNDICATED assignment never covers another client", () => {
  const resources = [
    {
      empId: "DEDICATED-1",
      resourceName: "Dedicated SodaStream Rep",
      clientScope: "SYNDICATED",
      resourceType: "DEDICATED SODASTREAM REP",
    },
    {
      empId: "SYNDICATED-1",
      resourceName: "Syndicated Rep",
      clientScope: "SYNDICATED",
      resourceType: "SYNDICATED REP",
    },
  ];

  assert.deepEqual(
    resolveEligibleResourceCoverage(resources, "DURACELL").map((resource) => resource.empId),
    ["SYNDICATED-1"],
  );
  assert.deepEqual(
    resolveEligibleResourceCoverage(resources, "SODASTREAM").map((resource) => resource.empId),
    ["DEDICATED-1"],
  );
});

test("resource type overrides a conflicting assignment scope for client visibility", () => {
  const reserved = dedicatedClientScopesAtStore([
    {
      clientScope: "DURACELL",
      resourceType: "DEDICATED SODASTREAM REP",
    },
  ]);

  assert.deepEqual([...reserved], ["SODASTREAM"]);
  assert.equal(reserved.has("DURACELL"), false);
});

test("a fieldmarketer remains P&G-only even when the imported label says syndicated", () => {
  assert.equal(clientScopeFromResourceType("SYNDICATED FIELDMARKETER"), "P&G");
  assert.equal(isSyndicatedResourceType("SYNDICATED FIELDMARKETER"), false);
  assert.deepEqual(
    resolveEligibleResourceCoverage([
      {
        empId: "FIELD-1",
        resourceName: "Fieldmarketer",
        clientScope: "SYNDICATED",
        resourceType: "SYNDICATED FIELDMARKETER",
      },
    ], "DURACELL"),
    [],
  );
});