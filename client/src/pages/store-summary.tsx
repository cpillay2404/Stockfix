import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  ArrowLeft, Store, AlertTriangle, Package, 
  User, MapPin, ChevronRight, Zap, TrendingDown, XCircle
} from "lucide-react";

interface ClientData {
  name: string;
  totalIssues: number;
  urgentCount: number;
  oosCount: number;
  noSalesCount: number;
  negativeCount: number;
}

interface ActionCount {
  action: string;
  count: number;
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
  skusOOS: number;
  actionsByType: ActionCount[];
  clients: ClientData[];
  urgentNoSalesCount: number;
  outOfStockCount: number;
  negativeSOHCount: number;
}

export default function StoreSummaryPage() {
  const params = useParams<{ storeName: string }>();
  const [, setLocation] = useLocation();
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
          <Skeleton className="h-32 bg-slate-700" />
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
          <div className="text-center py-12">
            <Store className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h2 className="text-lg font-semibold">Store not found</h2>
            <p className="text-muted-foreground">No data available for this store</p>
          </div>
        </div>
      </Layout>
    );
  }

  const getSeverityColor = (client: ClientData) => {
    if (client.urgentCount > 0) return 'border-l-red-500';
    if (client.oosCount > 0) return 'border-l-orange-500';
    return 'border-l-green-500';
  };

  const getSeverityBg = (client: ClientData) => {
    if (client.urgentCount > 0) return 'bg-red-50';
    if (client.oosCount > 0) return 'bg-orange-50';
    return 'bg-green-50';
  };

  const topUrgentClients = [...store.clients]
    .sort((a, b) => b.urgentCount - a.urgentCount)
    .filter(c => c.urgentCount > 0)
    .slice(0, 5);

  const topOOSClients = [...store.clients]
    .sort((a, b) => b.oosCount - a.oosCount)
    .filter(c => c.oosCount > 0)
    .slice(0, 5);

  const topNoSalesClients = [...store.clients]
    .sort((a, b) => b.noSalesCount - a.noSalesCount)
    .filter(c => c.noSalesCount > 0)
    .slice(0, 5);

  const topNegativeClients = [...store.clients]
    .sort((a, b) => (b.negativeCount || 0) - (a.negativeCount || 0))
    .filter(c => (c.negativeCount || 0) > 0)
    .slice(0, 5);

  return (
    <Layout>
      <div className="space-y-4 -mx-4 sm:-mx-6">
        {/* IZON HEADER BAND - Store Details */}
        <div className="bg-[#1e3a5f] text-white px-4 py-4">
          <Link href="/">
            <Button variant="ghost" size="sm" className="text-blue-200 hover:text-white hover:bg-white/10 pl-0 mb-2">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Dashboard
            </Button>
          </Link>
          
          <h1 className="text-lg font-bold leading-tight mb-2">{store.storeName}</h1>
          
          <div className="flex flex-wrap gap-3 text-sm text-blue-200">
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {store.region}
            </span>
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {store.repName}
            </span>
          </div>

          {/* Key Stats in Header */}
          <div className="grid grid-cols-3 gap-2 mt-4">
            <div className="bg-white/10 rounded-lg p-2 text-center">
              <div className="text-2xl font-bold font-mono">{store.totalTasks}</div>
              <div className="text-xs text-blue-200">Total</div>
            </div>
            <div className="bg-white/10 rounded-lg p-2 text-center">
              <div className="text-2xl font-bold font-mono text-orange-300">{store.pendingTasks}</div>
              <div className="text-xs text-blue-200">Pending</div>
            </div>
            <div className="bg-white/10 rounded-lg p-2 text-center">
              <div className="text-2xl font-bold font-mono text-green-300">{store.completedTasks}</div>
              <div className="text-xs text-blue-200">Done</div>
            </div>
          </div>
        </div>

        <div className="px-4 space-y-4">
          {/* SUMMARY TILES - Key Metrics */}
          <div className="grid grid-cols-2 gap-3">
            {/* Total SOH */}
            <div className="bg-white rounded-xl shadow-md p-4 border border-gray-100">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total SOH</div>
              <div className="text-2xl font-bold text-[#1e3a5f] font-mono">
                {store.totalSOH.toLocaleString()}
              </div>
            </div>
            
            {/* P4 Weeks Sales */}
            <div className="bg-white rounded-xl shadow-md p-4 border border-gray-100">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">P4 Weeks Sales</div>
              <div className="text-2xl font-bold text-[#1e3a5f] font-mono">
                {store.totalP4WeekSales.toLocaleString()}
              </div>
            </div>
            
            {/* SKUs OOS */}
            <div className="bg-white rounded-xl shadow-md p-4 border border-gray-100">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">SKUs Out of Stock</div>
              <div className="text-2xl font-bold text-orange-600 font-mono">
                {store.skusOOS}
              </div>
            </div>
            
            {/* Total SKUs */}
            <div className="bg-white rounded-xl shadow-md p-4 border border-gray-100">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total SKUs</div>
              <div className="text-2xl font-bold text-[#1e3a5f] font-mono">
                {store.totalTasks}
              </div>
            </div>
          </div>

          {/* ACTIONS BY TYPE */}
          <div className="bg-white rounded-xl shadow-md p-4 border border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Actions by Type</h2>
            <div className="space-y-2">
              {store.actionsByType.map((item) => {
                const maxCount = Math.max(...store.actionsByType.map(a => a.count));
                const percentage = (item.count / maxCount) * 100;
                const isUrgent = item.action.toLowerCase().startsWith('urgent');
                
                return (
                  <div 
                    key={item.action} 
                    className="cursor-pointer hover:bg-gray-50 rounded p-2 -mx-2"
                    onClick={() => setLocation(`/tasks?store=${encodeURIComponent(storeName)}&action=${encodeURIComponent(item.action)}`)}
                    data-testid={`action-${item.action.substring(0, 20)}`}
                  >
                    <div className="flex justify-between text-sm mb-1">
                      <span className={`font-medium ${isUrgent ? 'text-red-700' : 'text-gray-700'}`}>
                        {item.action}
                      </span>
                      <span className={`font-mono font-bold ${isUrgent ? 'text-red-600' : 'text-[#1e3a5f]'}`}>
                        {item.count}
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full ${isUrgent ? 'bg-red-500' : 'bg-[#1e3a5f]'}`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <Button 
              variant="outline" 
              className="h-auto py-3 border-red-200 text-red-700 hover:bg-red-50"
              onClick={() => setLocation(`/tasks?store=${encodeURIComponent(storeName)}&issue=Urgent`)}
              data-testid="button-urgent-only"
            >
              <AlertTriangle className="mr-2 h-4 w-4" />
              Urgent Only
            </Button>
            <Button 
              variant="outline"
              className="h-auto py-3 border-orange-200 text-orange-700 hover:bg-orange-50"
              onClick={() => setLocation(`/tasks?store=${encodeURIComponent(storeName)}&issue=Out of Stock`)}
              data-testid="button-oos-only"
            >
              <Package className="mr-2 h-4 w-4" />
              OOS Only
            </Button>
          </div>

          {/* SECTION 1 - Client Breakdown Grid (IZON Style) */}
          <div className="bg-white rounded-xl shadow-md p-4 border border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Store className="h-4 w-4" />
              Client Breakdown
            </h2>
            
            {store.clients.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {store.clients.map((client) => (
                  <Link 
                    key={client.name} 
                    href={`/tasks?store=${encodeURIComponent(storeName)}&client=${encodeURIComponent(client.name)}`}
                  >
                    <div 
                      className={`p-3 rounded-lg border-l-4 ${getSeverityColor(client)} ${getSeverityBg(client)} hover:shadow-md transition-all cursor-pointer`}
                      data-testid={`client-card-${client.name}`}
                    >
                      <div className="text-xs text-gray-600 uppercase tracking-wide font-medium truncate">{client.name}</div>
                      <div className="text-xl font-bold text-[#1e3a5f] font-mono">{client.totalIssues}</div>
                      <div className="flex gap-2 mt-1 text-xs">
                        {client.urgentCount > 0 && (
                          <span className="text-red-600 font-medium">{client.urgentCount} urgent</span>
                        )}
                        {client.oosCount > 0 && (
                          <span className="text-orange-600 font-medium">{client.oosCount} OOS</span>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-4">No client data available</p>
            )}
          </div>

          {/* SECTION 2 - Top 5 Clients by Issue Type */}
          <div className="grid grid-cols-1 gap-3">
            {/* Urgent: Place Order */}
            {topUrgentClients.length > 0 && (
              <div className="bg-white rounded-xl shadow-md p-4 border border-gray-100 border-l-4 border-l-red-500">
                <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <Zap className="h-4 w-4 text-red-500" />
                  Urgent: Place Order (Top Clients)
                </h3>
                <div className="space-y-1">
                  {topUrgentClients.map((client, idx) => (
                    <Link 
                      key={client.name}
                      href={`/tasks?store=${encodeURIComponent(storeName)}&client=${encodeURIComponent(client.name)}&issue=Urgent`}
                    >
                      <div className="flex items-center justify-between p-2 rounded hover:bg-red-50 cursor-pointer group">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400 w-4">{idx + 1}.</span>
                          <span className="text-sm text-gray-700">{client.name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-sm font-bold text-red-600 font-mono">{client.urgentCount}</span>
                          <ChevronRight className="h-3 w-3 text-gray-400 group-hover:text-red-500" />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Out of Stock */}
            {topOOSClients.length > 0 && (
              <div className="bg-white rounded-xl shadow-md p-4 border border-gray-100 border-l-4 border-l-orange-500">
                <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-orange-500" />
                  Out of Stock (Top Clients)
                </h3>
                <div className="space-y-1">
                  {topOOSClients.map((client, idx) => (
                    <Link 
                      key={client.name}
                      href={`/tasks?store=${encodeURIComponent(storeName)}&client=${encodeURIComponent(client.name)}&issue=Out of Stock`}
                    >
                      <div className="flex items-center justify-between p-2 rounded hover:bg-orange-50 cursor-pointer group">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400 w-4">{idx + 1}.</span>
                          <span className="text-sm text-gray-700">{client.name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-sm font-bold text-orange-600 font-mono">{client.oosCount}</span>
                          <ChevronRight className="h-3 w-3 text-gray-400 group-hover:text-orange-500" />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* No Sales (Idle Stock) */}
            {topNoSalesClients.length > 0 && (
              <div className="bg-white rounded-xl shadow-md p-4 border border-gray-100 border-l-4 border-l-amber-500">
                <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-amber-500" />
                  No Sales (Idle Stock) (Top Clients)
                </h3>
                <div className="space-y-1">
                  {topNoSalesClients.map((client, idx) => (
                    <Link 
                      key={client.name}
                      href={`/tasks?store=${encodeURIComponent(storeName)}&client=${encodeURIComponent(client.name)}&issue=No Sales`}
                    >
                      <div className="flex items-center justify-between p-2 rounded hover:bg-amber-50 cursor-pointer group">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400 w-4">{idx + 1}.</span>
                          <span className="text-sm text-gray-700">{client.name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-sm font-bold text-amber-600 font-mono">{client.noSalesCount}</span>
                          <ChevronRight className="h-3 w-3 text-gray-400 group-hover:text-amber-500" />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Negative SOH */}
            {topNegativeClients.length > 0 && (
              <div className="bg-white rounded-xl shadow-md p-4 border border-gray-100 border-l-4 border-l-purple-500">
                <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-purple-500" />
                  Negative SOH (Top Clients)
                </h3>
                <div className="space-y-1">
                  {topNegativeClients.map((client, idx) => (
                    <Link 
                      key={client.name}
                      href={`/tasks?store=${encodeURIComponent(storeName)}&client=${encodeURIComponent(client.name)}&issue=Negative`}
                    >
                      <div className="flex items-center justify-between p-2 rounded hover:bg-purple-50 cursor-pointer group">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400 w-4">{idx + 1}.</span>
                          <span className="text-sm text-gray-700">{client.name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-sm font-bold text-purple-600 font-mono">{client.negativeCount}</span>
                          <ChevronRight className="h-3 w-3 text-gray-400 group-hover:text-purple-500" />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* SECTION 3 - Quick Filter Chips */}
          <div className="bg-white rounded-xl shadow-md p-4 border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Quick Filters</h3>
            <div className="flex flex-wrap gap-2">
              <Button 
                variant="outline" 
                size="sm"
                className="rounded-full border-red-200 text-red-700 hover:bg-red-100"
                onClick={() => setLocation(`/tasks?store=${encodeURIComponent(storeName)}&issue=Urgent`)}
                data-testid="chip-urgent"
              >
                Urgent
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                className="rounded-full border-orange-200 text-orange-700 hover:bg-orange-100"
                onClick={() => setLocation(`/tasks?store=${encodeURIComponent(storeName)}&issue=Out of Stock`)}
                data-testid="chip-oos"
              >
                Out of Stock
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                className="rounded-full border-amber-200 text-amber-700 hover:bg-amber-100"
                onClick={() => setLocation(`/tasks?store=${encodeURIComponent(storeName)}&issue=No Sales`)}
                data-testid="chip-no-sales"
              >
                No Sales
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                className="rounded-full border-purple-200 text-purple-700 hover:bg-purple-100"
                onClick={() => setLocation(`/tasks?store=${encodeURIComponent(storeName)}&issue=Negative`)}
                data-testid="chip-negative"
              >
                Negative SOH
              </Button>
            </div>
          </div>

          {/* SECTION 4 - Main CTA Button */}
          <Button 
            className="w-full bg-[#1e3a5f] hover:bg-[#2d4a6f] h-14 text-base"
            onClick={() => setLocation(`/tasks?store=${encodeURIComponent(storeName)}`)}
            data-testid="button-go-to-task-list"
          >
            Go to Store Task List
            <ChevronRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      </div>
    </Layout>
  );
}
