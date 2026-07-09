import React from "react";
import { ChevronRight, Filter, MoreHorizontal, Bell, CheckCircle2, Clock, AlertTriangle } from "lucide-react";

const TASKS = [
  {
    id: "TSK-8492",
    store: "Woolworths Sandton",
    client: "Coca-Cola",
    product: "Coke Zero 2L",
    issue: "Out of Stock",
    priority: "Urgent",
    status: "Pending",
    time: "09:00 AM",
    borderColor: "border-red-500",
    bgColor: "bg-red-50",
    badgeColor: "bg-red-100 text-red-700",
  },
  {
    id: "TSK-8493",
    store: "Checkers Hyper",
    client: "Kellogg's",
    product: "Corn Flakes 1kg",
    issue: "Low Stock",
    priority: "Normal",
    status: "Pending",
    time: "10:30 AM",
    borderColor: "border-amber-400",
    bgColor: "bg-amber-50",
    badgeColor: "bg-amber-100 text-amber-700",
  },
  {
    id: "TSK-8494",
    store: "Pick n Pay",
    client: "Nestlé",
    product: "KitKat 4 Finger",
    issue: "Facing",
    priority: "Normal",
    status: "Completed",
    time: "12:15 PM",
    borderColor: "border-green-500",
    bgColor: "bg-white",
    badgeColor: "bg-green-100 text-green-700",
  },
  {
    id: "TSK-8495",
    store: "Spar City Centre",
    client: "Red Bull",
    product: "Energy Drink 250ml",
    issue: "Out of Stock",
    priority: "Urgent",
    status: "Pending",
    time: "02:00 PM",
    borderColor: "border-red-500",
    bgColor: "bg-red-50",
    badgeColor: "bg-red-100 text-red-700",
  },
];

export function SharpEnterprise() {
  return (
    <div className="w-[390px] h-[844px] bg-slate-50 flex flex-col font-sans overflow-hidden border border-slate-200 shadow-xl rounded-3xl mx-auto">
      {/* Header */}
      <header className="bg-[#003B71] text-white pt-12 pb-4 px-4 flex-shrink-0">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">John Doe</h1>
            <p className="text-[#F36C21] text-xs font-mono font-medium mt-1 uppercase tracking-wider">
              {new Date().toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
                year: "numeric"
              })}
            </p>
          </div>
          <div className="flex gap-3">
            <button className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
              <Bell className="w-4 h-4" />
            </button>
            <div className="w-8 h-8 rounded-full bg-[#F36C21] text-white flex items-center justify-center font-bold text-sm">
              JD
            </div>
          </div>
        </div>

        {/* Swipeable Quick Stats */}
        <div className="flex overflow-x-auto pb-2 -mx-4 px-4 gap-3 no-scrollbar snap-x">
          <div className="bg-white/10 rounded-lg p-3 min-w-[110px] snap-start border border-white/5">
            <p className="text-white/60 text-[10px] uppercase tracking-wider font-semibold mb-1">Total Tasks</p>
            <p className="text-2xl font-mono font-light">12</p>
          </div>
          <div className="bg-red-500/20 rounded-lg p-3 min-w-[110px] snap-start border border-red-500/30">
            <p className="text-red-200 text-[10px] uppercase tracking-wider font-semibold mb-1">Urgent</p>
            <p className="text-2xl font-mono font-light text-red-100">4</p>
          </div>
          <div className="bg-amber-500/20 rounded-lg p-3 min-w-[110px] snap-start border border-amber-500/30">
            <p className="text-amber-200 text-[10px] uppercase tracking-wider font-semibold mb-1">OOS</p>
            <p className="text-2xl font-mono font-light text-amber-100">3</p>
          </div>
          <div className="bg-green-500/20 rounded-lg p-3 min-w-[110px] snap-start border border-green-500/30">
            <p className="text-green-200 text-[10px] uppercase tracking-wider font-semibold mb-1">Done</p>
            <p className="text-2xl font-mono font-light text-green-100">5</p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-slate-100 p-3">
        <div className="flex justify-between items-center mb-3 px-1">
          <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wide">Action Queue</h2>
          <button className="flex items-center gap-1 text-[#003B71] text-xs font-semibold bg-slate-200/60 px-2 py-1 rounded">
            <Filter className="w-3 h-3" /> Filter
          </button>
        </div>

        <div className="space-y-2">
          {TASKS.map((task) => (
            <div
              key={task.id}
              className={`bg-white rounded-md border-l-[4px] border-y border-r border-slate-200 shadow-sm flex flex-col relative overflow-hidden ${task.borderColor}`}
            >
              <div className="p-3">
                <div className="flex justify-between items-start mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1 rounded">{task.id}</span>
                    <span className="text-[10px] font-semibold text-slate-500 uppercase">{task.time}</span>
                  </div>
                  {task.status === "Completed" ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  ) : task.priority === "Urgent" ? (
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                  ) : (
                    <Clock className="w-4 h-4 text-amber-500" />
                  )}
                </div>

                <div className="mb-2">
                  <h3 className="text-sm font-bold text-slate-900 leading-tight">{task.store}</h3>
                  <p className="text-xs text-slate-600 mt-0.5 flex items-center gap-1.5">
                    <span className="font-semibold text-[#003B71]">{task.client}</span>
                    <span className="w-1 h-1 rounded-full bg-slate-300 inline-block"></span>
                    <span className="truncate">{task.product}</span>
                  </p>
                </div>

                <div className="flex items-center justify-between mt-3">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-sm uppercase tracking-wide ${task.badgeColor}`}>
                    {task.issue}
                  </span>
                  <button 
                    className={`text-xs font-semibold px-3 py-1.5 rounded flex items-center gap-1 transition-colors ${
                      task.status === "Completed" 
                        ? "bg-slate-100 text-slate-400 cursor-not-allowed" 
                        : "bg-[#003B71] text-white hover:bg-[#002a52]"
                    }`}
                  >
                    {task.status === "Completed" ? "Resolved" : "Action"}
                    {task.status !== "Completed" && <ChevronRight className="w-3 h-3" />}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
        
        <div className="mt-4 text-center">
          <p className="text-xs text-slate-400 font-mono">End of Queue</p>
        </div>
      </main>
      
      {/* Footer Nav Mockup */}
      <footer className="bg-white border-t border-slate-200 flex justify-around p-3 pb-5 flex-shrink-0">
        <div className="flex flex-col items-center text-[#003B71]">
          <div className="w-6 h-6 rounded bg-[#003B71]/10 flex items-center justify-center mb-1">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
          </div>
          <span className="text-[10px] font-semibold">Queue</span>
        </div>
        <div className="flex flex-col items-center text-slate-400">
          <div className="w-6 h-6 flex items-center justify-center mb-1">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
          </div>
          <span className="text-[10px] font-medium">Upload</span>
        </div>
        <div className="flex flex-col items-center text-slate-400">
          <div className="w-6 h-6 flex items-center justify-center mb-1">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </div>
          <span className="text-[10px] font-medium">Profile</span>
        </div>
      </footer>
    </div>
  );
}
