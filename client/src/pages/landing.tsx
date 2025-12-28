import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Wrench } from "lucide-react";
import meridianLogo from "@/assets/meridian-logo.png";
import appBackground from "@/assets/app-background.png";

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
    if (selectedClient) params.set('client', selectedClient);
    setLocation(`/dashboard?${params.toString()}`);
  };

  return (
    <div 
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{
        backgroundImage: `url(${appBackground})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <div className="absolute inset-0 bg-black/20" />
      
      <div className="relative w-full max-w-md">
        <div className="w-full bg-white rounded-2xl shadow-2xl p-8">
          <div className="flex justify-center mb-6">
            <img 
              src={meridianLogo} 
              alt="Meridian Nexus" 
              className="h-20"
              data-testid="img-meridian-logo"
            />
          </div>
          
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2">
              <Wrench className="h-7 w-7 text-orange-500" />
              <h1 className="text-3xl font-bold text-[#1e3a5f]" data-testid="text-title">
                StockFix
              </h1>
            </div>
            <p className="text-gray-500 mt-1" data-testid="text-subtitle">
              Field Inventory Management
            </p>
          </div>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="rep-select" className="text-sm font-medium text-gray-700">
                Select Rep <span className="text-red-500">*</span>
              </Label>
              <Select value={selectedRep} onValueChange={setSelectedRep}>
                <SelectTrigger id="rep-select" data-testid="select-rep">
                  <SelectValue placeholder="Select Rep" />
                </SelectTrigger>
                <SelectContent>
                  {reps.map((rep: string) => (
                    <SelectItem key={rep} value={rep}>{rep}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="store-select" className="text-sm font-medium text-gray-700">
                Select Store <span className="text-red-500">*</span>
              </Label>
              <Select value={selectedStore} onValueChange={setSelectedStore}>
                <SelectTrigger id="store-select" data-testid="select-store">
                  <SelectValue placeholder="Select Store" />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((store: string) => (
                    <SelectItem key={store} value={store}>{store}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="client-select" className="text-sm font-medium text-gray-700">
                All Clients
              </Label>
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger id="client-select" data-testid="select-client">
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

            <Button 
              onClick={handleStartVisit}
              disabled={!canStart}
              className="w-full mt-6 bg-orange-500 hover:bg-orange-600 text-white font-semibold py-6 text-lg rounded-lg"
              data-testid="button-start-visit"
            >
              START VISIT
            </Button>
          </div>

          <p className="text-center text-gray-400 text-xs mt-8" data-testid="text-powered-by">
            Powered by Meridian Nexus
          </p>
        </div>
      </div>
    </div>
  );
}
