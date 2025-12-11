import { Link, useLocation } from "wouter";
import { Package, ClipboardCheck } from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 font-sans">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center px-4 max-w-md mx-auto">
          <Link href="/">
            <a className="mr-6 flex items-center space-x-2">
              <Package className="h-6 w-6 text-primary" />
              <span className="font-bold text-lg tracking-tight">StockFix</span>
            </a>
          </Link>
          <div className="ml-auto flex items-center space-x-4">
            <div className="text-sm font-medium text-muted-foreground">
              Rep: John D.
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
