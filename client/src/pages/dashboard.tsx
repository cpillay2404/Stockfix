import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { fetchTasks } from "@/lib/api";
import { TaskCard } from "@/components/task-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Upload } from "lucide-react";
import { useUserRole } from "@/hooks/use-user-role";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const { role } = useUserRole();

  const { data: tasks = [], isLoading, error } = useQuery({
    queryKey: ["tasks"],
    queryFn: fetchTasks,
  });

  // Sort tasks by Store, then by Missed Sales (High first)
  const sortedTasks = [...tasks].sort((a, b) => {
    if (a.storeName !== b.storeName) return a.storeName.localeCompare(b.storeName);
    return parseFloat(b.missedSales) - parseFloat(a.missedSales);
  });

  const filteredTasks = sortedTasks.filter(task => {
    const matchesFilter = filter === "all" ? true : 
                          filter === "pending" ? task.actionStatus === 'Pending' :
                          task.actionStatus === 'Completed';
    
    const matchesSearch = 
      task.articleDescription.toLowerCase().includes(search.toLowerCase()) ||
      task.storeName.toLowerCase().includes(search.toLowerCase()) ||
      task.barcode.toLowerCase().includes(search.toLowerCase()) ||
      task.client.toLowerCase().includes(search.toLowerCase());
      
    return matchesFilter && matchesSearch;
  });

  const pendingCount = tasks.filter(t => t.actionStatus === 'Pending').length;
  const completedCount = tasks.filter(t => t.actionStatus === 'Completed').length;

  if (error) {
    return (
      <Layout>
        <div className="text-center py-12">
          <p className="text-destructive">Failed to load tasks. Please try again.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
            {isLoading ? (
              <Skeleton className="h-5 w-48" />
            ) : (
              <p className="text-muted-foreground">
                You have <span className="font-semibold text-foreground">{pendingCount}</span> pending actions.
              </p>
            )}
          </div>
          {role === 'manager' && (
            <>
              <Link href="/import" className="hidden sm:flex">
                <Button variant="outline" size="sm" asChild>
                  <span>
                    <Upload className="mr-2 h-4 w-4" />
                    Import Excel
                  </span>
                </Button>
              </Link>
              <Link href="/import" className="sm:hidden">
                <Button variant="outline" size="icon" asChild>
                  <span>
                    <Upload className="h-4 w-4" />
                  </span>
                </Button>
              </Link>
            </>
          )}
        </div>

        <div className="flex flex-col gap-4 sticky top-14 bg-gray-50 dark:bg-gray-900 z-40 py-2 -mx-4 px-4 border-b md:static md:bg-transparent md:border-0 md:p-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search SKU, Store, Product..."
              className="pl-9 bg-background"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
            <Button 
              variant={filter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("all")}
              className="rounded-full"
            >
              All
            </Button>
            <Button 
              variant={filter === "pending" ? "default" : "outline"} 
              size="sm"
              onClick={() => setFilter("pending")}
              className="rounded-full"
            >
              Pending ({pendingCount})
            </Button>
            <Button 
              variant={filter === "completed" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("completed")}
              className="rounded-full"
            >
              Completed ({completedCount})
            </Button>
          </div>
        </div>

        <div className="space-y-6">
          {isLoading ? (
            <div className="grid gap-4">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No tasks found matching your criteria.</p>
            </div>
          ) : (
            <div className="grid gap-4">
               {filteredTasks.map((task, index) => {
                 const showStoreHeader = index === 0 || task.storeName !== filteredTasks[index - 1].storeName;
                 return (
                   <div key={task.uniqueId} className="space-y-2">
                     {showStoreHeader && !search && filter === 'all' && (
                       <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mt-4 mb-2 pl-1 truncate">
                         {task.storeName}
                       </h3>
                     )}
                     <TaskCard task={task} />
                   </div>
                 );
               })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
