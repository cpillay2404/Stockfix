import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import TaskList from "@/pages/dashboard";
import TaskDetail from "@/pages/task-detail";
import ImportData from "@/pages/import-data";
import StoreSummary from "@/pages/store-summary";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/tasks" component={TaskList} />
      <Route path="/import" component={ImportData} />
      <Route path="/task/:id" component={TaskDetail} />
      <Route path="/store/:storeName" component={StoreSummary} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
