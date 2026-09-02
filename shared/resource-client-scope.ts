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

// Real gap found 2026-08-29 (Carin: "P&G Syndicated rep must resolve to
// Syndicated rep in all reporting") - imported resourceType labels carry
// whichever client's data the row happened to come from (e.g. "P&G
// SYNDICATED REP" vs a plain "SYNDICATED REP" for the exact same real role
// at a different store), even though isSyndicatedResourceType/
// clientScopeFromResourceType already correctly treat both as genuinely
// syndicated (not dedicated to P&G) for coverage purposes. Reporting and
// display should show ONE consistent label for that role regardless of
// which client's import happened to carry the "P&G" prefix - dedicated
// and Fieldmarketer types keep their own specific label unchanged.
export function displayResourceType(resourceType: string | null | undefined): string | null {
  if (!resourceType) return resourceType ?? null;
  if (isSyndicatedResourceType(resourceType)) {
    return isMerchandiserType(resourceType) ? "SYNDICATED MERCHANDISER" : "SYNDICATED REP";
  }
  // Real gap found 2026-09-02 (Carin: "uppercase... resource type because
  // it duplicates now on the stock fix adoption") - a dedicated type isn't
  // just written "P&G SYNDICATED REP" vs "SYNDICATED REP" (the case this
  // function already collapsed above) - the SAME dedicated label can also
  // carry different casing across imports (e.g. "P&G Dedicated Rep" vs
  // "P&G DEDICATED REP"), which fragmented into two separate reporting
  // rows the same way. Normalizing every non-syndicated label to uppercase
  // here keeps it one consistent row regardless of casing, matching the
  // syndicated case's already-fixed, single-label behavior.
  return resourceType.trim().toUpperCase();
}

export function dedicatedClientScopesAtStore(resources: Pick<ClientScopedResource, "clientScope" | "resourceType">[]): Set<string> {
  return new Set(
    resources.flatMap((resource) => {
      const effectiveScope = clientScopeFromResourceType(resource.resourceType) || normalized(resource.clientScope);
      return effectiveScope && effectiveScope !== "SYNDICATED" ? [effectiveScope] : [];
    }),
  );
}

function isMerchandiserType(resourceType: string | null | undefined): boolean {
  return normalized(resourceType).includes("MERCHANDISER");
}

// A rep/FM and a merchandiser are different roles that cover a store
// independently - a client being dedicated on one role must never block
// coverage on the other (Carin, 2026-08-29, confirmed against Dischem
// Gateway: Nereen is P&G's dedicated Fieldmarketer there, but there is no
// P&G-dedicated MERCHANDISER at that store, so Wendy - the store's genuine
// Syndicated Merchandiser - must still cover P&G's merchandising work.
// Resolving one combined pool used to let Nereen's dedication block Wendy
// from ever getting P&G tasks, even though nobody was covering that role).
function resolveForPool<T extends ClientScopedResource>(pool: T[], requestedClient: string): T[] {
  const dedicated = pool.filter((resource) => {
    const typeScope = clientScopeFromResourceType(resource.resourceType);
    const effectiveScope = typeScope || normalized(resource.clientScope);
    return effectiveScope === requestedClient;
  });
  if (dedicated.length > 0) return dedicated;

  return pool.filter((resource) => {
    const typeScope = clientScopeFromResourceType(resource.resourceType);
    return !typeScope && normalized(resource.clientScope) === "SYNDICATED";
  });
}

/**
 * Dedicated resource types are authoritative over imported assignment scope.
 * This prevents a dedicated resource with a stale SYNDICATED assignment row
 * from being used as fallback coverage for another client at the same store.
 *
 * Resolved separately per role (merchandiser vs. everyone else - reps,
 * Fieldmarketers, and any other/blank type) so a client dedicated on one
 * role never blocks the other role's own dedicated-or-syndicated coverage.
 */
export function resolveEligibleResourceCoverage<T extends ClientScopedResource>(resources: T[], client: string): T[] {
  const requestedClient = normalized(client);
  const merchandisers = resources.filter((r) => isMerchandiserType(r.resourceType));
  const others = resources.filter((r) => !isMerchandiserType(r.resourceType));
  return [...resolveForPool(others, requestedClient), ...resolveForPool(merchandisers, requestedClient)];
}