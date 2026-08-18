import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Check, ChevronDown, Wrench, Lock, AlertCircle, Loader2, ArrowLeft } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useAccess } from "@/context/AccessContext";
import meridianGroupLogo from "@/assets/meridian-group-logo.png";
import { COLORS, DOT_MATRIX_BG, HEX_OUTLINE_PATTERN_BG } from "@/lib/design-tokens";

// Matches the choose-access.tsx / select-manager.tsx / select-rep.tsx /
// select-client.tsx dark navy/orange theme (Carin, 2026-08-17: "work on all
// screens that don't have this new navy blue design" + "start hooking up
// ... im a client pages" - this is the actual "I'm a Client" destination:
// client + store + password gate + Start Visit).
const NAVY_ELEVATED = COLORS.navyElevated;
const NAVY_DEEP = COLORS.bgPrimary;
const ORANGE = COLORS.orange;
const TEXT_MUTED = COLORS.textMuted;
const RED = "#F87171";
const GREEN = "#34D399";

interface SearchableSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: string[];
  placeholder: string;
  testId: string;
  disabled?: boolean;
}

function SearchableSelect({ value, onValueChange, options, placeholder, testId, disabled }: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredOptions = useMemo(() => {
    if (!search) return options.slice(0, 100);
    const searchLower = search.toLowerCase();
    return options.filter(opt => opt.toLowerCase().includes(searchLower)).slice(0, 100);
  }, [options, search]);

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : (isOpen) => { setOpen(isOpen); if (!isOpen) setSearch(""); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={testId}
          disabled={disabled}
          style={{
            width: "100%",
            height: 48,
            borderRadius: 10,
            border: "1px solid rgba(23,68,111,0.6)",
            fontSize: 15,
            color: value ? "#F7F9FC" : TEXT_MUTED,
            backgroundColor: disabled ? "rgba(6,23,43,0.5)" : NAVY_ELEVATED,
            padding: "0 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? 0.6 : 1,
          }}
        >
          <span>{value || placeholder}</span>
          <ChevronDown style={{ width: 18, height: 18, opacity: 0.6, color: TEXT_MUTED }} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0"
        style={{
          width: "var(--radix-popover-trigger-width)",
          maxHeight: 300,
          backgroundColor: NAVY_ELEVATED,
          border: "1px solid rgba(23,68,111,0.6)",
        }}
        align="start"
      >
        {/* Dark-theme override 2026-08-18 (Carin: "not aligned to the
            current design") - shadcn's Command/Popover default to a light
            theme via CSS variables this app never activates (every other
            screen is manually dark-styled with inline colors, not Tailwind's
            dark class), so this dropdown rendered white/black while its own
            trigger button was already dark. */}
        <Command shouldFilter={false} style={{ backgroundColor: NAVY_ELEVATED, color: "#F7F9FC" }}>
          <CommandInput
            placeholder={`Search ${placeholder.toLowerCase()}...`}
            value={search}
            onValueChange={setSearch}
            style={{ color: "#F7F9FC" }}
            className="placeholder:text-[#8CA3C4]"
          />
          <CommandList style={{ maxHeight: 250, overflowY: "auto", WebkitOverflowScrolling: "touch", backgroundColor: NAVY_ELEVATED }}>
            <CommandEmpty style={{ color: TEXT_MUTED }}>No results found.</CommandEmpty>
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
                  style={{ color: "#F7F9FC" }}
                  className="aria-selected:bg-[rgba(255,121,0,0.18)] aria-selected:text-[#F7F9FC] data-[selected=true]:bg-[rgba(255,121,0,0.18)] data-[selected=true]:text-[#F7F9FC]"
                >
                  <Check className={cn("mr-2 h-4 w-4", value === option ? "opacity-100" : "opacity-0")} />
                  {option}
                </CommandItem>
              ))}
              {options.length > 100 && !search && (
                <div className="px-2 py-1.5 text-xs text-center" style={{ color: TEXT_MUTED }}>
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

export default function SelectClientStore() {
  const [, setLocation] = useLocation();
  const { accessMode, setAccessMode, setClientLocked, setSelectedClient, setSelectedStore: setContextStore } = useAccess();
  const [clientValue, setClientValue] = useState("");
  const [storeValue, setStoreValue] = useState("");
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    if (accessMode !== "client") {
      setAccessMode("client");
      setClientLocked(true);
    }
  }, [accessMode, setAccessMode, setClientLocked]);

  // Real bug found 2026-08-18 (Carin: "it must talk to the real app now") -
  // this used to read /api/dashboard/stats, whose client list comes from
  // the legacy tasks table, not the real synced Nexus data this new app
  // actually runs on.
  const { data: realClientsData, isError: clientsError, refetch: refetchClients, isFetching: clientsFetching } = useQuery({
    queryKey: ["all-clients"],
    queryFn: async () => {
      const res = await fetch("/api/roster/all-clients");
      if (!res.ok) throw new Error("Failed to fetch clients");
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) throw new Error("Server returned non-JSON");
      return res.json();
    },
    refetchOnMount: "always",
    retry: 2,
    retryDelay: 1000,
  });

  const { data: hasPasswordData } = useQuery({
    queryKey: ["client-has-password", clientValue],
    queryFn: async () => {
      if (!clientValue) return { hasPassword: false };
      const res = await fetch(`/api/client-auth/has-password/${encodeURIComponent(clientValue)}`);
      if (!res.ok) throw new Error("Failed to check password");
      return res.json();
    },
    enabled: !!clientValue,
  });

  // TEMPORARILY DISABLED 2026-08-18 (Carin: "remove password for now so we
  // can see whats happening then we create passwords") - real passwords
  // haven't been set up for this new flow yet. Revert to
  // `hasPasswordData?.hasPassword === true` once client_passwords has real
  // entries for the clients being tested.
  const requiresPassword = false;

  const { data: storesData, isLoading: storesLoading } = useQuery({
    queryKey: ["client-stores", clientValue, isAuthenticated, requiresPassword],
    queryFn: async () => {
      if (!clientValue) return { stores: [] };
      const res = await fetch(`/api/clients/${encodeURIComponent(clientValue)}/stores`);
      if (!res.ok) throw new Error("Failed to fetch stores");
      return res.json();
    },
    enabled: !!clientValue && (isAuthenticated || !requiresPassword),
  });

  const verifyMutation = useMutation({
    mutationFn: async ({ clientName, pwd }: { clientName: string; pwd: string }) => {
      const res = await fetch("/api/client-auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName, password: pwd }),
      });
      if (!res.ok) throw new Error("Failed to verify password");
      return res.json();
    },
    onSuccess: (data) => {
      if (data.valid) {
        setIsAuthenticated(true);
        setPasswordError("");
      } else {
        setPasswordError("Incorrect password. Please try again.");
      }
    },
    onError: () => {
      setPasswordError("Failed to verify password. Please try again.");
    },
  });

  const clients = realClientsData?.clients || [];
  const stores = storesData?.stores || [];

  const handleClientChange = (newClient: string) => {
    setClientValue(newClient);
    setStoreValue("");
    setPassword("");
    setPasswordError("");
    setIsAuthenticated(false);
  };

  const handleVerifyPassword = () => {
    if (clientValue && password) {
      verifyMutation.mutate({ clientName: clientValue, pwd: password });
    }
  };

  const handleStartVisit = () => {
    if (clientValue && storeValue && (isAuthenticated || !requiresPassword)) {
      setSelectedClient(clientValue);
      setContextStore(storeValue);
      sessionStorage.setItem('visitStartTime', new Date().toISOString());

      // Routes into the same new Insights/Fix screens a rep/merchandiser
      // uses (Carin, 2026-08-18: "THE CLIENT VIEW MUST LOGIN TO THE SAME
      // SCREENS LIKE A REP/MERCHANDISER JUST FILTERED FOR THAT CLIENT") -
      // was going to the old /store-overview page. No `rep` param at all
      // is the real signal every Insights/Fix page uses to know "this is
      // a client visit, lock the client filter" (a client login never has
      // a rep name).
      const params = new URLSearchParams();
      params.set('store', storeValue);
      params.set('client', clientValue);

      setLocation(`/store-detail?${params.toString()}`);
    }
  };

  const canStart = clientValue && storeValue && (isAuthenticated || !requiresPassword);

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
          type="button"
          onClick={() => {
            setAccessMode(null);
            setClientLocked(false);
            setSelectedClient(null);
            setContextStore(null);
            setLocation("/");
          }}
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
          <p style={{ fontSize: 13.5, color: TEXT_MUTED, marginTop: 6 }}>Client Visit Setup</p>
        </div>

        <p style={{ fontSize: 13, color: TEXT_MUTED, textAlign: "center", marginBottom: 20 }}>
          Please select your company and store to continue
        </p>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: TEXT_MUTED, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 10, display: "block" }}>
            Select Client <span style={{ color: ORANGE }}>*</span>
          </label>
          <SearchableSelect
            value={clientValue}
            onValueChange={handleClientChange}
            options={clients}
            placeholder={clientsFetching ? "Loading clients..." : "Select Client"}
            testId="select-client"
          />
          {clientsError && !clientsFetching && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
              <span style={{ fontSize: 12, color: "#F87171" }}>Failed to load clients.</span>
              <button
                onClick={() => refetchClients()}
                style={{ fontSize: 12, color: ORANGE, background: "none", border: "none", cursor: "pointer", padding: 0, fontWeight: 600 }}
              >
                Try again
              </button>
            </div>
          )}
        </div>

        {clientValue && requiresPassword && !isAuthenticated && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: TEXT_MUTED, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 10, display: "block" }}>
              <Lock style={{ width: 13, height: 13, display: "inline", marginRight: 6, verticalAlign: "middle" }} />
              Enter Access Code <span style={{ color: ORANGE }}>*</span>
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setPasswordError(""); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleVerifyPassword(); }}
                placeholder="Enter password"
                data-testid="input-client-password"
                style={{
                  flex: 1,
                  height: 48,
                  borderRadius: 10,
                  border: passwordError ? `1px solid ${RED}` : "1px solid rgba(23,68,111,0.6)",
                  fontSize: 15,
                  color: "#F7F9FC",
                  backgroundColor: NAVY_ELEVATED,
                  padding: "0 16px",
                }}
              />
              <button
                onClick={handleVerifyPassword}
                disabled={!password || verifyMutation.isPending}
                data-testid="button-verify-password"
                style={{
                  padding: "0 20px",
                  height: 48,
                  backgroundColor: password ? ORANGE : "rgba(23,68,111,0.4)",
                  color: password ? "#FFFFFF" : TEXT_MUTED,
                  fontSize: 14,
                  fontWeight: 700,
                  borderRadius: 10,
                  border: "none",
                  cursor: password ? "pointer" : "not-allowed",
                }}
              >
                {verifyMutation.isPending ? <Loader2 style={{ width: 18, height: 18, animation: "spin 1s linear infinite" }} /> : "Verify"}
              </button>
            </div>
            {passwordError && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, color: RED, fontSize: 13 }}>
                <AlertCircle style={{ width: 14, height: 14 }} />
                {passwordError}
              </div>
            )}
          </div>
        )}

        {clientValue && requiresPassword && isAuthenticated && (
          <div style={{ marginBottom: 16, backgroundColor: "rgba(52,211,153,0.12)", border: `1px solid rgba(52,211,153,0.4)`, borderRadius: 10, padding: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <Check style={{ width: 18, height: 18, color: GREEN }} />
            <span style={{ color: GREEN, fontSize: 14, fontWeight: 600 }}>Access verified</span>
          </div>
        )}

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: TEXT_MUTED, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 10, display: "block" }}>
            Select Store <span style={{ color: ORANGE }}>*</span>
          </label>
          <SearchableSelect
            value={storeValue}
            onValueChange={setStoreValue}
            options={stores}
            placeholder={!clientValue ? "Select client first" : (requiresPassword && !isAuthenticated) ? "Verify access first" : "Select Store"}
            testId="select-store"
            disabled={!clientValue || (requiresPassword && !isAuthenticated)}
          />
          {clientValue && (isAuthenticated || !requiresPassword) && stores.length === 0 && !storesLoading && (
            <p style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 8 }}>
              No stores found for this client
            </p>
          )}
          {storesLoading && (
            <p style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 8 }}>
              Loading stores...
            </p>
          )}
        </div>

        <button
          onClick={handleStartVisit}
          disabled={!canStart}
          data-testid="button-start-visit"
          style={{
            width: "100%",
            height: 48,
            backgroundColor: canStart ? ORANGE : "rgba(23,68,111,0.4)",
            color: canStart ? "#FFFFFF" : TEXT_MUTED,
            fontSize: 15,
            fontWeight: 700,
            borderRadius: 10,
            border: "none",
            cursor: canStart ? "pointer" : "not-allowed",
          }}
        >
          START VISIT
        </button>
      </div>

      <div style={{ flex: 1 }} />
    </div>
  );
}
