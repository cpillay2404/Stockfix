// StockFix Midnight Navy - the canonical design system, locked in 2026-08-08.
// Every screen must pull colors from here, not hardcode its own copy - the
// choose-access/select-rep-store screens originally drifted to #020D1D
// instead of the approved #000C21, which is exactly the kind of divergence
// this file exists to prevent.
//
// Do NOT substitute brighter corporate blues (#004A80, #003F73, generic
// Bootstrap navy, etc.) anywhere in the app.

export const COLORS = {
  bgPrimary: "#000C21", // StockFix Midnight Navy - canonical primary background
  bgDeep: "#00091C", // deep background / edges
  navyElevated: "#06172B", // elevated surfaces (cards, inputs)
  lineBlue: "#17446F", // linework / borders
  textMuted: "#91A7C9", // muted blue text
  orange: "#FF7900", // StockFix orange - the only accent color
  white: "#F7F9FC",
  nexusText: "#7992BC",
} as const;

export const DOT_MATRIX_BG = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"><circle cx="3" cy="3" r="1.5" fill="${COLORS.lineBlue}" opacity="0.2"/></svg>`
)}`;

export const HEX_OUTLINE_PATTERN_BG = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="46" viewBox="0 0 40 46"><polygon points="20,2 36,11 36,29 20,38 4,29 4,11" fill="none" stroke="${COLORS.lineBlue}" stroke-width="1" opacity="0.18"/></svg>`
)}`;
