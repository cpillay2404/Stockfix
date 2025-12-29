import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Check, ChevronDown, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";

interface SearchableSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: string[];
  placeholder: string;
  testId: string;
}

function SearchableSelect({ value, onValueChange, options, placeholder, testId }: SearchableSelectProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={testId}
          style={{
            width: '100%',
            height: '40px',
            borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.3)',
            fontSize: '14px',
            color: '#FFFFFF',
            backgroundColor: 'rgba(255,255,255,0.1)',
            padding: '0 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
          }}
        >
          <span>{value || placeholder}</span>
          <ChevronDown style={{ width: '16px', height: '16px', opacity: 0.7 }} />
        </button>
      </PopoverTrigger>
      <PopoverContent 
        className="p-0" 
        style={{ width: 'var(--radix-popover-trigger-width)', maxHeight: '300px' }}
        align="start"
      >
        <Command>
          <CommandInput placeholder={`Search...`} />
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

interface TileProps {
  label: string;
  value: number;
  testId: string;
}

function Tile({ label, value, testId }: TileProps) {
  return (
    <div
      data-testid={testId}
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '12px',
        padding: '16px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span style={{ fontSize: '28px', fontWeight: 700, color: '#003B71', fontFamily: 'monospace' }}>
        {value}
      </span>
      <span style={{ fontSize: '11px', color: '#6B7280', textAlign: 'center', marginTop: '4px' }}>
        {label}
      </span>
    </div>
  );
}

interface ChartCardProps {
  title: string;
  data: { weekEnding: string; value: number }[];
  testId: string;
}

function ChartCard({ title, data, testId }: ChartCardProps) {
  const formatWeekLabel = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[1]}/${parts[2]}`;
    }
    return dateStr;
  };

  return (
    <div
      data-testid={testId}
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '16px',
        padding: '16px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        marginBottom: '16px',
      }}
    >
      <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#003B71', marginBottom: '12px' }}>
        {title}
      </h3>
      <div style={{ height: '160px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
            <XAxis 
              dataKey="weekEnding" 
              tick={{ fontSize: 10, fill: '#6B7280' }}
              tickFormatter={formatWeekLabel}
              axisLine={false}
              tickLine={false}
            />
            <YAxis 
              tick={{ fontSize: 10, fill: '#6B7280' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip 
              labelFormatter={(label) => `Week: ${label}`}
              formatter={(value: number) => [value.toLocaleString(), '']}
            />
            <Bar dataKey="value" fill="#003B71" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function StoreOverview() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  
  const rep = params.get('rep') || '';
  const store = params.get('store') || '';
  const initialClient = params.get('client') || 'All Clients';
  
  const [selectedClient, setSelectedClient] = useState(initialClient);
  const [selectedArticle, setSelectedArticle] = useState('All Articles');

  const { data, isLoading } = useQuery({
    queryKey: ["store-overview", rep, store, selectedClient, selectedArticle],
    queryFn: async () => {
      const params = new URLSearchParams({ rep, store });
      if (selectedClient && selectedClient !== 'All Clients') {
        params.set('client', selectedClient);
      }
      if (selectedArticle && selectedArticle !== 'All Articles') {
        params.set('article', selectedArticle);
      }
      const res = await fetch(`/api/store-overview?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch store overview");
      return res.json();
    },
    enabled: !!rep && !!store,
  });

  const handleViewTasks = () => {
    const taskParams = new URLSearchParams();
    if (rep) taskParams.set('rep', rep);
    if (store) taskParams.set('store', store);
    if (selectedClient && selectedClient !== 'All Clients') {
      taskParams.set('client', selectedClient);
    }
    if (selectedArticle && selectedArticle !== 'All Articles') {
      taskParams.set('article', selectedArticle);
    }
    setLocation(`/tasks?${taskParams.toString()}`);
  };

  const clientOptions = ['All Clients', ...(data?.filters?.clients || [])];
  const articleOptions = ['All Articles', ...(data?.filters?.articles || [])];

  const tiles = data?.tiles || { totalSKUs: 0, actionRequired: 0, understockOOS: 0, overstock: 0 };
  const charts = data?.charts || { storeSoh: [], sellOutP4: [], wfc: [] };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#003B71' }}>
      <div style={{ padding: '20px 16px' }}>
        <button
          onClick={() => setLocation('/')}
          data-testid="button-back"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: 'rgba(255,255,255,0.8)',
            fontSize: '14px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            marginBottom: '12px',
          }}
        >
          <ArrowLeft style={{ width: '18px', height: '18px' }} />
          <span>Back</span>
        </button>
        <div style={{ marginBottom: '8px' }}>
          <h1 
            style={{ 
              fontSize: '20px', 
              fontWeight: 700, 
              color: '#FFFFFF', 
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
            data-testid="text-store-name"
          >
            {store}
          </h1>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)' }} data-testid="text-region-rep">
            {data?.region || ''} • {rep}
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '16px' }}>
          <div>
            <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginBottom: '4px', display: 'block' }}>
              Client
            </label>
            <SearchableSelect
              value={selectedClient}
              onValueChange={setSelectedClient}
              options={clientOptions}
              placeholder="All Clients"
              testId="select-client-filter"
            />
          </div>
          <div>
            <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginBottom: '4px', display: 'block' }}>
              Article
            </label>
            <SearchableSelect
              value={selectedArticle}
              onValueChange={setSelectedArticle}
              options={articleOptions}
              placeholder="All Articles"
              testId="select-article-filter"
            />
          </div>
        </div>

        <Button
          onClick={handleViewTasks}
          data-testid="button-view-tasks"
          style={{
            width: '100%',
            height: '48px',
            marginTop: '20px',
            backgroundColor: '#F36C21',
            color: '#FFFFFF',
            fontSize: '16px',
            fontWeight: 600,
            borderRadius: '10px',
          }}
          className="hover:bg-[#E05A10]"
        >
          VIEW TASKS
        </Button>
      </div>

      <div style={{ padding: '0 16px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
          <Tile label="Total SKUs (This Week)" value={tiles.totalSKUs} testId="tile-total-skus" />
          <Tile label="Action Required (This Week)" value={tiles.actionRequired} testId="tile-action-required" />
          <Tile label="Understock / OOS (This Week)" value={tiles.understockOOS} testId="tile-understock-oos" />
          <Tile label="Overstock (This Week)" value={tiles.overstock} testId="tile-overstock" />
        </div>

        <ChartCard title="Store SOH" data={charts.storeSoh} testId="chart-store-soh" />
        <ChartCard title="Sell Out (P4 Weeks)" data={charts.sellOutP4} testId="chart-sell-out" />
        <ChartCard title="WFC" data={charts.wfc} testId="chart-wfc" />
      </div>
    </div>
  );
}
