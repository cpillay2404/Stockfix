const ACTIVE_VISIT_KEY = "stockfix_active_visit";

interface ActiveVisit {
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

export function markVisitHasCaptures(store: string, rep: string, client: string): void {
  try {
    sessionStorage.setItem(ACTIVE_VISIT_KEY, JSON.stringify({
      store: normalize(store),
      rep: normalize(rep),
      client: normalize(client === "ALL" ? "" : client),
      hasCaptures: true,
    }));
  } catch {
    // Session storage is a convenience guard; the saved capture is the source of truth.
  }
}

export function hasUnclosedVisit(store: string, rep: string, client: string): boolean {
  const activeVisit = getActiveVisit();
  if (!activeVisit?.hasCaptures) return false;

  return activeVisit.store === normalize(store)
    && activeVisit.rep === normalize(rep)
    && activeVisit.client === normalize(client === "ALL" ? "" : client);
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