import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, ChevronDown, Wrench } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useAccess } from "@/context/AccessContext";
import meridianGroupLogo from "@/assets/meridian-group-logo.png";
import meridianNexusLogo from "@/assets/meridian-nexus-logo.png";

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

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={testId}
          disabled={disabled}
          style={{
            width: '100%',
            height: '48px',
            borderRadius: '8px',
            border: '1px solid #D1D5DB',
            fontSize: '16px',
            color: value ? '#003B71' : '#9CA3AF',
            backgroundColor: disabled ? '#F3F4F6' : '#FFFFFF',
            padding: '0 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.6 : 1,
          }}
        >
          <span>{value || placeholder}</span>
          <ChevronDown style={{ width: '18px', height: '18px', opacity: 0.5 }} />
        </button>
      </PopoverTrigger>
      <PopoverContent 
        className="p-0" 
        style={{ width: 'var(--radix-popover-trigger-width)', maxHeight: '300px' }}
        align="start"
      >
        <Command>
          <CommandInput placeholder={`Search ${placeholder.toLowerCase()}...`} />
          <CommandList style={{ maxHeight: '250px', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option}
                  value={option}
                  onSelect={() => {
                    onValueChange(option);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {option}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function SelectRepStore() {
  const [, setLocation] = useLocation();
  const { accessMode, setAccessMode, setSelectedRep, setSelectedStore: setContextStore } = useAccess();
  const [repValue, setRepValue] = useState("");
  const [storeValue, setStoreValue] = useState("");

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

  const { data: storesData, isLoading: storesLoading } = useQuery({
    queryKey: ["rep-stores", repValue],
    queryFn: async () => {
      if (!repValue) return { stores: [] };
      const res = await fetch(`/api/reps/${encodeURIComponent(repValue)}/stores`);
      if (!res.ok) throw new Error("Failed to fetch stores");
      return res.json();
    },
    enabled: !!repValue,
  });

  const reps = stats?.filters?.reps || [];
  const stores = storesData?.stores || [];

  const handleRepChange = (newRep: string) => {
    setRepValue(newRep);
    setStoreValue("");
  };

  const handleBack = () => {
    setLocation("/");
  };

  const handleStartVisit = () => {
    if (repValue && storeValue) {
      setSelectedRep(repValue);
      setContextStore(storeValue);
      sessionStorage.setItem('visitStartTime', new Date().toISOString());
      
      const params = new URLSearchParams();
      params.set('rep', repValue);
      params.set('store', storeValue);
      
      setLocation(`/store-overview?${params.toString()}`);
    }
  };

  const canStart = repValue && storeValue;

  return (
    <div 
      className="h-screen flex flex-col items-center overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #003B71 0%, #002F5A 100%)' }}
    >
      <div style={{ paddingTop: '32px', paddingBottom: '20px' }}>
        <img 
          src={meridianGroupLogo} 
          alt="Meridian Group" 
          style={{ height: '48px' }}
        />
      </div>

      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
          <Wrench style={{ width: '28px', height: '28px', color: '#F36C21' }} />
          <span style={{ fontSize: '30px', fontWeight: 700, color: '#FFFFFF' }}>
            StockFix
          </span>
        </div>
        <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.7)', marginTop: '6px' }}>
          Rep Visit Setup
        </p>
      </div>

      <div 
        style={{
          width: '420px',
          maxWidth: 'calc(100% - 32px)',
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          padding: '28px',
          boxShadow: '0px 16px 40px rgba(0,0,0,0.25)',
        }}
      >
        <button
          onClick={handleBack}
          data-testid="button-back"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: '#003B71',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            marginBottom: '20px',
            fontSize: '14px',
          }}
        >
          <ArrowLeft style={{ width: '18px', height: '18px' }} />
          Back
        </button>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '14px', color: '#003B71', marginBottom: '8px', display: 'block', fontWeight: 500 }}>
            Select Your Name <span style={{ color: '#F36C21' }}>*</span>
          </label>
          <SearchableSelect
            value={repValue}
            onValueChange={handleRepChange}
            options={reps}
            placeholder="Select Rep"
            testId="select-rep"
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '14px', color: '#003B71', marginBottom: '8px', display: 'block', fontWeight: 500 }}>
            Select Store <span style={{ color: '#F36C21' }}>*</span>
          </label>
          <SearchableSelect
            value={storeValue}
            onValueChange={setStoreValue}
            options={stores}
            placeholder={repValue ? "Select Store" : "Select rep first"}
            testId="select-store"
            disabled={!repValue}
          />
          {repValue && stores.length === 0 && !storesLoading && (
            <p style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '8px' }}>
              No stores found for this rep
            </p>
          )}
          {storesLoading && (
            <p style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '8px' }}>
              Loading stores...
            </p>
          )}
        </div>

        <button
          onClick={handleStartVisit}
          disabled={!canStart}
          data-testid="button-start-visit"
          style={{
            width: '100%',
            height: '48px',
            backgroundColor: canStart ? '#F36C21' : '#D1D5DB',
            color: '#FFFFFF',
            fontSize: '16px',
            fontWeight: 600,
            borderRadius: '10px',
            border: 'none',
            cursor: canStart ? 'pointer' : 'not-allowed',
          }}
        >
          START VISIT
        </button>
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ paddingBottom: '20px', display: 'flex', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
          <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', margin: 0, textAlign: 'center' }}>
            Powered by
          </p>
          <img 
            src={meridianNexusLogo} 
            alt="Meridian Nexus" 
            style={{ height: '80px', display: 'block' }}
          />
        </div>
      </div>
    </div>
  );
}
