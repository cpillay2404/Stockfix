// Single source of truth for the "StockFix" wordmark. Every screen in the
// app should render the logo through this component instead of hand-rolling
// its own <span> styling - confirmed 2026-08-11 that at least 20 files had
// drifted into inconsistent treatments (some split "Stock"/"Fix" colors
// correctly, some just rendered plain "StockFix" with no accent at all).
interface BrandLogoProps {
  size?: number;
  className?: string;
}

export function BrandLogo({ size = 20, className }: BrandLogoProps) {
  return (
    <span
      className={className}
      style={{ fontSize: size, fontWeight: 800, letterSpacing: "-0.6px", whiteSpace: "nowrap" }}
    >
      <span style={{ color: "#F7F9FC" }}>Stock</span>
      <span style={{ color: "#FF7900" }}>Fix</span>
    </span>
  );
}
