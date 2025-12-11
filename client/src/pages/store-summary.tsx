import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, Store, AlertTriangle, Package, List, 
  ClipboardList, TrendingUp, User, MapPin, ArrowRight
} from "lucide-react";

interface ClientData {
  name: string;
  totalIssues: number;
  urgentCount: number;
  oosCount: number;
  noSalesCount: number;
}

interface StoreData {
  storeName: string;
  region: string;
  repName: string;
  totalTasks: number;
  pendingTasks: number;
  completedTasks: number;
  totalP4WeekSales: number;
  totalSOH: number;
  clients: ClientData[];
  urgentNoSalesCount: number;
  outOfStockCount: number;
  negativeSOHCount: number;
}

const SEVERITY_COLORS = {
  urgent: 'bg-red-500',
  risk: 'bg-orange-500',
  stable: 'bg-green-500',
};

export default function StoreSummaryPage() {
  const params = useParams<{ storeName: string }>();
  const storeName = decodeURIComponent(params.storeName || "");

  const { data: store, isLoading } = useQuery<StoreData>({
    queryKey: ["store-summary", storeName],
    queryFn: async () => {
      const res = await fetch(`/api/stores/${encodeURIComponent(storeName)}/summary`);
      if (!res.ok) throw new Error("Failed to fetch store summary");
      return res.json();
    },
    enabled: !!storeName,
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-4">
          <Skeleton className="h-32" />
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20" />)}
          </div>
          <Skeleton className="h-48" />
        </div>
      </Layout>
    );
  }

  if (!store) {
    return (
      <Layout>
        <div className="space-y-4">
          <Link href="/">
            <Button variant="ghost" size="sm" className="pl-0">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>
          <div className="text-center py-12 text-muted-foreground">
            Store not found
          </div>
        </div>
      </Layout>
    );
  }

  const completionRate = store.totalTasks > 0 
    ? Math.round((store.completedTasks / store.totalTasks) * 100) 
    : 0;

  const topUrgentClients = store.clients
    .filter(c => c.urgentCount > 0)
    .sort((a, b) => b.urgentCount - a.urgentCount)
    .slice(0, 5);

  const topOOSClients = store.clients
    .filter(c => c.oosCount > 0)
    .sort((a, b) => b.oosCount - a.oosCount)
    .slice(0, 5);

  const topNoSalesClients = store.clients
    .filter(c => c.noSalesCount > 0)
    .sort((a, b) => b.noSalesCount - a.noSalesCount)
    .slice(0, 5);

  return (
    <Layout>
      <div className="space-y-4">
        <Card className="bg-primary text-primary-foreground">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start justify-between mb-3">
              <Link href="/">
                <Button variant="ghost" size="sm" className="pl-0 text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Dashboard
                </Button>
              </Link>
            </div>
            
            <h1 className="text-xl font-bold flex items-center gap-2 mb-2">
              <Store className="h-5 w-5" />
              {store.storeName}
            </h1>
            
            <div className="flex flex-wrap gap-3 text-sm opacity-90 mb-4">
              <span className="flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {store.region}
              </span>
              {store.repName && (
                <span className="flex items-center gap-1">
                  <User className="h-4 w-4" />
                  {store.repName}
                </span>
              )}
              <span className="flex items-center gap-1">
                <ClipboardList className="h-4 w-4" />
                {store.totalTasks} Tasks
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="bg-primary-foreground/10 rounded-lg p-2">
                <div className="text-lg font-bold">{store.totalTasks}</div>
                <div className="text-xs opacity-80">Total</div>
              </div>
              <div className="bg-primary-foreground/10 rounded-lg p-2">
                <div className="text-lg font-bold">{store.pendingTasks}</div>
                <div className="text-xs opacity-80">Pending</div>
              </div>
              <div className="bg-primary-foreground/10 rounded-lg p-2">
                <div className="text-lg font-bold">{store.completedTasks}</div>
                <div className="text-xs opacity-80">Done</div>
              </div>
              <div className="bg-primary-foreground/10 rounded-lg p-2">
                <div className="text-lg font-bold">{completionRate}%</div>
                <div className="text-xs opacity-80">Complete</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Client Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            {store.clients.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {store.clients.sort((a, b) => b.totalIssues - a.totalIssues).map((client) => {
                  const severity = client.urgentCount > 0 ? 'urgent' : client.oosCount > 0 ? 'risk' : 'stable';
                  return (
                    <Link 
                      key={client.name} 
                      href={`/tasks?store=${encodeURIComponent(storeName)}&client=${encodeURIComponent(client.name)}`}
                    >
                      <Card className="cursor-pointer hover:shadow-md transition-shadow border-l-4" style={{ borderLeftColor: severity === 'urgent' ? '#ef4444' : severity === 'risk' ? '#f97316' : '#22c55e' }}>
                        <CardContent className="p-3">
                          <div className="font-semibold text-sm truncate">{client.name}</div>
                          <div className="text-lg font-bold">{client.totalIssues}</div>
                          <div className="text-xs text-muted-foreground">issues</div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-4">No client data</p>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-3">
          {topUrgentClients.length > 0 && (
            <Card className="border-l-4 border-l-red-500">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-red-600">
                  <AlertTriangle className="h-4 w-4" />
                  Urgent / No Sales (Top Clients)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {topUrgentClients.map((client) => (
                  <Link 
                    key={client.name}
                    href={`/tasks?store=${encodeURIComponent(storeName)}&client=${encodeURIComponent(client.name)}&issue=${encodeURIComponent('No Sales (Idle Stock)')}`}
                  >
                    <div className="flex justify-between items-center py-1.5 px-2 rounded hover:bg-muted cursor-pointer">
                      <span className="text-sm font-medium">{client.name}</span>
                      <Badge variant="destructive" className="text-xs">{client.urgentCount}</Badge>
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          {topOOSClients.length > 0 && (
            <Card className="border-l-4 border-l-orange-500">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-orange-600">
                  <Package className="h-4 w-4" />
                  Out of Stock (Top Clients)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {topOOSClients.map((client) => (
                  <Link 
                    key={client.name}
                    href={`/tasks?store=${encodeURIComponent(storeName)}&client=${encodeURIComponent(client.name)}&issue=${encodeURIComponent('Out of Stock')}`}
                  >
                    <div className="flex justify-between items-center py-1.5 px-2 rounded hover:bg-muted cursor-pointer">
                      <span className="text-sm font-medium">{client.name}</span>
                      <Badge className="text-xs bg-orange-500">{client.oosCount}</Badge>
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          {topNoSalesClients.length > 0 && (
            <Card className="border-l-4 border-l-amber-500">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-amber-600">
                  <TrendingUp className="h-4 w-4" />
                  Idle Stock (Top Clients)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {topNoSalesClients.map((client) => (
                  <Link 
                    key={client.name}
                    href={`/tasks?store=${encodeURIComponent(storeName)}&client=${encodeURIComponent(client.name)}&issue=${encodeURIComponent('No Sales (Idle Stock)')}`}
                  >
                    <div className="flex justify-between items-center py-1.5 px-2 rounded hover:bg-muted cursor-pointer">
                      <span className="text-sm font-medium">{client.name}</span>
                      <Badge className="text-xs bg-amber-500">{client.noSalesCount}</Badge>
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Quick Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Link href={`/tasks?store=${encodeURIComponent(storeName)}&issue=${encodeURIComponent('No Sales (Idle Stock)')}`}>
                <Badge variant="outline" className="cursor-pointer hover:bg-red-50 border-red-300 text-red-700 px-3 py-1.5">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Urgent ({store.urgentNoSalesCount})
                </Badge>
              </Link>
              <Link href={`/tasks?store=${encodeURIComponent(storeName)}&issue=${encodeURIComponent('Out of Stock')}`}>
                <Badge variant="outline" className="cursor-pointer hover:bg-orange-50 border-orange-300 text-orange-700 px-3 py-1.5">
                  <Package className="h-3 w-3 mr-1" />
                  Out of Stock ({store.outOfStockCount})
                </Badge>
              </Link>
              <Link href={`/tasks?store=${encodeURIComponent(storeName)}&issue=${encodeURIComponent('Negative SOH')}`}>
                <Badge variant="outline" className="cursor-pointer hover:bg-purple-50 border-purple-300 text-purple-700 px-3 py-1.5">
                  Negative SOH ({store.negativeSOHCount})
                </Badge>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Sales & Stock Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center p-3 bg-muted rounded-lg">
                <div className="text-xl font-bold font-mono">R{store.totalP4WeekSales.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">P4 Week Sales</div>
              </div>
              <div className="text-center p-3 bg-muted rounded-lg">
                <div className="text-xl font-bold font-mono">{store.totalSOH.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">Stock on Hand</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Link href={`/tasks?store=${encodeURIComponent(storeName)}`}>
          <Button className="w-full" size="lg">
            Go to Store Task List
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </Link>
      </div>
    </Layout>
  );
}
