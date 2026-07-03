import { Link, useLocation } from "wouter";
import { Wrench } from "lucide-react";
import { useUserRole } from "@/hooks/use-user-role";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { role, setRole } = useUserRole();
  const isDashboard = location === "/dashboard" || location === "/";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 font-sans">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex items-center px-4 py-2 max-w-md mx-auto">
          <Link href="/" className="mr-6 flex items-center space-x-2">
            <Wrench className="h-6 w-6 text-primary" />
            <span className="font-bold text-lg tracking-tight">StockFix</span>
          </Link>
          <div className="ml-auto flex flex-col items-end gap-1">
            {isDashboard && (
              <div
                className="flex items-center gap-1.5 rounded-full bg-green-50 border border-green-200 px-2 py-0.5"
                data-testid="badge-live-status"
                title="Dashboard updates automatically as merchandisers capture tasks"
              >
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-green-700">Live</span>
              </div>
            )}
            <div className="flex items-center space-x-4">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback>{role === 'manager' ? 'MG' : 'JD'}</AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {role === 'manager' ? 'Manager View' : 'John Doe'}
                      </p>
                      <p className="text-xs leading-none text-muted-foreground">
                        {role === 'manager' ? 'admin@stockfix.com' : 'rep@stockfix.com'}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Simulate Role</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => setRole('manager')}>
                    Switch to Manager
                    {role === 'manager' && " ✓"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setRole('rep')}>
                    Switch to Rep
                    {role === 'rep' && " ✓"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>
      <main className="container max-w-md mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  );
}
