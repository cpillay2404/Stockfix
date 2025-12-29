import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wrench } from "lucide-react";
import meridianGroupLogo from "@/assets/meridian-group-logo.png";
import meridianNexusLogo from "@/assets/meridian-nexus-logo.png";

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

  const reps = stats?.filters?.reps || [];
  const stores = stats?.filters?.stores || [];
  const clients = stats?.filters?.clients || [];

  const canStart = selectedRep && selectedStore;

  const handleStartVisit = () => {
    const params = new URLSearchParams();
    if (selectedRep) params.set('rep', selectedRep);
    if (selectedStore) params.set('store', selectedStore);
    if (selectedClient && selectedClient !== 'all') params.set('client', selectedClient);
    setLocation(`/dashboard?${params.toString()}`);
  };

  return (
    <div 
      className="min-h-screen flex flex-col items-center"
      style={{ backgroundColor: '#003B71' }}
    >
      <div style={{ paddingTop: '32px', paddingBottom: '32px' }}>
        <img 
          src={meridianGroupLogo} 
          alt="Meridian Group" 
          style={{ height: '48px' }}
          data-testid="img-meridian-group-logo"
        />
      </div>
      
      <div 
        style={{
          width: '420px',
          maxWidth: 'calc(100% - 32px)',
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          padding: '32px',
          boxShadow: '0px 16px 40px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <Wrench style={{ width: '24px', height: '24px', color: '#F36C21' }} />
            <span style={{ fontSize: '28px', fontWeight: 600, color: '#003B71' }} data-testid="text-title">
              StockFix
            </span>
          </div>
        </div>
        
        <p style={{ fontSize: '14px', color: '#6B7280', textAlign: 'center', marginBottom: '24px' }} data-testid="text-subtitle">
          Field Inventory Management
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '14px', color: '#003B71', marginBottom: '4px', display: 'block' }}>
              Select Rep <span style={{ color: '#F36C21' }}>*</span>
            </label>
            <Select value={selectedRep} onValueChange={setSelectedRep}>
              <SelectTrigger 
                data-testid="select-rep"
                style={{ 
                  height: '44px', 
                  borderRadius: '8px', 
                  borderColor: '#D1D5DB',
                  fontSize: '14px',
                  color: '#003B71'
                }}
              >
                <SelectValue placeholder="Select Rep" />
              </SelectTrigger>
              <SelectContent>
                {reps.map((rep: string) => (
                  <SelectItem key={rep} value={rep}>{rep}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label style={{ fontSize: '14px', color: '#003B71', marginBottom: '4px', display: 'block' }}>
              Select Store <span style={{ color: '#F36C21' }}>*</span>
            </label>
            <Select value={selectedStore} onValueChange={setSelectedStore}>
              <SelectTrigger 
                data-testid="select-store"
                style={{ 
                  height: '44px', 
                  borderRadius: '8px', 
                  borderColor: '#D1D5DB',
                  fontSize: '14px',
                  color: '#003B71'
                }}
              >
                <SelectValue placeholder="Select Store" />
              </SelectTrigger>
              <SelectContent>
                {stores.map((store: string) => (
                  <SelectItem key={store} value={store}>{store}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label style={{ fontSize: '14px', color: '#003B71', marginBottom: '4px', display: 'block' }}>
              All Clients
            </label>
            <Select value={selectedClient} onValueChange={setSelectedClient}>
              <SelectTrigger 
                data-testid="select-client"
                style={{ 
                  height: '44px', 
                  borderRadius: '8px', 
                  borderColor: '#D1D5DB',
                  fontSize: '14px',
                  color: '#003B71'
                }}
              >
                <SelectValue placeholder="All Clients" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Clients</SelectItem>
                {clients.map((client: string) => (
                  <SelectItem key={client} value={client}>{client}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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

      <div style={{ paddingTop: '32px', paddingBottom: '32px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0px' }}>
        <p style={{ fontSize: '12px', color: '#FFFFFF', margin: 0, padding: 0, lineHeight: 1 }} data-testid="text-powered-by">
          Powered by
        </p>
        <img 
          src={meridianNexusLogo} 
          alt="Meridian Nexus" 
          style={{ height: '80px', marginTop: '2px' }}
          data-testid="img-meridian-nexus-logo"
        />
      </div>
    </div>
  );
}
