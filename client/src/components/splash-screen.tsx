import { useState, useEffect } from "react";
import { Wrench } from "lucide-react";

interface SplashScreenProps {
  onComplete: () => void;
  minDisplayTime?: number;
}

export function SplashScreen({ onComplete, minDisplayTime = 2000 }: SplashScreenProps) {
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFadeOut(true);
      setTimeout(onComplete, 500);
    }, minDisplayTime);

    return () => clearTimeout(timer);
  }, [onComplete, minDisplayTime]);

  return (
    <div 
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#003B71] transition-opacity duration-500 ${fadeOut ? 'opacity-0' : 'opacity-100'}`}
    >
      <div className="flex flex-col items-center space-y-6">
        <div className="relative">
          <div className="w-24 h-24 bg-white/10 rounded-2xl flex items-center justify-center">
            <Wrench className="h-12 w-12 text-white" />
          </div>
          <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center">
            <div className="w-3 h-3 bg-white rounded-full animate-pulse" />
          </div>
        </div>
        
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white tracking-tight">StockFix</h1>
          <p className="text-blue-200 text-sm mt-1">Inventory Action & Feedback</p>
        </div>

        <div className="flex flex-col items-center space-y-3 mt-8">
          <div className="flex space-x-1">
            <div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          <p className="text-blue-200 text-sm">Syncing data...</p>
        </div>
      </div>

      <div className="absolute bottom-8 text-blue-300/50 text-xs">
        Powered by Meridian Nexus
      </div>
    </div>
  );
}
