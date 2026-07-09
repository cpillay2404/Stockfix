import React from 'react';
import { CheckCircle2, Circle, Search, Bell, Menu, MapPin } from 'lucide-react';

export function CleanModern() {
  const tasks = [
    {
      id: 1,
      store: "Checkers Hyper Sandton",
      client: "Coca-Cola",
      product: "Coca-Cola Original 2L",
      action: "OOS",
      priority: "Urgent",
      completed: true,
      time: "09:30 AM",
      logo: "https://logo.clearbit.com/coca-cola.com"
    },
    {
      id: 2,
      store: "Pick n Pay V&A Waterfront",
      client: "Unilever",
      product: "Omo Auto Washing Powder 2kg",
      action: "Low Stock",
      priority: "Normal",
      completed: false,
      time: "11:15 AM",
      logo: "https://logo.clearbit.com/unilever.com"
    },
    {
      id: 3,
      store: "Woolworths Rosebank",
      client: "Nestle",
      product: "Nescafe Gold 200g",
      action: "Facing",
      priority: "Normal",
      completed: false,
      time: "13:00 PM",
      logo: "https://logo.clearbit.com/nestle.com"
    },
    {
      id: 4,
      store: "Spar Green Point",
      client: "Kellogg's",
      product: "Corn Flakes 1kg",
      action: "Promotion",
      priority: "Urgent",
      completed: false,
      time: "15:45 PM",
      logo: "https://logo.clearbit.com/kelloggs.com"
    }
  ];

  return (
    <div className="w-[390px] h-[844px] bg-[#f8f9fa] overflow-hidden flex flex-col font-sans relative shadow-2xl mx-auto rounded-[40px] border-[8px] border-black my-8">
      {/* Status Bar Mock */}
      <div className="h-[47px] w-full flex justify-between items-center px-6 pt-2 shrink-0">
        <span className="text-[15px] font-semibold tracking-tight">9:41</span>
        <div className="flex gap-1.5 items-center">
          <div className="w-4 h-4 rounded-full border-[1.5px] border-black"></div>
          <div className="w-4 h-4 rounded-full border-[1.5px] border-black"></div>
          <div className="w-6 h-3.5 rounded-[4px] border-[1.5px] border-black"></div>
        </div>
      </div>

      {/* Header */}
      <div className="px-6 pt-4 pb-6 bg-white rounded-b-[32px] shadow-[0_4px_24px_rgba(0,0,0,0.02)] relative z-10">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-bold text-lg">
              JS
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Good morning,</p>
              <h1 className="text-xl font-bold text-gray-900 tracking-tight">James Smith</h1>
            </div>
          </div>
          <button className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-600 relative">
            <Bell size={20} />
            <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
          </button>
        </div>

        <div className="mb-4">
          <div className="flex justify-between items-end mb-2">
            <div>
              <p className="text-3xl font-bold text-gray-900 tracking-tight">7</p>
              <p className="text-sm text-gray-500 font-medium">Tasks for today</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-semibold text-teal-600">3 done</p>
              <p className="text-sm text-gray-400 font-medium">Oct 24, 2023</p>
            </div>
          </div>
          
          {/* Progress Bar */}
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mt-3">
            <div className="h-full bg-teal-500 rounded-full w-[42%] transition-all duration-500 ease-out"></div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6 scrollbar-hide pb-24">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-bold text-gray-900">Your Route</h2>
          <button className="text-teal-600 text-sm font-semibold flex items-center gap-1">
            <MapPin size={16} /> Map View
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {tasks.map((task) => (
            <div 
              key={task.id} 
              className={`bg-white rounded-2xl p-4 shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-gray-100/50 relative overflow-hidden transition-transform active:scale-[0.98]
                ${task.completed ? 'opacity-70' : ''}
              `}
            >
              {/* Priority Indicator */}
              <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                task.priority === 'Urgent' ? 'bg-orange-400' : 'bg-teal-400'
              }`}></div>

              <div className="flex justify-between items-start mb-3 pl-2">
                <div className="flex gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 p-1.5 flex items-center justify-center shrink-0">
                    <img src={task.logo} alt={task.client} className="w-full h-full object-contain rounded-lg" onError={(e) => {
                      e.currentTarget.src = `https://ui-avatars.com/api/?name=${task.client}&background=random&color=fff&rounded=true`
                    }} />
                  </div>
                  <div>
                    <h3 className={`font-semibold text-[15px] leading-tight mb-1 text-gray-900 ${task.completed ? 'line-through text-gray-500' : ''}`}>
                      {task.product}
                    </h3>
                    <p className="text-xs text-gray-500 font-medium flex items-center gap-1">
                      <MapPin size={12} className="text-gray-400" />
                      {task.store}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pl-2 mt-4">
                <div className="flex gap-2">
                  <span className={`px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-wide uppercase
                    ${task.action === 'OOS' ? 'bg-red-50 text-red-600' : 
                      task.action === 'Low Stock' ? 'bg-yellow-50 text-yellow-600' : 
                      'bg-blue-50 text-blue-600'
                    }`}>
                    {task.action}
                  </span>
                  {task.priority === 'Urgent' && (
                    <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-wide uppercase bg-orange-50 text-orange-600">
                      Urgent
                    </span>
                  )}
                </div>

                <button className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors
                  ${task.completed ? 'text-teal-500 bg-teal-50' : 'text-gray-300 border-[1.5px] border-gray-300 bg-white hover:border-teal-500 hover:text-teal-500'}
                `}>
                  {task.completed ? <CheckCircle2 size={32} strokeWidth={2} /> : <div className="w-full h-full rounded-full" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Bottom Nav Mock */}
      <div className="absolute bottom-0 left-0 right-0 h-20 bg-white border-t border-gray-100 flex justify-around items-center pb-4 px-6">
        <div className="flex flex-col items-center gap-1 text-teal-600">
          <div className="p-2 bg-teal-50 rounded-xl">
            <Menu size={20} />
          </div>
        </div>
        <div className="flex flex-col items-center gap-1 text-gray-400 hover:text-gray-600 transition-colors">
          <div className="p-2">
            <Search size={20} />
          </div>
        </div>
        <div className="flex flex-col items-center gap-1 text-gray-400 hover:text-gray-600 transition-colors">
          <div className="p-2">
            <Bell size={20} />
          </div>
        </div>
      </div>
    </div>
  );
}
