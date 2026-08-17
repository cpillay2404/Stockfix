import { useLocation } from "wouter";
import { Store as StoreIcon, Package, Truck, BarChart3, Wrench } from "lucide-react";

interface Sf2BottomNavProps {
  active: "stores" | "insights" | "supply" | "analysis" | "fix";
  store: string;
  rep: string;
  clientQS: string;
}

// Shared 5-tab nav (Carin, 2026-08-13 restructure): each tab has one clear
// job - Insights = what's wrong, Supply = can we replenish it, Analysis =
// why/trend/risk, Fix = what do I need to do. Previously duplicated inline
// per-page; extracted so the new Supply/Analysis/Fix landing pages share
// the exact same nav as the Insights (store overview) page.
export default function Sf2BottomNav({ active, store, rep, clientQS }: Sf2BottomNavProps) {
  const [, setLocation] = useLocation();
  const qs = `store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}${clientQS}`;

  return (
    <nav className="sf2-bottomnav">
      <button className={active === "stores" ? "active" : ""} onClick={() => setLocation(`/stores?rep=${encodeURIComponent(rep)}`)}>
        <StoreIcon size={20} /><small>Stores</small>
      </button>
      <button className={active === "insights" ? "active" : ""} onClick={() => setLocation(`/store-detail?${qs}`)}>
        <Package size={20} /><small>Insights</small>
      </button>
      <button className={active === "supply" ? "active" : ""} onClick={() => setLocation(`/store-detail/supply?${qs}`)}>
        <Truck size={20} /><small>Supply</small>
      </button>
      <button className={active === "analysis" ? "active" : ""} onClick={() => setLocation(`/store-detail/analysis?${qs}`)}>
        <BarChart3 size={20} /><small>Analysis</small>
      </button>
      <button className={active === "fix" ? "active" : ""} onClick={() => setLocation(`/store-detail/fix?${qs}`)}>
        <Wrench size={20} /><small>Fix</small>
      </button>
    </nav>
  );
}
