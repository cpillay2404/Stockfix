import React, { useState } from 'react';
import { CheckCircle2, Circle, AlertTriangle, ArrowRight, User, Package, Calendar } from 'lucide-react';

const TASKS = [
  {
    id: 1,
    store: 'Woolworths Sandton',
    client: 'Coca-Cola',
    product: 'Coca-Cola 2L',
    action: 'Fix Facing',
    priority: 'Urgent',
    status: 'pending',
    logo: 'CC'
  },
  {
    id: 2,
    store: 'Checkers Hyper',
    client: 'Kellogg',
    product: 'Corn Flakes 1kg',
    action: 'OOS',
    priority: 'Urgent',
    status: 'pending',
    logo: 'KL'
  },
  {
    id: 3,
    store: 'Pick n Pay',
    client: 'Unilever',
    product: 'Sunlight Liquid 750ml',
    action: 'Low Stock',
    priority: 'Normal',
    status: 'completed',
    logo: 'UL'
  },
  {
    id: 4,
    store: 'Spar',
    client: 'Tiger Brands',
    product: 'Jungle Oats 1kg',
    action: 'Facing',
    priority: 'Normal',
    status: 'pending',
    logo: 'TB'
  }
];

export function BoldDark() {
  const [tasks, setTasks] = useState(TASKS);

  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const totalCount = tasks.length;
  const progress = Math.round((completedCount / totalCount) * 100);

  const toggleStatus = (id: number) => {
    setTasks(prev => prev.map(t =>
      t.id === id ? { ...t, status: t.status === 'completed' ? 'pending' : 'completed' } : t
    ));
  };

  return (
    <div className="w-[390px] h-[844px] bg-slate-900 text-slate-100 font-sans overflow-hidden flex flex-col relative mx-auto border-8 border-black rounded-[40px] shadow-2xl">
      {/* Background glow effects */}
      <div className="absolute top-[-100px] left-[-100px] w-64 h-64 bg-orange-500/20 rounded-full blur-[80px] pointer-events-none" />
      <div className="absolute bottom-[-100px] right-[-100px] w-64 h-64 bg-blue-500/20 rounded-full blur-[80px] pointer-events-none" />

      {/* Header */}
      <header className="px-5 pt-12 pb-6 bg-slate-900/80 backdrop-blur-md border-b border-white/10 z-10 sticky top-0">
        <div className="flex justify-between items-start mb-6">
          <div>
            <p className="text-orange-500 font-bold tracking-wider text-xs uppercase mb-1 flex items-center gap-2">
              <Calendar className="w-3 h-3" />
              Today, 24 Oct
            </p>
            <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
              <User className="w-6 h-6 text-orange-500" />
              Alex Mercer
            </h1>
          </div>
          <div className="w-10 h-10 rounded-full bg-slate-800 border-2 border-orange-500 flex items-center justify-center font-bold text-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.4)]">
            AM
          </div>
        </div>

        {/* Stats bar */}
        <div className="bg-slate-800/50 rounded-2xl p-4 border border-white/5">
          <div className="flex justify-between items-end mb-2">
            <div>
              <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">Mission Progress</p>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black text-white">{completedCount}</span>
                <span className="text-slate-500 font-medium">/ {totalCount}</span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-orange-500 font-bold text-xl">{progress}%</span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden border border-white/5">
            <div
              className="h-full bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.8)] transition-all duration-500 ease-out rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </header>

      {/* Task List */}
      <div className="flex-1 overflow-y-auto px-5 py-6 pb-24 z-10" style={{ scrollbarWidth: 'none' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-slate-400" />
            Active Tasks
          </h2>
          <span className="bg-slate-800 text-slate-300 text-xs px-2 py-1 rounded-md font-bold">
            {tasks.length} total
          </span>
        </div>

        <div className="space-y-4">
          {tasks.map(task => {
            const isUrgent = task.priority === 'Urgent';
            const isCompleted = task.status === 'completed';

            return (
              <div
                key={task.id}
                onClick={() => toggleStatus(task.id)}
                className="relative p-4 rounded-2xl backdrop-blur-sm border transition-all duration-300 cursor-pointer overflow-hidden"
                style={{
                  background: isCompleted ? 'rgba(15,23,42,0.5)' : 'rgba(30,41,59,0.8)',
                  borderColor: isCompleted
                    ? 'rgba(16,185,129,0.2)'
                    : isUrgent
                    ? 'rgba(239,68,68,0.5)'
                    : 'rgba(59,130,246,0.3)',
                  boxShadow: isCompleted
                    ? 'none'
                    : isUrgent
                    ? '0 0 20px rgba(239,68,68,0.2)'
                    : '0 0 15px rgba(59,130,246,0.1)',
                  opacity: isCompleted ? 0.7 : 1,
                }}
              >
                {/* Active left border indicator */}
                {!isCompleted && (
                  <div
                    className="absolute left-0 top-0 bottom-0 w-1"
                    style={{
                      background: isUrgent ? '#ef4444' : '#3b82f6',
                      boxShadow: isUrgent
                        ? '0 0 10px rgba(239,68,68,1)'
                        : '0 0 10px rgba(59,130,246,1)',
                    }}
                  />
                )}

                <div className="flex gap-3 relative z-10">
                  {/* Status checkbox */}
                  <div className="mt-1">
                    {isCompleted ? (
                      <CheckCircle2 className="w-6 h-6 text-emerald-500 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                    ) : (
                      <Circle className="w-6 h-6 text-slate-500" />
                    )}
                  </div>

                  <div className="flex-1">
                    {/* Top row: Badges */}
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="bg-slate-900 px-2 py-0.5 rounded text-[10px] font-bold text-slate-300 border border-slate-700">
                        {task.store}
                      </span>
                      {isUrgent && !isCompleted && (
                        <span className="flex items-center gap-1 bg-red-500/20 text-red-400 px-2 py-0.5 rounded text-[10px] font-bold border border-red-500/30">
                          <AlertTriangle className="w-3 h-3" />
                          URGENT
                        </span>
                      )}
                      <span className="bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded text-[10px] font-bold border border-orange-500/30">
                        {task.action}
                      </span>
                    </div>

                    {/* Product & Client */}
                    <h3
                      className="text-lg font-black leading-tight mb-1"
                      style={{ color: isCompleted ? '#94a3b8' : '#ffffff', textDecoration: isCompleted ? 'line-through' : 'none' }}
                    >
                      {task.product}
                    </h3>

                    <div className="flex items-center justify-between mt-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded bg-slate-700 flex items-center justify-center text-[10px] font-bold text-white border border-slate-600">
                          {task.logo}
                        </div>
                        <span className="text-slate-400 text-sm font-medium">{task.client}</span>
                      </div>

                      {!isCompleted && (
                        <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center border border-slate-600">
                          <ArrowRight className="w-4 h-4 text-slate-300" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom nav */}
      <nav className="absolute bottom-0 left-0 right-0 h-20 bg-slate-900/90 backdrop-blur-md border-t border-white/10 flex items-center justify-around px-6 z-20">
        <button className="flex flex-col items-center gap-1">
          <div className="w-6 h-6 rounded bg-orange-500/20 flex items-center justify-center">
            <Package className="w-4 h-4 text-orange-500" />
          </div>
          <span className="text-[10px] text-orange-500 font-bold">Tasks</span>
        </button>
        <button className="flex flex-col items-center gap-1">
          <div className="w-6 h-6 flex items-center justify-center">
            <User className="w-4 h-4 text-slate-500" />
          </div>
          <span className="text-[10px] text-slate-500">Profile</span>
        </button>
      </nav>
    </div>
  );
}
