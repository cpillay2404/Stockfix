import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Check, ChevronDown, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import meridianGroupLogo from "@/assets/meridian-group-logo.png";
import meridianNexusLogo from "@/assets/meridian-nexus-logo.png";

interface SearchableSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: string[];
  placeholder: string;
  disabled?: boolean;
  testId: string;
}

function SearchableSelect({ value, onValueChange, options, placeholder, disabled, testId }: SearchableSelectProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          data-testid={testId}
          style={{
            width: '100%',
            height: '44px',
            borderRadius: '8px',
            border: '1px solid #D1D5DB',
            fontSize: '14px',
            color: value ? '#003B71' : '#9CA3AF',
            backgroundColor: disabled ? '#F3F4F6' : '#FFFFFF',
            padding: '0 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.6 : 1,
          }}
        >
          <span>{value || placeholder}</span>
          <ChevronDown style={{ width: '16px', height: '16px', opacity: 0.5 }} />
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

export default function Landing() {
  const [, setLocation] = useLocation();
  const [selectedRep, setSelectedRep] = useState("");
  const [selectedStore, setSelectedStore] = useState("");
  const [selectedClient, setSelectedClient] = useState("");

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard/stats");
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
  });

  const { data: repStoresData } = useQuery({
    queryKey: ["rep-stores", selectedRep],
    queryFn: async () => {
      if (!selectedRep) return { stores: [] };
      const res = await fetch(`/api/reps/${encodeURIComponent(selectedRep)}/stores`);
      if (!res.ok) throw new Error("Failed to fetch stores");
      return res.json();
    },
    enabled: !!selectedRep,
  });

  const reps = stats?.filters?.reps || [];
  const allStores = stats?.filters?.stores || [];
  const repStores = repStoresData?.stores || [];
  const stores = selectedRep ? repStores : allStores;
  const clients = stats?.filters?.clients || [];

  useEffect(() => {
    setSelectedStore("");
  }, [selectedRep]);

  const canStart = !!selectedStore;

  const handleStartVisit = () => {
    const params = new URLSearchParams();
    if (selectedRep) params.set('rep', selectedRep);
    if (selectedStore) params.set('store', selectedStore);
    if (selectedClient && selectedClient !== 'All Clients' && selectedClient) params.set('client', selectedClient);
    setLocation(`/store-overview?${params.toString()}`);
  };

  return (
    <div 
      className="h-screen flex flex-col items-center overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #003B71 0%, #002F5A 100%)' }}
    >
      {/* Top Header: Meridian Logo */}
      <div style={{ paddingTop: '32px', paddingBottom: '20px' }}>
        <img 
          src={meridianGroupLogo} 
          alt="Meridian Group" 
          style={{ height: '48px' }}
          data-testid="img-meridian-group-logo"
        />
      </div>

      {/* StockFix Identity Block - On Blue Background */}
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
          <Wrench style={{ width: '28px', height: '28px', color: '#F36C21' }} />
          <span style={{ fontSize: '30px', fontWeight: 700, color: '#FFFFFF' }} data-testid="text-title">
            StockFix
          </span>
        </div>
        <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.7)', marginTop: '6px' }} data-testid="text-subtitle">
          Field Inventory Management
        </p>
      </div>
      
      {/* White Card - Only Form Fields */}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '14px', color: '#003B71', marginBottom: '6px', display: 'block', fontWeight: 500 }}>
              Select Rep <span style={{ color: '#9CA3AF', fontWeight: 400 }}>(optional)</span>
            </label>
            <SearchableSelect
              value={selectedRep}
              onValueChange={setSelectedRep}
              options={reps}
              placeholder="Select Rep"
              testId="select-rep"
            />
          </div>

          <div>
            <label style={{ fontSize: '14px', color: '#003B71', marginBottom: '6px', display: 'block', fontWeight: 500 }}>
              Select Store <span style={{ color: '#F36C21' }}>*</span>
            </label>
            <SearchableSelect
              value={selectedStore}
              onValueChange={setSelectedStore}
              options={stores}
              placeholder="Select Store"
              disabled={false}
              testId="select-store"
            />
          </div>

          <div>
            <label style={{ fontSize: '14px', color: '#003B71', marginBottom: '6px', display: 'block', fontWeight: 500 }}>
              All Clients
            </label>
            <SearchableSelect
              value={selectedClient}
              onValueChange={setSelectedClient}
              options={['All Clients', ...clients]}
              placeholder="All Clients"
              testId="select-client"
            />
          </div>
        </div>

        <Button 
          onClick={handleStartVisit}
          disabled={!canStart}
          data-testid="button-start-visit"
          style={{
            width: '100%',
            height: '48px',
            marginTop: '24px',
            backgroundColor: '#F36C21',
            color: '#FFFFFF',
            fontSize: '16px',
            fontWeight: 600,
            borderRadius: '10px',
            opacity: 1,
          }}
          className="hover:bg-[#E05A10]"
        >
          START VISIT
        </Button>
      </div>

      {/* Spacer to push footer to bottom */}
      <div style={{ flex: 1 }} />

      {/* Footer: Powered by Meridian Nexus */}
      <div style={{ paddingBottom: '20px', display: 'flex', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
          <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', margin: 0, textAlign: 'center' }} data-testid="text-powered-by">
            Powered by
          </p>
          <img 
            src={meridianNexusLogo} 
            alt="Meridian Nexus" 
            style={{ height: '80px', display: 'block' }}
            data-testid="img-meridian-nexus-logo"
          />
        </div>
      </div>
    </div>
  );
}
