import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { fetchTasks } from "@/lib/api";
import { TaskCard } from "@/components/task-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ChevronLeft, ChevronRight, ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [filter, debouncedSearch]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["tasks", page, debouncedSearch, filter],
    queryFn: () => fetchTasks(page, 50, debouncedSearch, filter),
  });

  const tasks = data?.tasks || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;

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
        <div className="space-y-4">
          <Link href="/">
            <Button variant="ghost" size="sm" className="pl-0 hover:bg-transparent text-muted-foreground hover:text-foreground">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
              {isLoading ? (
                <Skeleton className="h-5 w-48" />
              ) : (
                <p className="text-muted-foreground">
                  Showing <span className="font-semibold text-foreground">{tasks.length}</span> of {total.toLocaleString()} tasks
                </p>
              )}
            </div>
          </div>
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
              Pending
            </Button>
            <Button 
              variant={filter === "completed" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("completed")}
              className="rounded-full"
            >
              Completed
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          {isLoading ? (
            <div className="grid gap-4">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          ) : tasks.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No tasks found matching your criteria.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {tasks.map((task, index) => {
                const showStoreHeader = index === 0 || task.storeName !== tasks[index - 1].storeName;
                return (
                  <div key={task.uniqueId} className="space-y-2">
                    {showStoreHeader && !debouncedSearch && filter === 'all' && (
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

        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1 || isLoading}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || isLoading}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}
      </div>
    </Layout>
  );
}
