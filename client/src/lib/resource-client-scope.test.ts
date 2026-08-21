import assert from "node:assert/strict";
import test from "node:test";
import { resolveEligibleResourceCoverage } from "@shared/resource-client-scope";

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