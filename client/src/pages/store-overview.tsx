import { useState, useEffect, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Check, ChevronDown, ArrowLeft, LogOut, User, MapPin, AlertTriangle, ChevronRight, TrendingUp, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { ComposedChart, Bar, Line, XAxis, YAxis, ResponsiveContainer, LabelList } from "recharts";
import BottomNav from "@/components/BottomNav";
import { useAccess } from "@/context/AccessContext";
import { TopAttentionModal } from "@/components/TopAttentionModal";

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
        <Command shouldFilter={false}>
          <CommandInput placeholder={`Search...`} value={search} onValueChange={setSearch} />
          <CommandList style={{ maxHeight: '250px', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
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
  accentColor: string;
  valueColor: string;
  onClick?: () => void;
}

function Tile({ label, value, testId, accentColor, onClick }: TileProps) {
  return (
    <div
      data-testid={testId}
      onClick={onClick}
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '8px',
        padding: '8px 4px',
        height: '56px',
        borderTop: `3px solid ${accentColor}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        minWidth: 0,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <span style={{ fontSize: '20px', fontWeight: 800, color: '#003B71', fontFamily: 'monospace', lineHeight: 1 }}>
        {value}
      </span>
      <span style={{ 
        fontSize: '9px', 
        color: '#6B7280', 
        textAlign: 'center', 
        marginTop: '3px',
        lineHeight: 1.1,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: '100%',
        textTransform: 'uppercase',
        letterSpacing: '0.3px',
      }}>
        {label}
      </span>
    </div>
  );
}

interface ChartCardProps {
  title: string;
  data: { weekEnding: string; value: number }[];
  testId: string;
  isWFC?: boolean;
}

function ChartCard({ title, data, testId, isWFC = false }: ChartCardProps) {
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
        borderRadius: '10px',
        padding: '10px',
        boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
        marginBottom: '8px',
      }}
    >
      <h3 style={{ fontSize: '12px', fontWeight: 600, color: '#003B71', marginBottom: '4px' }}>
        {title}
      </h3>
      <div style={{ height: '120px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 20, right: 10, left: -15, bottom: 5 }}>
            <XAxis 
              dataKey="weekEnding" 
              tick={{ fontSize: 10, fill: '#6B7280' }}
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
                position="top" 
                fill="#003B71" 
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
  const { accessMode, clientLocked, clearAll, selectedClient: contextClient, selectedStore: contextStore } = useAccess();
  
  const isClientMode = accessMode === 'client' && clientLocked;
  
  useEffect(() => {
    if (isClientMode && (!contextClient || !contextStore)) {
      setLocation('/select-client');
    }
  }, [isClientMode, contextClient, contextStore, setLocation]);
  
  const rep = isClientMode ? '' : (params.get('rep') || '');
  const store = isClientMode && contextStore ? contextStore : (params.get('store') || '');
  
  const initialClient = isClientMode && contextClient 
    ? contextClient 
    : (params.get('client') || 'All Clients');
  const initialArticle = params.get('article') || 'All Articles';
  
  const [selectedClient, setSelectedClient] = useState(initialClient);
  const [selectedArticle, setSelectedArticle] = useState(initialArticle);
  const [showAttentionModal, setShowAttentionModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const queryClient = useQueryClient();

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch('/api/admin/clear-cache', { method: 'POST' });
      queryClient.invalidateQueries();
    } catch (e) {
      console.error('Failed to refresh', e);
    }
    setRefreshing(false);
  };

  useEffect(() => {
    if (!sessionStorage.getItem('visitStartTime')) {
      sessionStorage.setItem('visitStartTime', new Date().toISOString());
    }
  }, []);

  const { data } = useQuery({
    queryKey: ["store-overview", rep, store, selectedClient, selectedArticle],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (rep) params.set('rep', rep);
      if (store) params.set('store', store);
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
    staleTime: 30000,
    refetchInterval: 30000, // Auto-refresh every 30 seconds
    enabled: !!store,
  });

  const { data: taskSummary } = useQuery({
    queryKey: ["task-summary-visit", rep, store, selectedClient],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (rep) params.set('rep', rep);
      if (store) params.set('store', store);
      if (selectedClient && selectedClient !== 'All Clients') {
        params.set('client', selectedClient);
      }
      const res = await fetch(`/api/tasks/summary?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch task summary");
      return res.json();
    },
    staleTime: 30000,
    enabled: !!store,
  });

  const { data: attentionData } = useQuery({
    queryKey: ["top-attention-skus", rep, store, selectedClient, selectedArticle],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (rep) params.set('rep', rep);
      if (store) params.set('store', store);
      if (selectedClient && selectedClient !== 'All Clients') {
        params.set('client', selectedClient);
      }
      if (selectedArticle && selectedArticle !== 'All Articles') {
        params.set('article', selectedArticle);
      }
      const res = await fetch(`/api/top-attention-skus?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch top attention SKUs");
      return res.json();
    },
    enabled: !!store,
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
  const actionCount = tiles.actionRequired || 0;

  const handleExitVisit = () => {
    const params = new URLSearchParams();
    if (rep) params.set('rep', rep);
    if (store) params.set('store', store);
    setLocation(`/exit-visit?${params.toString()}`);
  };

  const handleTileClick = (issueFilter: string) => {
    const taskParams = new URLSearchParams();
    if (rep) taskParams.set('rep', rep);
    if (store) taskParams.set('store', store);
    if (selectedClient && selectedClient !== 'All Clients') {
      taskParams.set('client', selectedClient);
    }
    taskParams.set('issue', issueFilter);
    setLocation(`/tasks?${taskParams.toString()}`);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F3F4F6', paddingBottom: '140px' }}>
      {/* Header Section - Blue */}
      <div style={{ backgroundColor: '#003B71', padding: '16px' }}>
        {/* Navigation Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', position: 'relative' }}>
          {isClientMode ? (
            <button
              onClick={() => {
                clearAll();
                setLocation('/');
              }}
              data-testid="button-logout"
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
                zIndex: 1,
              }}
            >
              <LogOut style={{ width: '18px', height: '18px' }} />
              <span>Logout</span>
            </button>
          ) : (
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
                zIndex: 1,
              }}
            >
              <ArrowLeft style={{ width: '18px', height: '18px' }} />
              <span>Back</span>
            </button>
          )}
          
          <h1 
            style={{ 
              fontSize: '17px', 
              fontWeight: 700, 
              color: '#FFFFFF',
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%)',
              margin: 0,
            }}
            data-testid="text-page-title"
          >
            Store Overview
          </h1>
          
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            data-testid="button-refresh"
            style={{
              display: 'flex',
              alignItems: 'center',
              color: 'rgba(255,255,255,0.85)',
              background: 'none',
              border: 'none',
              cursor: refreshing ? 'wait' : 'pointer',
              padding: '4px',
              opacity: refreshing ? 0.6 : 1,
            }}
          >
            <RefreshCw style={{ width: '18px', height: '18px', animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>

        {/* Context Row - Rep and Store */}
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column',
          alignItems: 'center', 
          gap: '3px',
          marginBottom: '8px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <User style={{ width: '14px', height: '14px', color: 'rgba(255,255,255,0.7)' }} />
            <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.9)' }} data-testid="text-rep-name">
              {rep}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <MapPin style={{ width: '14px', height: '14px', color: 'rgba(255,255,255,0.7)' }} />
            <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.9)' }} data-testid="text-store-name">
              {store}
            </span>
          </div>
        </div>

        {/* Filters Row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
          <div>
            <label style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', marginBottom: '3px', display: 'block' }}>
              Client
            </label>
            {isClientMode ? (
              <div
                data-testid="text-client-locked"
                style={{
                  width: '100%',
                  height: '40px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.3)',
                  fontSize: '14px',
                  color: '#FFFFFF',
                  backgroundColor: 'rgba(255,255,255,0.15)',
                  padding: '0 12px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {selectedClient}
              </div>
            ) : (
              <SearchableSelect
                value={selectedClient}
                onValueChange={setSelectedClient}
                options={clientOptions}
                placeholder="All Clients"
                testId="select-client-filter"
              />
            )}
          </div>
          <div>
            <label style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', marginBottom: '3px', display: 'block' }}>
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

      </div>

      {/* Visit Actions Strip */}
      <div style={{ padding: '10px 16px 0' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '8px',
        }}>
          {/* Critical SKUs Tile */}
          <div
            data-testid="visit-tile-critical"
            onClick={() => setShowAttentionModal(true)}
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '10px',
              padding: '10px 8px',
              borderTop: '3px solid #DC2626',
              cursor: 'pointer',
              boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span style={{ fontSize: '10px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
              Critical SKUs
            </span>
            <span style={{ fontSize: '22px', fontWeight: 800, color: '#DC2626', fontFamily: 'monospace', lineHeight: 1 }}>
              {attentionData?.skus?.length || 0}
            </span>
            <span style={{
              fontSize: '10px',
              fontWeight: 600,
              color: '#FFFFFF',
              backgroundColor: '#DC2626',
              borderRadius: '10px',
              padding: '2px 10px',
              marginTop: '2px',
            }}>
              Open
            </span>
          </div>

          {/* Tasks Tile */}
          <div
            data-testid="visit-tile-tasks"
            onClick={handleViewTasks}
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '10px',
              padding: '10px 8px',
              borderTop: '3px solid #F36C21',
              cursor: 'pointer',
              boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span style={{ fontSize: '10px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
              Tasks
            </span>
            <span style={{ fontSize: '22px', fontWeight: 800, color: '#F36C21', fontFamily: 'monospace', lineHeight: 1 }}>
              {taskSummary?.pendingCount || 0}
            </span>
            <span style={{
              fontSize: '10px',
              fontWeight: 600,
              color: '#FFFFFF',
              backgroundColor: '#F36C21',
              borderRadius: '10px',
              padding: '2px 10px',
              marginTop: '2px',
            }}>
              View
            </span>
          </div>

        </div>
      </div>

      {/* Charts Section */}
      <div style={{ padding: '12px 16px' }}>
        <ChartCard title="Store SOH" data={charts.storeSoh} testId="chart-store-soh" />
        <ChartCard title="Sell Out" data={charts.sellOutP4} testId="chart-sell-out" />
        <ChartCard title="WFC" data={charts.wfc} testId="chart-wfc" isWFC={true} />
      </div>

      {/* Sticky Footer - Buttons above bottom nav */}
      <div style={{
        position: 'fixed',
        bottom: '56px',
        left: 0,
        right: 0,
        padding: '12px 16px',
        backgroundColor: '#FFFFFF',
        boxShadow: '0 -2px 10px rgba(0,0,0,0.1)',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}>
        <Button
          onClick={handleViewTasks}
          data-testid="button-view-tasks"
          style={{
            width: '100%',
            height: '48px',
            backgroundColor: '#F36C21',
            color: '#FFFFFF',
            fontSize: '16px',
            fontWeight: 600,
            borderRadius: '10px',
          }}
          className="hover:bg-[#E05A10]"
        >
          VIEW TASKS ({actionCount})
        </Button>
      </div>

      {/* Top Attention SKUs Modal */}
      <TopAttentionModal
        open={showAttentionModal}
        onOpenChange={setShowAttentionModal}
        skus={attentionData?.skus || []}
        rep={rep}
        store={store}
        client={selectedClient}
      />

      {/* Bottom Navigation */}
      <BottomNav 
        rep={rep} 
        store={store} 
        client={selectedClient}
      />
    </div>
  );
}
