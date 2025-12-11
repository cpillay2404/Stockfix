import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  ArrowLeft, Store, AlertTriangle, Package, List, Layers,
  ClipboardList, TrendingUp, BarChart3
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const COLORS = ['#1e3a5f', '#f97316', '#10b981', '#ef4444', '#8b5cf6', '#ec4899'];

interface StoreData {
  storeName: string;
  region: string;
  totalTasks: number;
  pendingTasks: number;
  completedTasks: number;
  totalP4WeekSales: number;
  totalSOH: number;
  issueBreakdown: { issue: string; count: number }[];
  categories: string[];
  urgentNoSalesCount: number;
  outOfStockCount: number;
}

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
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32" />
          <Skeleton className="h-48" />
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
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

  return (
    <Layout>
      <div className="space-y-4">
        <Link href="/">
          <Button variant="ghost" size="sm" className="pl-0 hover:bg-transparent text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
        </Link>

        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Store className="h-5 w-5" />
            {store.storeName}
          </h1>
          <p className="text-muted-foreground text-sm">{store.region}</p>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Task Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold">{store.totalTasks}</div>
                <div className="text-xs text-muted-foreground">Total Tasks</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-orange-500">{store.pendingTasks}</div>
                <div className="text-xs text-muted-foreground">Pending</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-500">{store.completedTasks}</div>
                <div className="text-xs text-muted-foreground">Completed</div>
              </div>
            </div>
            <div className="mt-3 w-full bg-muted rounded-full h-2">
              <div 
                className="bg-green-500 h-2 rounded-full transition-all"
                style={{ width: `${completionRate}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1 text-center">
              {completionRate}% complete
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Issue Type Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            {store.issueBreakdown.length > 0 ? (
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={store.issueBreakdown} layout="vertical" margin={{ left: 0, right: 10 }}>
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis 
                      type="category" 
                      dataKey="issue" 
                      width={100} 
                      tick={{ fontSize: 10 }}
                      tickFormatter={(value) => value.length > 15 ? value.slice(0, 15) + '...' : value}
                    />
                    <Tooltip 
                      formatter={(value: number) => [value.toLocaleString(), 'Tasks']}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {store.issueBreakdown.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-4">No issue data</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Sales & Stock Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-3 bg-muted rounded-lg">
                <div className="text-lg font-bold">R{store.totalP4WeekSales.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">P4 Week Sales</div>
              </div>
              <div className="text-center p-3 bg-muted rounded-lg">
                <div className="text-lg font-bold">{store.totalSOH.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">Stock on Hand</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <Link href={`/tasks?store=${encodeURIComponent(storeName)}&issue=${encodeURIComponent('No Sales (Idle Stock)')}`}>
            <Button className="w-full justify-start" variant="destructive" size="lg">
              <AlertTriangle className="mr-2 h-5 w-5" />
              Fix Urgent - No Sales / Idle Stock
              <span className="ml-auto bg-white/20 px-2 py-0.5 rounded text-sm">
                {store.urgentNoSalesCount}
              </span>
            </Button>
          </Link>

          <Link href={`/tasks?store=${encodeURIComponent(storeName)}&issue=${encodeURIComponent('Out of Stock')}`}>
            <Button className="w-full justify-start" variant="secondary" size="lg">
              <Package className="mr-2 h-5 w-5" />
              Fix Out of Stocks
              <span className="ml-auto bg-primary/20 px-2 py-0.5 rounded text-sm">
                {store.outOfStockCount}
              </span>
            </Button>
          </Link>

          <Link href={`/tasks?store=${encodeURIComponent(storeName)}`}>
            <Button className="w-full justify-start" variant="outline" size="lg">
              <List className="mr-2 h-5 w-5" />
              View All SKUs
              <span className="ml-auto text-muted-foreground text-sm">
                {store.totalTasks}
              </span>
            </Button>
          </Link>

          {store.categories.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Layers className="h-4 w-4" />
                  StockFix by Category
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2">
                {store.categories.slice(0, 8).map((category) => (
                  <Link 
                    key={category} 
                    href={`/tasks?store=${encodeURIComponent(storeName)}&category=${encodeURIComponent(category)}`}
                  >
                    <Button variant="outline" size="sm" className="w-full text-xs truncate">
                      {category}
                    </Button>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </Layout>
  );
}
