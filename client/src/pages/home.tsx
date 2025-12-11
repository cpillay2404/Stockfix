import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { fetchDashboardStats } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  ClipboardList, CheckCircle2, Clock, Store, 
  ArrowRight, BarChart3, Upload, Users, Building2, TrendingUp, Layers, Filter, MapPin, Play
} from "lucide-react";
import { useUserRole } from "@/hooks/use-user-role";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function Home() {
  const { role } = useUserRole();
  const [, setLocation] = useLocation();
  
  const [selectedRegion, setSelectedRegion] = useState("");
  const [selectedRep, setSelectedRep] = useState("");
  const [selectedStore, setSelectedStore] = useState("");
  const [selectedClient, setSelectedClient] = useState("");
  const [selectedIssueType, setSelectedIssueType] = useState("");
  
  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: fetchDashboardStats,
  });

  const handleFilterApply = () => {
    const params = new URLSearchParams();
    if (selectedRegion) params.set('region', selectedRegion);
    if (selectedRep) params.set('rep', selectedRep);
    if (selectedStore) params.set('store', selectedStore);
    if (selectedClient) params.set('client', selectedClient);
    if (selectedIssueType) params.set('issue', selectedIssueType);
    setLocation(`/tasks?${params.toString()}`);
  };

  const hasActiveFilters = selectedRegion || selectedRep || selectedStore || selectedClient || selectedIssueType;

  const clearFilters = () => {
    setSelectedRegion("");
    setSelectedRep("");
    setSelectedStore("");
    setSelectedClient("");
    setSelectedIssueType("");
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
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
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground text-sm">Overview of your inventory actions</p>
          </div>
          {role === 'manager' && (
            <div className="flex gap-2">
              <a href="/api/tasks/export" download>
                <Button variant="outline" size="sm">
                  <ArrowRight className="mr-2 h-4 w-4 rotate-90" />
                  Export
                </Button>
              </a>
              <Link href="/import">
                <Button variant="outline" size="sm">
                  <Upload className="mr-2 h-4 w-4" />
                  Import
                </Button>
              </Link>
            </div>
          )}
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Quick Filters
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Select value={selectedRegion || "__all__"} onValueChange={(v) => setSelectedRegion(v === "__all__" ? "" : v)}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Region" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Regions</SelectItem>
                  {stats?.filters?.regions?.map(region => (
                    <SelectItem key={region} value={region}>{region}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedRep || "__all__"} onValueChange={(v) => setSelectedRep(v === "__all__" ? "" : v)}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Rep" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Reps</SelectItem>
                  {stats?.filters?.reps?.map(rep => (
                    <SelectItem key={rep} value={rep}>{rep}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedStore || "__all__"} onValueChange={(v) => setSelectedStore(v === "__all__" ? "" : v)}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Store" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Stores</SelectItem>
                  {stats?.filters?.stores?.slice(0, 100).map(store => (
                    <SelectItem key={store} value={store}>{store}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedClient || "__all__"} onValueChange={(v) => setSelectedClient(v === "__all__" ? "" : v)}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Client" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Clients</SelectItem>
                  {stats?.filters?.clients?.map(client => (
                    <SelectItem key={client} value={client}>{client}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedIssueType || "__all__"} onValueChange={(v) => setSelectedIssueType(v === "__all__" ? "" : v)}>
                <SelectTrigger className="text-sm col-span-2">
                  <SelectValue placeholder="Issue Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Issue Types</SelectItem>
                  {stats?.filters?.issueTypes?.map(issue => (
                    <SelectItem key={issue} value={issue}>{issue}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2 pt-2">
              <Button 
                onClick={handleFilterApply} 
                className="flex-1"
                disabled={!hasActiveFilters}
              >
                Apply Filters
              </Button>
              {hasActiveFilters && (
                <Button variant="outline" onClick={clearFilters}>
                  Clear
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <ClipboardList className="h-4 w-4" />
                Total Tasks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalTasks.toLocaleString()}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Store className="h-4 w-4" />
                Total Stores
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{stats.totalStores.toLocaleString()}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Pending
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">{stats.pendingCount.toLocaleString()}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Completed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.completedCount.toLocaleString()}</div>
            </CardContent>
          </Card>

          <Card className="col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                P4 Week Sales Total
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {stats.totalP4WeekSales.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Actions by Type
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.actionBreakdown.length > 0 ? (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.actionBreakdown.slice(0, 6)} layout="vertical" margin={{ left: 0, right: 20 }}>
                    <XAxis type="number" hide />
                    <YAxis 
                      type="category" 
                      dataKey="action" 
                      width={100} 
                      tick={{ fontSize: 11 }}
                      tickFormatter={(value) => value.length > 15 ? value.slice(0, 15) + '...' : value}
                    />
                    <Tooltip 
                      formatter={(value: number) => [value.toLocaleString(), 'Tasks']}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {stats.actionBreakdown.slice(0, 6).map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-8">No action data available</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Stock Classification (This Week)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.stockClassifications.length > 0 ? (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.stockClassifications.slice(0, 6)} layout="vertical" margin={{ left: 0, right: 20 }}>
                    <XAxis type="number" hide />
                    <YAxis 
                      type="category" 
                      dataKey="classification" 
                      width={120} 
                      tick={{ fontSize: 10 }}
                      tickFormatter={(value) => value.length > 18 ? value.slice(0, 18) + '...' : value}
                    />
                    <Tooltip 
                      formatter={(value: number) => [value.toLocaleString(), 'Items']}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {stats.stockClassifications.slice(0, 6).map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-8">No classification data available</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Store className="h-5 w-5" />
              Top 5 Stores by Tasks
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.topStores.length > 0 ? (
              stats.topStores.map((store, index) => (
                <div key={store.name} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div 
                      className="h-8 w-8 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0"
                      style={{ backgroundColor: COLORS[index % COLORS.length] }}
                    >
                      {index + 1}
                    </div>
                    <span className="text-sm font-medium truncate">{store.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-bold text-muted-foreground">
                      {store.count.toLocaleString()}
                    </span>
                    <Link href={`/store/${encodeURIComponent(store.name)}`}>
                      <Button size="sm" variant="secondary" className="h-7 px-2">
                        <Play className="h-3 w-3 mr-1" />
                        Start
                      </Button>
                    </Link>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground text-sm text-center py-4">No store data available</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-5 w-5" />
              Top 5 Reps by Tasks
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.topReps.length > 0 ? (
              stats.topReps.map((rep, index) => (
                <div key={rep.name} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div 
                      className="h-8 w-8 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0"
                      style={{ backgroundColor: COLORS[index % COLORS.length] }}
                    >
                      {index + 1}
                    </div>
                    <span className="text-sm font-medium truncate">{rep.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-bold text-muted-foreground">
                      {rep.count.toLocaleString()}
                    </span>
                    <Link href={`/tasks?rep=${encodeURIComponent(rep.name)}`}>
                      <Button size="sm" variant="secondary" className="h-7 px-2">
                        <Play className="h-3 w-3 mr-1" />
                        Start
                      </Button>
                    </Link>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground text-sm text-center py-4">No rep data available</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Clients
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.clients.length > 0 ? (
              <div className="grid gap-2">
                {stats.clients.map((client) => (
                  <div key={client.name} className="flex items-center justify-between py-1 border-b last:border-0">
                    <span className="text-sm font-medium">{client.name}</span>
                    <span className="text-sm text-muted-foreground font-mono">
                      {client.count.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-4">No client data available</p>
            )}
          </CardContent>
        </Card>

        <Link href="/tasks" className="block">
          <Button className="w-full" size="lg">
            View All Tasks
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>
      </div>
    </Layout>
  );
}
