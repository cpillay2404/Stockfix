import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Check, ChevronDown, ArrowLeft, LogOut, User, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { ComposedChart, Bar, Line, XAxis, YAxis, ResponsiveContainer, LabelList } from "recharts";

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
            gap: '8px',
            cursor: 'pointer',
            overflow: 'hidden',
          }}
        >
          <span style={{
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            textAlign: 'left',
          }}>
            {value || placeholder}
          </span>
          <ChevronDown style={{ width: '16px', height: '16px', opacity: 0.7, flexShrink: 0 }} />
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
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    padding: '8px',
                    lineHeight: '1.4',
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 flex-shrink-0 mt-0.5",
                      value === option ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span style={{
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    wordBreak: 'break-word',
                  }}>
                    {option}
                  </span>
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
        borderRadius: '10px',
        padding: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span style={{ fontSize: '24px', fontWeight: 700, color: '#003B71', fontFamily: 'monospace' }}>
        {value}
      </span>
      <span style={{ fontSize: '10px', color: '#6B7280', textAlign: 'center', marginTop: '2px' }}>
        {label}
      </span>
    </div>
  );
}

interface ChartCardProps {
  title: string;
  data: { weekEnding: string; value: number }[];
  testId: string;
  height?: number;
  isWFC?: boolean;
}

function ChartCard({ title, data, testId, height = 160, isWFC = false }: ChartCardProps) {
  const formatWeekLabel = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[1]}/${parts[2]}`;
    }
    return dateStr;
  };

  const formatValue = (val: number) => {
    if (isWFC) {
      return val.toFixed(1);
    }
    if (val >= 1000) {
      return `${(val / 1000).toFixed(1)}k`;
    }
    return val.toString();
  };

  return (
    <div
      data-testid={testId}
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '12px',
        padding: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      }}
    >
      <h3 style={{ fontSize: '12px', fontWeight: 600, color: '#003B71', marginBottom: '8px' }}>
        {title}
      </h3>
      <div style={{ height: `${height}px` }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 20, right: 5, left: -20, bottom: 5 }}>
            <XAxis 
              dataKey="weekEnding" 
              tick={{ fontSize: 9, fill: '#6B7280' }}
              tickFormatter={formatWeekLabel}
              axisLine={false}
              tickLine={false}
              interval={0}
            />
            <YAxis 
              tick={{ fontSize: 9, fill: '#6B7280' }}
              axisLine={false}
              tickLine={false}
              width={35}
            />
            <Bar dataKey="value" fill="#003B71" radius={[4, 4, 0, 0]}>
              <LabelList 
                dataKey="value" 
                position="inside" 
                fill="#FFFFFF" 
                fontSize={9}
                fontWeight={600}
                formatter={formatValue}
              />
            </Bar>
            <Line 
              type="monotone" 
              dataKey="value" 
              stroke="#F36C21" 
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
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
  const initialArticle = params.get('article') || 'All Articles';
  
  const [selectedClient, setSelectedClient] = useState(initialClient);
  const [selectedArticle, setSelectedArticle] = useState(initialArticle);

  const { data } = useQuery({
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

  const handleExitVisit = () => {
    setLocation('/');
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F3F4F6' }}>
      {/* Header Section - Blue */}
      <div style={{ backgroundColor: '#003B71', padding: '16px' }}>
        {/* Navigation Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <button
            onClick={() => setLocation('/')}
            data-testid="button-back"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              color: 'rgba(255,255,255,0.8)',
              fontSize: '14px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <ArrowLeft style={{ width: '18px', height: '18px' }} />
            <span>Back</span>
          </button>
          
          {/* Centered Title */}
          <h1 
            style={{ 
              fontSize: '18px', 
              fontWeight: 700, 
              color: '#FFFFFF',
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%)',
            }}
            data-testid="text-page-title"
          >
            Store Overview
          </h1>
          
          <button
            onClick={handleExitVisit}
            data-testid="button-exit-visit"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              color: 'rgba(255,255,255,0.8)',
              fontSize: '14px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <LogOut style={{ width: '16px', height: '16px' }} />
            <span>Exit Visit</span>
          </button>
        </div>

        {/* Context Row - Rep and Store */}
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column',
          alignItems: 'center', 
          gap: '4px',
          marginBottom: '16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <User style={{ width: '14px', height: '14px', color: 'rgba(255,255,255,0.7)' }} />
            <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.9)' }} data-testid="text-rep-name">
              {rep}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <MapPin style={{ width: '14px', height: '14px', color: 'rgba(255,255,255,0.7)' }} />
            <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.9)' }} data-testid="text-store-name">
              {store}
            </span>
          </div>
        </div>

        {/* Filters Row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', marginBottom: '4px', display: 'block' }}>
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
            <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', marginBottom: '4px', display: 'block' }}>
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

        {/* VIEW TASKS Button */}
        <Button
          onClick={handleViewTasks}
          data-testid="button-view-tasks"
          style={{
            width: '100%',
            height: '48px',
            marginTop: '16px',
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

      {/* Content Section - Grey Background */}
      <div style={{ padding: '16px' }}>
        {/* KPI Tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
          <Tile label="Total SKUs" value={tiles.totalSKUs} testId="tile-total-skus" />
          <Tile label="Action Required" value={tiles.actionRequired} testId="tile-action-required" />
          <Tile label="Understock / OOS" value={tiles.understockOOS} testId="tile-understock-oos" />
          <Tile label="Overstock" value={tiles.overstock} testId="tile-overstock" />
        </div>

        {/* Charts Section */}
        {/* Row 1: Store SOH - Full Width */}
        <div style={{ marginBottom: '12px' }}>
          <ChartCard title="Store SOH" data={charts.storeSoh} testId="chart-store-soh" height={140} />
        </div>

        {/* Row 2: Sell Out and WFC - Side by Side */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <ChartCard title="Sell Out" data={charts.sellOutP4} testId="chart-sell-out" height={120} />
          <ChartCard title="WFC" data={charts.wfc} testId="chart-wfc" height={120} isWFC={true} />
        </div>
      </div>
    </div>
  );
}
