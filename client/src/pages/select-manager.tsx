import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Wrench, Users, ChevronRight } from "lucide-react";
import { useAccess } from "@/context/AccessContext";
import meridianGroupLogo from "@/assets/meridian-group-logo.png";
import { COLORS, DOT_MATRIX_BG, HEX_OUTLINE_PATTERN_BG } from "@/lib/design-tokens";

// Matches the choose-access.tsx dark navy/orange theme (Carin, 2026-08-17:
// "we need to work on the manager login" - this page was still on the old
// white-card/blue-gradient layout while choose-access had already moved to
// the StockFix Midnight Navy system). select-rep/select-client are the same
// old style too but out of scope for this pass per Carin's call.
const NAVY_ELEVATED = COLORS.navyElevated;
const NAVY_DEEP = COLORS.bgPrimary;
const NAVY_CARD = COLORS.navyElevated;
const ORANGE = COLORS.orange;
const TEXT_MUTED = COLORS.textMuted;

export default function SelectManager() {
  const [, setLocation] = useLocation();
  const { accessMode, setAccessMode, setSelectedManager } = useAccess();

  useEffect(() => {
    if (accessMode !== "manager") {
      setAccessMode("manager");
    }
  }, [accessMode, setAccessMode]);

  const { data: managersData, isLoading } = useQuery({
    queryKey: ["managers"],
    queryFn: async () => {
      const res = await fetch("/api/managers");
      if (!res.ok) throw new Error("Failed to fetch managers");
      return res.json();
    },
  });

  const managers: string[] = managersData?.managers || [];

  const handleBack = () => {
    setLocation("/");
  };

  const handleManagerSelect = (manager: string) => {
    setSelectedManager(manager);
    setLocation(`/manager-progress?manager=${encodeURIComponent(manager)}`);
  };

  return (
    <div
      className="relative min-h-screen flex flex-col items-center overflow-hidden"
      style={{
        background: `radial-gradient(circle at 50% 30%, ${NAVY_ELEVATED} 0%, ${NAVY_DEEP} 60%)`,
        paddingTop: "max(2.5rem, env(safe-area-inset-top, 0px) + 1.5rem)",
        paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 0px) + 1rem)",
        paddingLeft: "max(24px, env(safe-area-inset-left, 0px))",
        paddingRight: "max(24px, env(safe-area-inset-right, 0px))",
      }}
    >
      <div
        className="absolute top-0 left-0 w-1/2 h-1/2 pointer-events-none"
        style={{
          backgroundImage: `url("${DOT_MATRIX_BG}")`,
          backgroundSize: "18px 18px",
          maskImage: "radial-gradient(circle at 0% 0%, black 0%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(circle at 0% 0%, black 0%, transparent 75%)",
        }}
      />
      <div
        className="absolute top-0 right-0 w-1/2 h-1/2 pointer-events-none"
        style={{
          backgroundImage: `url("${HEX_OUTLINE_PATTERN_BG}")`,
          backgroundSize: "40px 46px",
          maskImage: "radial-gradient(circle at 100% 0%, black 0%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(circle at 100% 0%, black 0%, transparent 75%)",
        }}
      />

      <div style={{ width: "100%", maxWidth: 420, position: "relative" }}>
        <button
          onClick={handleBack}
          data-testid="button-back"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: TEXT_MUTED,
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            marginBottom: 20,
            fontSize: 14,
          }}
        >
          <ArrowLeft style={{ width: 18, height: 18 }} />
          Back
        </button>

        <img
          src={meridianGroupLogo}
          alt="Meridian Group"
          style={{ height: 40, opacity: 0.95, display: "block", margin: "0 auto 20px" }}
        />

        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <Wrench style={{ width: 26, height: 26, color: ORANGE }} />
            <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.5px", lineHeight: 1 }}>
              <span style={{ color: "#F7F9FC" }}>Stock</span>
              <span style={{ color: ORANGE }}>Fix</span>
            </h1>
          </div>
          <p style={{ fontSize: 13.5, color: TEXT_MUTED, marginTop: 6 }}>Manager Login</p>
        </div>

        <label style={{ fontSize: 12, fontWeight: 700, color: TEXT_MUTED, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 10, display: "block" }}>
          Select Your Name
        </label>

        {isLoading && (
          <p style={{ fontSize: 13, color: TEXT_MUTED, textAlign: "center", padding: 24 }}>
            Loading managers...
          </p>
        )}

        {!isLoading && managers.length === 0 && (
          <p style={{ fontSize: 13, color: TEXT_MUTED, textAlign: "center", padding: 24 }}>
            No managers found. Please ensure LINE MANAGER column is in your imported data.
          </p>
        )}

        {!isLoading && managers.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "60vh", overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
            {managers.map((manager) => (
              <button
                key={manager}
                onClick={() => handleManagerSelect(manager)}
                data-testid={`manager-${manager}`}
                style={{
                  width: "100%",
                  textAlign: "left",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "14px 16px",
                  borderRadius: 12,
                  border: "1px solid rgba(23,68,111,0.6)",
                  background: NAVY_CARD,
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    flexShrink: 0,
                    borderRadius: 9,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(23,68,111,0.35)",
                    color: TEXT_MUTED,
                  }}
                >
                  <Users style={{ width: 18, height: 18 }} />
                </div>
                <div style={{ flex: 1, color: "#F7F9FC", fontSize: 14.5, fontWeight: 600 }}>{manager.toUpperCase()}</div>
                <ChevronRight style={{ width: 18, height: 18, color: TEXT_MUTED, flexShrink: 0 }} />
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ flex: 1 }} />
    </div>
  );
}
