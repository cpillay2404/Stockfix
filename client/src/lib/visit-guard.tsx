const ACTIVE_VISIT_KEY = "stockfix_active_visit";

export interface ActiveVisit {
  store: string;
  rep: string;
  client: string;
  hasCaptures: boolean;
}

function normalize(value: string | null | undefined): string {
  return (value || "").trim().toUpperCase();
}

function getActiveVisit(): ActiveVisit | null {
  try {
    const raw = sessionStorage.getItem(ACTIVE_VISIT_KEY);
    return raw ? JSON.parse(raw) as ActiveVisit : null;
  } catch {
    return null;
  }
}

export function getUnclosedVisit(): ActiveVisit | null {
  const activeVisit = getActiveVisit();
  return activeVisit?.hasCaptures ? activeVisit : null;
}

export function getEndVisitPath(fallback: Pick<ActiveVisit, "store" | "rep" | "client">): string {
  const visit = getUnclosedVisit() || fallback;
  const client = visit.client === "ALL" ? "" : visit.client.trim();
  const clientQS = client ? `&client=${encodeURIComponent(client)}` : "";
  return `/store-detail/exit-visit?store=${encodeURIComponent(visit.store)}&rep=${encodeURIComponent(visit.rep)}${clientQS}`;
}

export function markVisitHasCaptures(store: string, rep: string, client: string): void {
  try {
    sessionStorage.setItem(ACTIVE_VISIT_KEY, JSON.stringify({
      // Keep the source values for the summary request, whose rep/client
      // filters are exact. Normalization is applied only when comparing
      // an active visit to the current screen.
      store: store.trim(),
      rep: rep.trim(),
      client: client === "ALL" ? "" : client.trim(),
      hasCaptures: true,
    }));
  } catch {
    // Session storage is a convenience guard; the saved capture is the source of truth.
  }
}

export function hasUnclosedVisit(): boolean {
  return Boolean(getUnclosedVisit());
}

export function isActiveVisitContext(store: string | null, rep: string | null): boolean {
  const activeVisit = getUnclosedVisit();
  if (!activeVisit) return false;
  return normalize(activeVisit.store) === normalize(store)
    && normalize(activeVisit.rep) === normalize(rep);
}

export function clearActiveVisit(): void {
  try {
    sessionStorage.removeItem(ACTIVE_VISIT_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }
}

export function LeaveVisitPrompt({
  onStay,
  onEndVisit,
}: {
  onStay: () => void;
  onEndVisit: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="leave-visit-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        padding: 16,
        background: "rgba(3, 7, 18, 0.72)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 430,
          padding: 22,
          borderRadius: 18,
          border: "1px solid rgba(148, 163, 184, 0.28)",
          background: "#111827",
          color: "#F7F9FC",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.45)",
        }}
      >
        <h2 id="leave-visit-title" style={{ margin: 0, fontSize: 19, fontWeight: 750 }}>
          End this visit first?
        </h2>
        <p style={{ margin: "10px 0 20px", color: "#CBD5E1", fontSize: 14, lineHeight: 1.5 }}>
          Your captured fixes are saved, but the visit summary email has not been sent yet. End the visit before selecting another store.
        </p>
        <div style={{ display: "grid", gap: 10 }}>
          <button
            type="button"
            onClick={onEndVisit}
            style={{
              width: "100%",
              padding: "13px 16px",
              border: 0,
              borderRadius: 10,
              background: "#F58220",
              color: "#FFFFFF",
              fontWeight: 750,
              fontSize: 15,
            }}
          >
            End Visit &amp; Send Summary
          </button>
          <button
            type="button"
            onClick={onStay}
            style={{
              width: "100%",
              padding: "12px 16px",
              border: "1px solid rgba(148, 163, 184, 0.35)",
              borderRadius: 10,
              background: "transparent",
              color: "#E2E8F0",
              fontWeight: 650,
              fontSize: 14,
            }}
          >
            Keep Working in This Store
          </button>
        </div>
      </div>
    </div>
  );
}