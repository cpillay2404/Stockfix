import { useState, useEffect, useMemo, type CSSProperties } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Search, ChevronRight, Check, Wrench } from "lucide-react";
import { useAccess } from "@/context/AccessContext";
import meridianGroupLogo from "@/assets/meridian-group-logo.png";
import { COLORS, DOT_MATRIX_BG, HEX_OUTLINE_PATTERN_BG } from "@/lib/design-tokens";

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

const RECENT_KEY_PREFIX = "stockfix_recent_";

function loadRecent(kind: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY_PREFIX + kind) || "[]");
  } catch {
    return [];
  }
}

function pushRecent(kind: string, value: string) {
  const existing = loadRecent(kind).filter((v) => v !== value);
  const updated = [value, ...existing].slice(0, 3);
  localStorage.setItem(RECENT_KEY_PREFIX + kind, JSON.stringify(updated));
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase();
}

function BackgroundPatterns() {
  return (
    <>
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
    </>
  );
}

const DIVIDER = "#12365A";
const CARD_DISABLED_BG = "#0A2036";

interface NameSelectorProps {
  title: string;
  entityLabel: string;
  options: string[];
  currentValue: string;
  onSelect: (value: string) => void;
  onClose: () => void;
  recentKind: string;
  testId: string;
}

function NameSelectorModal({ title, entityLabel, options, currentValue, onSelect, onClose, recentKind, testId }: NameSelectorProps) {
  const [search, setSearch] = useState("");
  const recent = useMemo(() => loadRecent(recentKind).filter((r) => options.includes(r)), [recentKind, options]);

  const filtered = useMemo(() => {
    if (!search) return options.slice(0, 200);
    const s = search.toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(s)).slice(0, 200);
  }, [options, search]);

  const handlePick = (value: string) => {
    pushRecent(recentKind, value);
    onSelect(value);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] overflow-hidden" style={{ background: NAVY_DEEP }} data-testid={testId}>
      <BackgroundPatterns />
      <div
        className="relative h-full flex flex-col"
        style={{
          paddingTop: "max(1.5rem, env(safe-area-inset-top, 0px) + 1rem)",
          paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px))",
          paddingLeft: "max(20px, env(safe-area-inset-left, 0px))",
          paddingRight: "max(20px, env(safe-area-inset-right, 0px))",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <button
            onClick={onClose}
            data-testid="button-back-selector"
            style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", padding: 4, color: ORANGE }}
          >
            <ArrowLeft style={{ width: 22, height: 22 }} />
            <span style={{ fontSize: 15, fontWeight: 600 }}>Back</span>
          </button>
          <h1 style={{ fontSize: 17, fontWeight: 700, color: "#F7F9FC", flex: 1, textAlign: "center", marginRight: 40 }}>{title}</h1>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            height: 54,
            border: `1px solid ${LINE_BLUE}`,
            borderRadius: 14,
            background: NAVY_CARD,
            padding: "0 16px",
            marginBottom: 22,
          }}
        >
          <Search style={{ width: 18, height: 18, color: TEXT_MUTED, flexShrink: 0 }} />
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${entityLabel.toLowerCase()} by name...`}
            data-testid="input-search-name"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "#F7F9FC",
              fontSize: 15,
            }}
          />
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {!search && recent.length > 0 && (
            <>
              <div style={sectionLabelStyle}>Recent Users</div>
              {recent.map((name) => (
                <NameRow key={`recent-${name}`} name={name} isSelected={name === currentValue} onClick={() => handlePick(name)} />
              ))}
              <div style={{ height: 1, background: DIVIDER, margin: "12px 0 16px" }} />
            </>
          )}

          <div style={sectionLabelStyle}>All {entityLabel}</div>
          {filtered.length === 0 && (
            <p style={{ color: TEXT_MUTED, fontSize: 14, padding: "12px 0" }}>No results found.</p>
          )}
          {filtered.map((name) => (
            <NameRow key={name} name={name} isSelected={name === currentValue} onClick={() => handlePick(name)} />
          ))}
        </div>
      </div>
    </div>
  );
}

const sectionLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: TEXT_MUTED,
  textTransform: "uppercase",
  letterSpacing: "1px",
  marginBottom: 8,
};

function NameRow({ name, onClick, isSelected }: { name: string; onClick: () => void; isSelected?: boolean }) {
  return (
    <button
      onClick={onClick}
      data-testid={`row-${name}`}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 14,
        height: 56,
        padding: "0 10px",
        background: isSelected ? "rgba(255,121,0,0.06)" : "none",
        border: isSelected ? `1px solid ${ORANGE}` : "none",
        borderBottom: isSelected ? `1px solid ${ORANGE}` : `1px solid ${DIVIDER}`,
        borderRadius: isSelected ? 12 : 0,
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: "50%",
          background: CARD_DISABLED_BG,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#DCE7F7",
          fontSize: 13,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {initials(name)}
      </div>
      <span style={{ flex: 1, color: isSelected ? ORANGE : "#F7F9FC", fontSize: 15, fontWeight: 500 }}>{name.toUpperCase()}</span>
      {isSelected ? (
        <Check style={{ width: 18, height: 18, color: ORANGE, flexShrink: 0 }} />
      ) : (
        <ChevronRight style={{ width: 18, height: 18, color: TEXT_MUTED, flexShrink: 0 }} />
      )}
    </button>
  );
}

function PickerField({ value, placeholder, onOpen, disabled }: { value: string; placeholder: string; onOpen: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onOpen}
      disabled={disabled}
      data-testid={`field-${placeholder.replace(/\s+/g, "-").toLowerCase()}`}
      style={{
        width: "100%",
        height: 58,
        display: "flex",
        alignItems: "center",
        gap: 12,
        border: `1px solid ${LINE_BLUE}`,
        borderRadius: 14,
        padding: "0 16px",
        background: NAVY_CARD,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {value ? (
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: CARD_DISABLED_BG,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#DCE7F7",
            fontSize: 11,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {initials(value)}
        </div>
      ) : (
        <Search style={{ width: 18, height: 18, color: TEXT_MUTED, flexShrink: 0 }} />
      )}
      <span style={{ flex: 1, textAlign: "left", color: value ? "#F7F9FC" : TEXT_MUTED, fontSize: 15 }}>
        {value ? value.toUpperCase() : placeholder}
      </span>
      {value ? (
        <Check style={{ width: 18, height: 18, color: ORANGE, flexShrink: 0 }} />
      ) : (
        <ChevronRight style={{ width: 18, height: 18, color: TEXT_MUTED, flexShrink: 0 }} />
      )}
    </button>
  );
}

export default function SelectRepStore() {
  const [, setLocation] = useLocation();
  const { accessMode, setAccessMode, setSelectedRep } = useAccess();
  const [storeValue, setStoreValue] = useState("");
  const [repValue, setRepValue] = useState("");
  const [showStoreSelector, setShowStoreSelector] = useState(false);
  const [showRepSelector, setShowRepSelector] = useState(false);
  const [repOptionsForStore, setRepOptionsForStore] = useState<string[]>([]);

  const roleParam = new URLSearchParams(window.location.search).get("role");
  const roleLabel = roleParam === "Merchandiser" ? "Merchandiser" : "Rep";

  useEffect(() => {
    if (accessMode !== "rep") setAccessMode("rep");
  }, [accessMode, setAccessMode]);

  const { data: storeData } = useQuery({
    queryKey: ["store-search"],
    queryFn: async () => {
      const res = await fetch(`/api/roster/store-search`);
      if (!res.ok) throw new Error("Failed to fetch stores");
      return res.json();
    },
  });

  const stores: string[] = (storeData?.stores || []).map((s: any) => s.name);

  // Store-first flow (per direct request 2026-08-12): picking a store looks
  // up who's real-world assigned to it via store_assignments, instead of
  // picking a person first and then their stores.
  const handleStoreChange = async (newStore: string) => {
    setStoreValue(newStore);
    setRepValue("");
    setRepOptionsForStore([]);
    try {
      const res = await fetch(`/api/roster/rep-for-store?store=${encodeURIComponent(newStore)}&role=${encodeURIComponent(roleLabel)}`);
      if (!res.ok) return;
      const data = await res.json();
      const allReps: string[] = data.allReps || [];
      setRepOptionsForStore(allReps);
      if (allReps.length === 1) {
        setRepValue(allReps[0]);
      } else if (data.rep) {
        setRepValue(data.rep);
      }
    } catch {
      // leave rep unresolved - user can still pick manually if this fails
    }
  };

  const handleRepChange = (newRep: string) => {
    setRepValue(newRep);
  };

  const handleContinue = () => {
    if (repValue) {
      setSelectedRep(repValue);
      setLocation(`/home?rep=${encodeURIComponent(repValue)}&role=${roleLabel}&store=${encodeURIComponent(storeValue)}`);
    }
  };

  const canContinue = !!storeValue && !!repValue;

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
      <BackgroundPatterns />

      <button
        onClick={() => setLocation("/")}
        data-testid="button-back-to-role-selection"
        style={{
          position: "absolute",
          top: "max(1.5rem, env(safe-area-inset-top, 0px) + 1rem)",
          left: "max(20px, env(safe-area-inset-left, 0px))",
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 4,
          color: ORANGE,
          zIndex: 1,
        }}
      >
        <ArrowLeft style={{ width: 20, height: 20 }} />
        <span style={{ fontSize: 14, fontWeight: 600 }}>Back</span>
      </button>

      <img src={meridianGroupLogo} alt="Meridian Group" style={{ height: "44px", opacity: 0.95, position: "relative" }} />

      <div style={{ textAlign: "center", marginTop: 20, marginBottom: 8, position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
          <Wrench style={{ width: 30, height: 30, color: ORANGE }} />
          <h1 style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-1px", lineHeight: 1 }}>
            <span style={{ color: "#F7F9FC" }}>Stock</span>
            <span style={{ color: ORANGE }}>Fix</span>
          </h1>
        </div>
        <p style={{ fontSize: 15, color: ORANGE, marginTop: 12, fontWeight: 600 }}>{roleLabel} Login</p>
      </div>

      <div style={{ width: "100%", maxWidth: 420, position: "relative", marginTop: 24 }}>
        <label style={{ fontSize: 13, color: "#F7F9FC", marginBottom: 8, display: "block", fontWeight: 600 }}>
          Select store <span style={{ color: ORANGE }}>*</span>
        </label>
        <PickerField
          value={storeValue}
          placeholder="Search or select store"
          onOpen={() => setShowStoreSelector(true)}
        />

        <label style={{ fontSize: 13, color: "#F7F9FC", marginBottom: 8, marginTop: 20, display: "block", fontWeight: 600 }}>
          {roleLabel} linked to this store <span style={{ color: ORANGE }}>*</span>
        </label>
        <PickerField
          value={repValue}
          placeholder={storeValue ? "No one assigned to this store" : "Select a store first"}
          onOpen={() => storeValue && setShowRepSelector(true)}
          disabled={!storeValue}
        />
        {storeValue && repOptionsForStore.length > 1 && (
          <p style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 8 }}>
            {repOptionsForStore.length} people cover this store - tap above to choose a different one.
          </p>
        )}

        <div style={{ marginTop: 28 }}>
          <button
            onClick={handleContinue}
            disabled={!canContinue}
            data-testid="button-continue"
            style={{
              width: "100%",
              padding: 16,
              borderRadius: 12,
              border: "none",
              background: canContinue ? ORANGE : CARD_DISABLED_BG,
              color: canContinue ? "#FFFFFF" : "#627DA5",
              fontSize: 16,
              fontWeight: 700,
              cursor: canContinue ? "pointer" : "not-allowed",
            }}
          >
            Continue
          </button>
        </div>
      </div>

      <div style={{ flex: 1 }} />

      {showStoreSelector && (
        <NameSelectorModal
          title="Select Store"
          entityLabel="Stores"
          options={stores}
          currentValue={storeValue}
          onSelect={handleStoreChange}
          onClose={() => setShowStoreSelector(false)}
          recentKind="stores"
          testId="modal-select-store"
        />
      )}

      {showRepSelector && (
        <NameSelectorModal
          title={`${roleLabel} Linked to Store`}
          entityLabel={repOptionsForStore.length > 0 ? "People Covering This Store" : (roleLabel === "Merchandiser" ? "Merchandisers" : "Reps")}
          options={repOptionsForStore.length > 0 ? repOptionsForStore : []}
          currentValue={repValue}
          onSelect={handleRepChange}
          onClose={() => setShowRepSelector(false)}
          recentKind="reps"
          testId="modal-select-rep"
        />
      )}
    </div>
  );
}
