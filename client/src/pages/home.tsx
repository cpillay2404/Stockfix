import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  ClipboardList, CheckCircle2, Clock, Store, 
  ArrowRight, BarChart3, Upload, Users, Building2, TrendingUp, Filter, ChevronRight, X
} from "lucide-react";
import { useUserRole } from "@/hooks/use-user-role";

const CHART_COLORS = ['#f97316', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#ec4899'];

export default function Home() {
  const { role } = useUserRole();
  const [, setLocation] = useLocation();
  
  const [selectedRegion, setSelectedRegion] = useState("");
  const [selectedClient, setSelectedClient] = useState("");
  
  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard-stats", selectedRegion, selectedClient],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedRegion) params.set('region', selectedRegion);
      if (selectedClient) params.set('client', selectedClient);
      const res = await fetch(`/api/dashboard/stats?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    refetchInterval: 15000,
    refetchIntervalInBackground: true,
  });

  const hasActiveFilters = selectedRegion || selectedClient;

  const clearFilters = () => {
    setSelectedRegion("");
    setSelectedClient("");
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-6">
          <Skeleton className="h-16 w-full bg-slate-700" />
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
          <Skeleton className="h-64" />
        </div>
      </Layout>
    );
  }

  if (!stats) {
    return (
      <Layout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Failed to load dashboard</p>
        </div>
      </Layout>
    );
  }

  const completionRate = stats.totalTasks > 0 
    ? Math.round((stats.completedCount / stats.totalTasks) * 100) 
    : 0;

  return (
    <Layout>
      <div className="space-y-6 -mx-4 sm:-mx-6">
        {/* IZON Header Band */}
        <div className="bg-[#1e3a5f] text-white px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold tracking-tight">StockFix Dashboard</h1>
              <p className="text-blue-200 text-sm">Inventory Action & Feedback</p>
            </div>
            {role === 'manager' && (
              <div className="flex gap-2">
                <a href="/api/tasks/export" download>
                  <Button variant="secondary" size="sm" className="bg-white/10 hover:bg-white/20 text-white border-0">
                    Export
                  </Button>
                </a>
                <Link href="/import">
                  <Button variant="secondary" size="sm" className="bg-orange-500 hover:bg-orange-600 text-white border-0">
                    <Upload className="mr-1 h-4 w-4" />
                    Import
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>

        <div className="px-4 space-y-6">
          {/* Z2 - KPI BAND (4 big metric cards) */}
          <div className="grid grid-cols-2 gap-3">
            <Link href="/tasks">
              <div className="bg-white rounded-xl shadow-md p-4 border border-gray-100 hover:shadow-lg transition-shadow cursor-pointer" data-testid="kpi-total-tasks">
                <div className="flex items-center gap-2 text-gray-500 mb-1">
                  <ClipboardList className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wide">Total Tasks</span>
                </div>
                <div className="text-3xl font-bold text-[#1e3a5f] font-mono">
                  {stats.totalTasks.toLocaleString()}
                </div>
              </div>
            </Link>

            <Link href="/tasks?status=pending">
              <div className="bg-white rounded-xl shadow-md p-4 border border-gray-100 hover:shadow-lg transition-shadow cursor-pointer" data-testid="kpi-pending">
                <div className="flex items-center gap-2 text-gray-500 mb-1">
                  <Clock className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wide">Pending</span>
                </div>
                <div className="text-3xl font-bold text-orange-500 font-mono">
                  {stats.pendingCount.toLocaleString()}
                </div>
              </div>
            </Link>

            <Link href="/tasks?status=completed">
              <div className="bg-white rounded-xl shadow-md p-4 border border-gray-100 hover:shadow-lg transition-shadow cursor-pointer" data-testid="kpi-completed">
                <div className="flex items-center gap-2 text-gray-500 mb-1">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wide">Completed</span>
                </div>
                <div className="text-3xl font-bold text-green-600 font-mono">
                  {stats.completedCount.toLocaleString()}
                </div>
              </div>
            </Link>

            <div className="bg-white rounded-xl shadow-md p-4 border border-gray-100" data-testid="kpi-p4sales">
              <div className="flex items-center gap-2 text-gray-500 mb-1">
                <TrendingUp className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wide">P4 Sales</span>
              </div>
              <div className="text-3xl font-bold text-[#1e3a5f] font-mono">
                {stats.totalP4WeekSales >= 1000 
                  ? `${(stats.totalP4WeekSales / 1000).toFixed(0)}K` 
                  : stats.totalP4WeekSales.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Quick Filters */}
          <div className="bg-white rounded-xl shadow-md p-4 border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-gray-700">
                <Filter className="h-4 w-4" />
                <span className="text-sm font-semibold">Quick Filters</span>
              </div>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 px-2 text-gray-500">
                  <X className="h-3 w-3 mr-1" />
                  Clear
                </Button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Select value={selectedRegion || "__all__"} onValueChange={(v) => setSelectedRegion(v === "__all__" ? "" : v)}>
                <SelectTrigger className="text-sm h-9">
                  <SelectValue placeholder="Region" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Regions</SelectItem>
                  {stats?.filters?.regions?.map(region => (
                    <SelectItem key={region} value={region}>{region}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedClient || "__all__"} onValueChange={(v) => setSelectedClient(v === "__all__" ? "" : v)}>
                <SelectTrigger className="text-sm h-9">
                  <SelectValue placeholder="Client" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Clients</SelectItem>
                  {stats?.filters?.clients?.map(client => (
                    <SelectItem key={client} value={client}>{client}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select 
                value="__all__" 
                onValueChange={(v) => {
                  if (v !== "__all__") {
                    setLocation(`/store/${encodeURIComponent(v)}`);
                  }
                }}
              >
                <SelectTrigger className="text-sm h-9">
                  <SelectValue placeholder="Store →" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Select Store</SelectItem>
                  {stats?.filters?.stores?.slice(0, 100).map(store => (
                    <SelectItem key={store} value={store}>{store}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Z3 - Actions by Type */}
          <div className="bg-white rounded-xl shadow-md p-4 border border-gray-100">
            <div className="flex items-center gap-2 text-gray-700 mb-3">
              <BarChart3 className="h-4 w-4" />
              <span className="text-sm font-semibold">Actions by Type</span>
            </div>
            {stats.actionBreakdown.length > 0 ? (
              <div className="space-y-2">
                {stats.actionBreakdown.slice(0, 6).map((item, index) => {
                  const maxCount = Math.max(...stats.actionBreakdown.slice(0, 6).map(a => a.count));
                  const percentage = (item.count / maxCount) * 100;
                  return (
                    <div key={item.action} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-700 font-medium">{item.action}</span>
                        <span className="text-orange-600 font-bold font-mono">{item.count.toLocaleString()}</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full rounded-full transition-all"
                          style={{ 
                            width: `${percentage}%`,
                            backgroundColor: CHART_COLORS[index % CHART_COLORS.length]
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-8">No action data available</p>
            )}
          </div>

          {/* Z4 - Top 5 Stores (Clickable Tiles) */}
          <div className="bg-white rounded-xl shadow-md p-4 border border-gray-100">
            <div className="flex items-center gap-2 text-gray-700 mb-3">
              <Store className="h-4 w-4" />
              <span className="text-sm font-semibold">Top 5 Stores by Tasks</span>
            </div>
            <div className="space-y-2">
              {stats.topStores.length > 0 ? (
                stats.topStores.map((store, index) => (
                  <Link key={store.name} href={`/store/${encodeURIComponent(store.name)}`}>
                    <div 
                      className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-orange-50 border border-gray-100 hover:border-orange-200 transition-all cursor-pointer group"
                      data-testid={`tile-store-${index}`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div 
                          className="h-8 w-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 bg-[#1e3a5f]"
                        >
                          {index + 1}
                        </div>
                        <span className="text-sm font-medium truncate text-gray-700">{store.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-lg font-bold text-orange-500 font-mono">
                          {store.count.toLocaleString()}
                        </span>
                        <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-orange-500 transition-colors" />
                      </div>
                    </div>
                  </Link>
                ))
              ) : (
                <p className="text-muted-foreground text-sm text-center py-4">No store data available</p>
              )}
            </div>
          </div>

          {/* Z5 - Top 5 Reps (Clickable Tiles) */}
          <div className="bg-white rounded-xl shadow-md p-4 border border-gray-100">
            <div className="flex items-center gap-2 text-gray-700 mb-3">
              <Users className="h-4 w-4" />
              <span className="text-sm font-semibold">Top 5 Reps by Tasks</span>
            </div>
            <div className="space-y-2">
              {stats.topReps.length > 0 ? (
                stats.topReps.map((rep, index) => (
                  <Link key={rep.name} href={`/tasks?rep=${encodeURIComponent(rep.name)}`}>
                    <div 
                      className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-orange-50 border border-gray-100 hover:border-orange-200 transition-all cursor-pointer group"
                      data-testid={`tile-rep-${index}`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div 
                          className="h-8 w-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 bg-[#1e3a5f]"
                        >
                          {index + 1}
                        </div>
                        <span className="text-sm font-medium truncate text-gray-700">{rep.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-lg font-bold text-orange-500 font-mono">
                          {rep.count.toLocaleString()}
                        </span>
                        <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-orange-500 transition-colors" />
                      </div>
                    </div>
                  </Link>
                ))
              ) : (
                <p className="text-muted-foreground text-sm text-center py-4">No rep data available</p>
              )}
            </div>
          </div>

          {/* Z6 - Client Overview (Card Grid) */}
          <div className="bg-white rounded-xl shadow-md p-4 border border-gray-100">
            <div className="flex items-center gap-2 text-gray-700 mb-3">
              <Building2 className="h-4 w-4" />
              <span className="text-sm font-semibold">Clients Overview</span>
            </div>
            {stats.clients.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {stats.clients.map((client) => (
                  <Link key={client.name} href={`/tasks?client=${encodeURIComponent(client.name)}`}>
                    <div 
                      className="p-3 rounded-lg bg-gray-50 hover:bg-orange-50 border border-gray-100 hover:border-orange-200 transition-all cursor-pointer"
                      data-testid={`tile-client-${client.name}`}
                    >
                      <div className="text-xs text-gray-500 uppercase tracking-wide">{client.name}</div>
                      <div className="text-xl font-bold text-[#1e3a5f] font-mono">{client.count.toLocaleString()}</div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-4">No client data available</p>
            )}
          </div>

          {/* Main CTA Button */}
          <Link href="/tasks" className="block">
            <Button className="w-full bg-[#1e3a5f] hover:bg-[#2d4a6f]" size="lg" data-testid="button-view-all-tasks">
              View All Tasks
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </Layout>
  );
}
