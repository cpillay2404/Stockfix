import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { User, ClipboardList, Users, Building2, AlertTriangle, ChevronRight, Wrench } from "lucide-react";
import { useAccess } from "@/context/AccessContext";
import meridianGroupLogo from "@/assets/meridian-group-logo.png";
import { COLORS, DOT_MATRIX_BG, HEX_OUTLINE_PATTERN_BG } from "@/lib/design-tokens";

// MAINTENANCE BANNER - Set to false to hide
const SHOW_MAINTENANCE_BANNER = false;

// StockFix Midnight Navy design system - see @/lib/design-tokens for the
// canonical source. Do not hardcode colors locally in this file.
const NAVY_DEEP = COLORS.bgPrimary;
const NAVY_ELEVATED = COLORS.navyElevated;
const NAVY_CARD = COLORS.navyElevated;
const ORANGE = COLORS.orange;
const TEXT_SECONDARY = COLORS.textMuted;
const TEXT_MUTED = COLORS.textMuted;
const LINE_BLUE = COLORS.lineBlue;

const DOT_MATRIX = DOT_MATRIX_BG;
const HEX_OUTLINE_PATTERN = HEX_OUTLINE_PATTERN_BG;

interface RoleCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  accent?: boolean;
  onClick: () => void;
  testId: string;
}

function RoleCard({ icon, title, description, accent, onClick, testId }: RoleCardProps) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      style={{
        width: "100%",
        textAlign: "left",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 14px",
        borderRadius: 12,
        border: `1px solid ${accent ? "rgba(255,121,0,0.4)" : "rgba(23,68,111,0.6)"}`,
        background: accent
          ? "linear-gradient(145deg, rgba(255,121,0,0.14), rgba(14,42,69,0.6))"
          : NAVY_CARD,
        cursor: "pointer",
        transform: pressed ? "scale(0.985)" : "scale(1)",
        transition: "transform 120ms ease-out, border-color 150ms ease-out",
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
          background: accent ? "rgba(255,121,0,0.16)" : "rgba(23,68,111,0.35)",
          color: accent ? ORANGE : TEXT_SECONDARY,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ color: "#F7F9FC", fontSize: 13.5, fontWeight: 600 }}>{title}</div>
        <div style={{ color: TEXT_MUTED, fontSize: 11.5, marginTop: 1 }}>{description}</div>
      </div>
      <ChevronRight style={{ width: 16, height: 16, color: TEXT_MUTED, flexShrink: 0 }} />
    </button>
  );
}

export default function ChooseAccess() {
  const [, setLocation] = useLocation();
  const { accessMode, clientLocked, selectedClient, selectedStore, setAccessMode, setSelectedRep, setSelectedClient, setClientLocked } = useAccess();

  useEffect(() => {
    if (accessMode === "client" && clientLocked && selectedClient && selectedStore) {
      setLocation(`/store-overview?store=${encodeURIComponent(selectedStore)}&client=${encodeURIComponent(selectedClient)}`);
    } else if (accessMode === "client" && clientLocked) {
      setLocation("/select-client");
    }
  }, [accessMode, clientLocked, selectedClient, selectedStore, setLocation]);

  const handleRepClick = (roleLabel: "Rep" | "Merchandiser") => {
    setAccessMode("rep");
    setSelectedClient(null);
    setClientLocked(false);
    setLocation(`/select-rep?role=${roleLabel}`);
  };

  const handleManagerClick = () => {
    setAccessMode("manager");
    setSelectedClient(null);
    setClientLocked(false);
    setLocation("/select-manager");
  };

  const handleClientClick = () => {
    setAccessMode("client");
    setSelectedRep(null);
    setClientLocked(true);
    setLocation("/select-client");
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
          backgroundImage: `url("${DOT_MATRIX}")`,
          backgroundSize: "18px 18px",
          maskImage: "radial-gradient(circle at 0% 0%, black 0%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(circle at 0% 0%, black 0%, transparent 75%)",
        }}
      />
      <div
        className="absolute top-0 right-0 w-1/2 h-1/2 pointer-events-none"
        style={{
          backgroundImage: `url("${HEX_OUTLINE_PATTERN}")`,
          backgroundSize: "40px 46px",
          maskImage: "radial-gradient(circle at 100% 0%, black 0%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(circle at 100% 0%, black 0%, transparent 75%)",
        }}
      />

      {SHOW_MAINTENANCE_BANNER && (
        <div
          style={{
            width: "100%",
            backgroundColor: ORANGE,
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            borderRadius: 12,
            marginBottom: 16,
          }}
          data-testid="banner-maintenance"
        >
          <AlertTriangle style={{ width: "20px", height: "20px", color: "#FFFFFF", flexShrink: 0 }} />
          <span style={{ fontSize: "14px", fontWeight: 600, color: "#FFFFFF", textAlign: "center" }}>
            Under maintenance - new tasks loading. Please be patient.
          </span>
        </div>
      )}

      <img
        src={meridianGroupLogo}
        alt="Meridian Group"
        style={{ height: "44px", opacity: 0.95, position: "relative" }}
        data-testid="img-meridian-group-logo"
      />

      <div style={{ textAlign: "center", marginTop: 20, marginBottom: 8, position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
          <Wrench style={{ width: 30, height: 30, color: ORANGE }} />
          <h1
            style={{
              fontSize: 34,
              fontWeight: 800,
              letterSpacing: "-1px",
              lineHeight: 1,
            }}
            data-testid="text-title"
          >
            <span style={{ color: "#F7F9FC" }}>Stock</span>
            <span style={{ color: ORANGE }}>Fix</span>
          </h1>
        </div>
        <p style={{ fontSize: 14, color: TEXT_SECONDARY, marginTop: 8 }} data-testid="text-subtitle">
          Field Inventory Management
        </p>
      </div>

      <div style={{ textAlign: "center", marginTop: 32, marginBottom: 32, position: "relative" }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#F7F9FC" }}>Choose Access</h2>
        <div
          style={{
            width: 48,
            height: 2,
            margin: "10px auto 0",
            background: `linear-gradient(90deg, transparent, ${ORANGE}, transparent)`,
          }}
        />
      </div>

      <div style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 10, position: "relative" }}>
        <RoleCard
          icon={<User style={{ width: 18, height: 18 }} />}
          title="I'm a Merchandiser"
          description="Capture tasks for your assigned stores"
          onClick={() => handleRepClick("Merchandiser")}
          testId="button-im-a-merchandiser"
        />
        <RoleCard
          icon={<ClipboardList style={{ width: 18, height: 18 }} />}
          title="I'm a Rep"
          description="Capture tasks for your assigned stores"
          onClick={() => handleRepClick("Rep")}
          testId="button-im-a-rep"
        />
        <RoleCard
          icon={<Users style={{ width: 18, height: 18 }} />}
          title="I'm a Manager"
          description="Review your team's progress"
          onClick={handleManagerClick}
          testId="button-im-a-manager"
        />
        <RoleCard
          icon={<Building2 style={{ width: 18, height: 18 }} />}
          title="I'm a Client"
          description="View store performance for your brand"
          onClick={handleClientClick}
          testId="button-im-a-client"
        />
      </div>

      <div style={{ flex: 1 }} />
    </div>
  );
}
