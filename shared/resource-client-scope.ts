export interface ClientScopedResource {
  empId: string;
  resourceName: string;
  clientScope: string | null | undefined;
  resourceType: string | null | undefined;
}

export function clientScopeFromResourceType(resourceType: string | null | undefined): string | null {
  const normalized = (resourceType || "").trim().toUpperCase();
  if (!normalized) return null;
  // Fieldmarketer is always P&G-only. This check intentionally precedes
  // SYNDICATED because imported labels can contain both terms.
  if (normalized.includes("FIELDMARKETER")) return "P&G";
  if (normalized.includes("SYNDICATED")) return null;
  if (!normalized.includes("DEDICATED")) return null;

  const candidate = normalized
    .replace(/\bSEMI\b/g, "")
    .replace(/\bDEDICATED\b/g, "")
    .replace(/\bREP\b/g, "")
    .replace(/\bMERCHANDISER\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return candidate || null;
}

function normalized(value: string | null | undefined): string {
  return (value || "").trim().toUpperCase();
}

export function isSyndicatedResourceType(resourceType: string | null | undefined): boolean {
  return !clientScopeFromResourceType(resourceType) && normalized(resourceType).includes("SYNDICATED");
}

export function dedicatedClientScopesAtStore(resources: Pick<ClientScopedResource, "clientScope" | "resourceType">[]): Set<string> {
  return new Set(
    resources.flatMap((resource) => {
      const effectiveScope = clientScopeFromResourceType(resource.resourceType) || normalized(resource.clientScope);
      return effectiveScope && effectiveScope !== "SYNDICATED" ? [effectiveScope] : [];
    }),
  );
}

/**
 * Dedicated resource types are authoritative over imported assignment scope.
 * This prevents a dedicated resource with a stale SYNDICATED assignment row
 * from being used as fallback coverage for another client at the same store.
 */
export function resolveEligibleResourceCoverage<T extends ClientScopedResource>(resources: T[], client: string): T[] {
  const requestedClient = normalized(client);
  const dedicated = resources.filter((resource) => {
    const typeScope = clientScopeFromResourceType(resource.resourceType);
    const effectiveScope = typeScope || normalized(resource.clientScope);
    return effectiveScope === requestedClient;
  });
  if (dedicated.length > 0) return dedicated;

  return resources.filter((resource) => {
    const typeScope = clientScopeFromResourceType(resource.resourceType);
    return !typeScope && normalized(resource.clientScope) === "SYNDICATED";
  });
}