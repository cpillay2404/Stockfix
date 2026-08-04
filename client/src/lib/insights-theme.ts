import type { CSSProperties } from "react";

// Shared visual language for the 4 Nexus "Insights" screens - matches the
// approved StockFix v2 design doc exactly (dark navy panels, orange accent),
// deliberately distinct from store-overview.tsx's existing corporate
// dark-blue/orange IZON theme since these are a self-contained new section
// entered via one link, not a re-skin of the rest of the app.
export const INSIGHTS_COLORS = {
  bg: "#071A2D",
  panel: "#0D2137",
  panelBorder: "#1B3A55",
  panelLine: "#16324A",
  accent: "#F58220",
  accentSoft: "rgba(245,130,32,.14)",
  text: "#D9E2EC",
  textMuted: "#9FB3C8",
  textDim: "#8ea3b8",
  textFaint: "#4A6B8A",
  red: "#CF5B52",
  amber: "#E8A838",
  green: "#35A974",
  slate: "#2c5170",
};

export const insightsPageStyle: CSSProperties = {
  background: INSIGHTS_COLORS.bg,
  minHeight: "100vh",
  fontFamily: "'Poppins', system-ui, sans-serif",
  color: INSIGHTS_COLORS.text,
  paddingBottom: 84, // room for BottomNav
};

export const panelStyle: CSSProperties = {
  background: INSIGHTS_COLORS.panel,
  border: `1px solid ${INSIGHTS_COLORS.panelBorder}`,
  borderRadius: 7,
};

export function buildInsightsQuery(rep: string, store: string, client: string, banner?: string) {
  const p = new URLSearchParams();
  if (rep) p.set("rep", rep);
  if (store) p.set("store", store);
  if (client) p.set("client", client);
  if (banner) p.set("banner", banner);
  return p;
}
