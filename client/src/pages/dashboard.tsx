import { useState, useEffect, useMemo, memo } from "react";
import { Link, useSearch, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchTasks } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, ArrowLeft, LogOut, User, MapPin, ChevronDown, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Task } from "@shared/schema";
import BottomNav from "@/components/BottomNav";
import { useAccess } from "@/context/AccessContext";

const ACTION_PRIORITY_ORDER = [
  "URGENT: PLACE ORDER DC HAS STOCK",
  "Urgent: Place Order - DC has stock",
  "NEGATIVE SOH: FIX COUNT",
  "Fix Counts: Negative SOH",
  "CHECK COUNT: NO SALES IN 30 DAYS",
  "Check Count: No Sales in 30 Days",
  "Urgent: DC OOS",
  "OOS – Stock on Order",
  "Review: Risk of OOS",
  "Monitor: Possible Overstock",
  "Optimal",
];

const getActionColor = (action: string) => {
  const actionLower = action.toLowerCase();
  if (actionLower.includes('negative') || actionLower.includes('fix count')) return '#DC2626';
  if (actionLower.includes('urgent') || actionLower.includes('place order')) return '#DC2626';
  if (actionLower.includes('dc oos')) return '#DC2626';
  if (actionLower.includes('oos') || actionLower.includes('stock on order')) return '#F97316';
  if (actionLower.includes('risk')) return '#F97316';
  if (actionLower.includes('check count') || actionLower.includes('no sales')) return '#F97316';
  if (actionLower.includes('overstock') || actionLower.includes('monitor')) return '#3B82F6';
  if (actionLower.includes('optimal')) return '#22C55E';
  return '#6B7280';
};

interface TaskCardProps {
  task: Task;
  contextParams: string;
  style?: React.CSSProperties;
}

const cardStyles = {
  card: { backgroundColor: '#FFFFFF', borderRadius: '10px', padding: '12px 14px', cursor: 'pointer', marginBottom: '8px' } as const,
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } as const,
  left: { flex: 1, marginRight: '10px' } as const,
  title: { fontSize: '14px', fontWeight: 600, color: '#1F2937', marginBottom: '2px', lineHeight: 1.3 } as const,
  barcode: { fontSize: '11px', fontFamily: 'monospace', color: '#6B7280', marginBottom: '4px' } as const,
  client: { fontSize: '12px', color: '#6B7280' } as const,
  right: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' } as const,
  wfc: { fontSize: '11px', color: '#6B7280', fontWeight: 500 } as const,
};

const TaskCard = memo(function TaskCard({ task, contextParams, style }: TaskCardProps) {
  const isPending = task.actionStatus === 'Pending';
  const wfc = parseFloat(task.storeWfc);
  const hasWfc = !isNaN(wfc) && wfc > 0;
  const taskUrl = contextParams ? `/task/${task.uniqueId}?${contextParams}` : `/task/${task.uniqueId}`;

  return (
    <div style={style}>
      <Link href={taskUrl} data-testid={`task-card-${task.uniqueId}`}>
        <div style={cardStyles.card}>
          <div style={cardStyles.row}>
            <div style={cardStyles.left}>
              <h3 style={cardStyles.title}>{task.articleDescription}</h3>
              <div style={cardStyles.barcode}>{task.barcode}</div>
              <span style={cardStyles.client}>{task.client}</span>
            </div>
            <div style={cardStyles.right as React.CSSProperties}>
              {hasWfc && <span style={cardStyles.wfc}>{`WFC: ${wfc.toFixed(1)}`}</span>}
              <Badge 
                variant={isPending ? 'outline' : 'secondary'}
                className={isPending ? 'text-[10px] bg-transparent text-gray-400 border border-gray-200' : 'text-[10px] bg-green-100 text-green-600 border-0'}
              >
                {task.actionStatus}
              </Badge>
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
});

interface ActionSectionProps {
  action: string;
  tasks: Task[];
  contextParams: string;
}

const sectionStyles = {
  container: { marginBottom: '16px' } as const,
  header: { display: 'flex', alignItems: 'center', marginBottom: '8px', paddingLeft: '4px' } as const,
  indicator: { width: '5px', height: '20px', borderRadius: '2px', marginRight: '10px' } as const,
  title: { fontSize: '14px', fontWeight: 700, color: '#003B71' } as const,
};

const ActionSection = memo(function ActionSection({ action, tasks, contextParams }: ActionSectionProps) {
  const color = getActionColor(action);
  const [showAll, setShowAll] = useState(false);
  const initialLimit = 15;
  const displayedTasks = showAll ? tasks : tasks.slice(0, initialLimit);
  const hasMore = tasks.length > initialLimit;
  
  return (
    <div style={sectionStyles.container} data-testid={`section-${action.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`}>
      <div style={sectionStyles.header}>
        <div style={{ ...sectionStyles.indicator, backgroundColor: color }} />
        <span style={sectionStyles.title}>{action} ({tasks.length})</span>
      </div>
      
      <div>
        {displayedTasks.map((task) => (
          <TaskCard key={task.uniqueId} task={task} contextParams={contextParams} />
        ))}
      </div>
      
      {hasMore && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full py-2 text-sm text-[#003B71] font-medium flex items-center justify-center gap-1 hover:bg-gray-50 rounded-lg"
        >
          Show {tasks.length - initialLimit} more <ChevronDown className="w-4 h-4" />
        </button>
      )}
    </div>
  );
});

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const urlParams = useMemo(() => new URLSearchParams(searchString), [searchString]);
  const { accessMode, clientLocked, clearAll, selectedClient: contextClient, selectedStore: contextStore } = useAccess();
  
  const isClientMode = accessMode === 'client' && clientLocked;
  
  useEffect(() => {
    if (isClientMode && (!contextClient || !contextStore)) {
      setLocation('/select-client');
    }
  }, [isClientMode, contextClient, contextStore, setLocation]);
  
  const repFilter = isClientMode ? '' : (urlParams.get('rep') || '');
  const storeFilter = isClientMode && contextStore ? contextStore : (urlParams.get('store') || '');
  const clientFilter = isClientMode && contextClient ? contextClient : (urlParams.get('client') || '');
  const articleFilter = urlParams.get('article') || '';
  const issueFilter = urlParams.get('issue') || '';

  const [filter, setFilter] = useState<"pending" | "completed">("pending");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
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
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: summary } = useQuery({
    queryKey: ["task-summary", repFilter, storeFilter, clientFilter, articleFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (repFilter) params.set('rep', repFilter);
      if (storeFilter) params.set('store', storeFilter);
      if (clientFilter) params.set('client', clientFilter);
      if (articleFilter) params.set('article', articleFilter);
      const res = await fetch(`/api/tasks/summary?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch summary");
      return res.json();
    },
    staleTime: 30000,
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });

  const { data, isLoading } = useQuery({
    queryKey: ["tasks", 1, debouncedSearch, filter, repFilter, storeFilter, clientFilter, articleFilter],
    queryFn: () => fetchTasks(1, 500, debouncedSearch, filter, {
      rep: repFilter,
      store: storeFilter,
      client: clientFilter,
      article: articleFilter,
    }),
    staleTime: 30000,
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });

  const allTasks: Task[] = data?.tasks || [];
  
  const filteredTasks = useMemo(() => {
    let tasks = allTasks;
    
    if (debouncedSearch) {
      const searchLower = debouncedSearch.toLowerCase();
      tasks = tasks.filter(t => 
        t.articleDescription?.toLowerCase().includes(searchLower) ||
        t.barcode?.toLowerCase().includes(searchLower) ||
        t.storeName?.toLowerCase().includes(searchLower) ||
        t.client?.toLowerCase().includes(searchLower)
      );
    }
    
    if (issueFilter === 'action') {
      tasks = tasks.filter(t => t.stockClassification !== 'Optimal');
    } else if (issueFilter === 'understock') {
      tasks = tasks.filter(t => 
        ['Understock', 'OOS', 'Out of Stock'].includes(t.stockClassification || '')
      );
    } else if (issueFilter === 'overstock') {
      tasks = tasks.filter(t => t.stockClassification === 'Overstock');
    }
    
    return tasks;
  }, [allTasks, debouncedSearch, issueFilter]);

  const groupedTasks = useMemo(() => {
    const groups: Record<string, Task[]> = {};
    
    for (const task of filteredTasks) {
      const action = task.action || 'Unknown';
      if (!groups[action]) {
        groups[action] = [];
      }
      groups[action].push(task);
    }
    
    const orderedGroups = ACTION_PRIORITY_ORDER
      .filter(action => groups[action] && groups[action].length > 0)
      .map(action => ({
        action,
        tasks: groups[action],
      }));
    
    const otherActions = Object.keys(groups)
      .filter(action => !ACTION_PRIORITY_ORDER.includes(action))
      .sort();
    
    for (const action of otherActions) {
      if (groups[action] && groups[action].length > 0) {
        orderedGroups.push({ action, tasks: groups[action] });
      }
    }
    
    return orderedGroups;
  }, [filteredTasks]);

  const displayedPendingCount = summary?.pendingCountExcludingOptimal ?? summary?.pendingCount ?? 0;

  const formatWeekEnding = (dateStr: string | null) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  const handleBack = () => {
    const params = new URLSearchParams();
    if (repFilter) params.set('rep', repFilter);
    if (storeFilter) params.set('store', storeFilter);
    if (clientFilter) params.set('client', clientFilter);
    if (articleFilter) params.set('article', articleFilter);
    setLocation(`/store-overview?${params.toString()}`);
  };

  const handleExitVisit = () => {
    const params = new URLSearchParams();
    if (repFilter) params.set('rep', repFilter);
    if (storeFilter) params.set('store', storeFilter);
    if (clientFilter) params.set('client', clientFilter);
    if (articleFilter) params.set('article', articleFilter);
    setLocation(`/exit-visit?${params.toString()}`);
  };

  const contextParams = useMemo(() => {
    const params = new URLSearchParams();
    if (repFilter) params.set('rep', repFilter);
    if (storeFilter) params.set('store', storeFilter);
    if (clientFilter) params.set('client', clientFilter);
    if (articleFilter) params.set('article', articleFilter);
    return params.toString();
  }, [repFilter, storeFilter, clientFilter, articleFilter]);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F3F4F6', paddingBottom: '120px' }}>
      {/* Header Section - Blue */}
      <div style={{ backgroundColor: '#003B71', padding: '16px', paddingBottom: '12px' }}>
        {/* Navigation Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', position: 'relative' }}>
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
                color: 'rgba(255,255,255,0.85)',
                fontSize: '14px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              <LogOut style={{ width: '18px', height: '18px' }} />
              <span>Logout</span>
            </button>
          ) : (
            <button
              onClick={handleBack}
              data-testid="button-back"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                color: 'rgba(255,255,255,0.85)',
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
          )}
          
          {/* Centered Title */}
          <h1 
            style={{ 
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%)',
              fontSize: '18px', 
              fontWeight: 600, 
              color: '#FFFFFF',
              margin: 0,
            }}
          >
            Tasks
          </h1>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
              <RefreshCw style={{ width: '16px', height: '16px', animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            </button>
            <button
              onClick={handleExitVisit}
              data-testid="button-exit-visit"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                color: 'rgba(255,255,255,0.85)',
                fontSize: '14px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              <LogOut style={{ width: '16px', height: '16px' }} />
              <span>Close & Sync</span>
            </button>
          </div>
        </div>

        {/* Rep and Store Context Row - Centered */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center', marginBottom: '4px' }}>
          {repFilter && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <User style={{ width: '13px', height: '13px', color: 'rgba(255,255,255,0.7)' }} />
              <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.9)' }}>{repFilter}</span>
            </div>
          )}
          {storeFilter && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <MapPin style={{ width: '13px', height: '13px', color: 'rgba(255,255,255,0.7)' }} />
              <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.9)' }}>{storeFilter}</span>
            </div>
          )}
        </div>

        {/* Week Ending */}
        {summary?.latestWeekEnding && (
          <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', textAlign: 'center', margin: '4px 0 0 0' }}>
            Week Ending: {formatWeekEnding(summary.latestWeekEnding)}
          </p>
        )}
      </div>

      {/* Content Section - Light Grey Background */}
      <div style={{ padding: '16px' }}>
        {/* Search and Filter Card - White */}
        <div 
          style={{ 
            backgroundColor: '#FFFFFF', 
            borderRadius: '12px', 
            padding: '12px',
            marginBottom: '16px',
          }}
        >
          <div style={{ position: 'relative', marginBottom: '10px' }}>
            <Search style={{ 
              position: 'absolute', 
              left: '12px', 
              top: '50%', 
              transform: 'translateY(-50%)',
              width: '16px', 
              height: '16px', 
              color: '#9CA3AF' 
            }} />
            <Input
              placeholder="Search article, barcode, client..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search"
              style={{ 
                paddingLeft: '38px', 
                height: '40px', 
                fontSize: '14px',
                backgroundColor: '#F9FAFB',
                border: '1px solid #E5E7EB',
                borderRadius: '8px',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              variant={filter === "pending" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("pending")}
              style={{ 
                borderRadius: '20px', 
                fontSize: '13px',
                backgroundColor: filter === "pending" ? '#003B71' : 'transparent',
                color: filter === "pending" ? '#FFFFFF' : '#374151',
                border: filter === "pending" ? 'none' : '1px solid #D1D5DB',
                flex: 1,
                height: '36px',
              }}
              data-testid="button-filter-pending"
            >
              Pending ({displayedPendingCount})
            </Button>
            <Button
              variant={filter === "completed" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("completed")}
              style={{ 
                borderRadius: '20px', 
                fontSize: '13px',
                backgroundColor: filter === "completed" ? '#003B71' : 'transparent',
                color: filter === "completed" ? '#FFFFFF' : '#374151',
                border: filter === "completed" ? 'none' : '1px solid #D1D5DB',
                flex: 1,
                height: '36px',
              }}
              data-testid="button-filter-completed"
            >
              Completed ({summary?.completedCount || 0})
            </Button>
          </div>
        </div>

        {/* Task Sections */}
        {isLoading ? (
          <>
            <Skeleton style={{ height: '28px', width: '200px', borderRadius: '4px', backgroundColor: '#E5E7EB', marginBottom: '8px' }} />
            <Skeleton style={{ height: '70px', borderRadius: '10px', backgroundColor: '#E5E7EB', marginBottom: '8px' }} />
            <Skeleton style={{ height: '70px', borderRadius: '10px', backgroundColor: '#E5E7EB', marginBottom: '16px' }} />
            <Skeleton style={{ height: '28px', width: '180px', borderRadius: '4px', backgroundColor: '#E5E7EB', marginBottom: '8px' }} />
            <Skeleton style={{ height: '70px', borderRadius: '10px', backgroundColor: '#E5E7EB' }} />
          </>
        ) : groupedTasks.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '48px 16px',
            color: '#6B7280',
          }}>
            <p>No tasks found matching your criteria.</p>
          </div>
        ) : (
          groupedTasks.map(({ action, tasks }) => (
            <ActionSection 
              key={action} 
              action={action} 
              tasks={tasks} 
              contextParams={contextParams}
            />
          ))
        )}
      </div>

      {/* Proceed to Summary Button - Only show when rep has completed tasks */}
      {(summary?.completedCount || 0) > 0 && (
        <div style={{
          position: 'fixed',
          bottom: '68px',
          left: '16px',
          right: '16px',
          zIndex: 999,
        }}>
          <Button
            onClick={() => {
              const params = new URLSearchParams();
              if (repFilter) params.set('rep', repFilter);
              if (storeFilter) params.set('store', storeFilter);
              if (clientFilter) params.set('client', clientFilter);
              setLocation(`/exit-visit?${params.toString()}`);
            }}
            data-testid="proceed-to-summary-button"
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
            PROCEED TO SUMMARY
          </Button>
        </div>
      )}

      {/* Bottom Navigation */}
      <BottomNav 
        rep={repFilter} 
        store={storeFilter} 
        client={clientFilter}
      />
    </div>
  );
}
