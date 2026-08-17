import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, ChevronDown, Wrench } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useAccess } from "@/context/AccessContext";
import meridianGroupLogo from "@/assets/meridian-group-logo.png";
import { COLORS, DOT_MATRIX_BG, HEX_OUTLINE_PATTERN_BG } from "@/lib/design-tokens";

// Matches the choose-access.tsx / select-manager.tsx dark navy/orange theme
// (Carin, 2026-08-17: "work on all screens that don't have this new navy
// blue design" - this page was still on the old white-card/blue-gradient
// layout).
const NAVY_ELEVATED = COLORS.navyElevated;
const NAVY_DEEP = COLORS.bgPrimary;
const ORANGE = COLORS.orange;
const TEXT_MUTED = COLORS.textMuted;

interface SearchableSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: string[];
  placeholder: string;
  testId: string;
}

function SearchableSelect({ value, onValueChange, options, placeholder, testId }: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredOptions = useMemo(() => {
    if (!search) return options.slice(0, 100);
    const searchLower = search.toLowerCase();
    return options.filter(opt => opt.toLowerCase().includes(searchLower)).slice(0, 100);
  }, [options, search]);

  return (
    <Popover open={open} onOpenChange={(isOpen) => { setOpen(isOpen); if (!isOpen) setSearch(""); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={testId}
          style={{
            width: "100%",
            height: 48,
            borderRadius: 10,
            border: "1px solid rgba(23,68,111,0.6)",
            fontSize: 15,
            color: value ? "#F7F9FC" : TEXT_MUTED,
            backgroundColor: NAVY_ELEVATED,
            padding: "0 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
          }}
        >
          <span>{value || placeholder}</span>
          <ChevronDown style={{ width: 18, height: 18, opacity: 0.6, color: TEXT_MUTED }} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0"
        style={{ width: "var(--radix-popover-trigger-width)", maxHeight: 300 }}
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput placeholder={`Search ${placeholder.toLowerCase()}...`} value={search} onValueChange={setSearch} />
          <CommandList style={{ maxHeight: 250, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {filteredOptions.map((option) => (
                <CommandItem
                  key={option}
                  value={option}
                  onSelect={() => {
                    onValueChange(option);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === option ? "opacity-100" : "opacity-0")} />
                  {option}
                </CommandItem>
              ))}
              {options.length > 100 && !search && (
                <div className="px-2 py-1.5 text-xs text-gray-500 text-center">
                  Type to search {options.length.toLocaleString()} items...
                </div>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function SelectRep() {
  const [, setLocation] = useLocation();
  const { accessMode, setAccessMode, setSelectedRep } = useAccess();
  const [repValue, setRepValue] = useState("");

  useEffect(() => {
    if (accessMode !== "rep") {
      setAccessMode("rep");
    }
  }, [accessMode, setAccessMode]);

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard/stats");
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
  });

  const reps = stats?.filters?.reps || [];

  const handleBack = () => {
    setLocation("/");
  };

  const handleContinue = () => {
    if (repValue) {
      setSelectedRep(repValue);
      setLocation("/select-store");
    }
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
          <p style={{ fontSize: 13.5, color: TEXT_MUTED, marginTop: 6 }}>Rep Access</p>
        </div>

        <label style={{ fontSize: 12, fontWeight: 700, color: TEXT_MUTED, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 10, display: "block" }}>
          Select Rep <span style={{ color: ORANGE }}>*</span>
        </label>
        <SearchableSelect
          value={repValue}
          onValueChange={setRepValue}
          options={reps}
          placeholder="Select Rep"
          testId="select-rep"
        />

        <button
          onClick={handleContinue}
          disabled={!repValue}
          data-testid="button-continue"
          style={{
            width: "100%",
            height: 48,
            marginTop: 20,
            backgroundColor: repValue ? ORANGE : "rgba(23,68,111,0.4)",
            color: repValue ? "#FFFFFF" : TEXT_MUTED,
            fontSize: 15,
            fontWeight: 700,
            borderRadius: 10,
            border: "none",
            cursor: repValue ? "pointer" : "not-allowed",
          }}
        >
          CONTINUE
        </button>
      </div>

      <div style={{ flex: 1 }} />
    </div>
  );
}
