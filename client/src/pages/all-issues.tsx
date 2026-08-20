import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import Sf2LoadingState from "@/components/sf2-loading-state";
import "./StoreOverview.css";

interface SkuRow {
  barcode: string;
  articleDescription: string;
  storeSoh: number;
  dcSoh: number | null;
  sellOutP4: number | null;
  cover: number | null;
  classification: string;
  priority: string | null;
}
interface SkuListResponse {
  resolvedClient: string;
  rows: SkuRow[];
}

const CHIPS = [
  { key: "oos", label: "Out of Stock" },
  { key: "low", label: "Low Stock" },
  { key: "risk", label: "At Risk" },
  { key: "distribution", label: "Distribution Gaps" },
  { key: "overstock", label: "Overstock" },
  { key: "negsoh", label: "Negative SOH" },
];

export default function AllIssues() {
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const store = params.get("store") || "";
  const rep = params.get("rep") || "";
  const client = params.get("client") || "";
  const clientQS = client ? `&client=${encodeURIComponent(client)}` : "";
  const urgentOnly = params.get("filter") === "urgent";
  const [activeChip, setActiveChip] = useState<string>("all");

  const queries = CHIPS.map((c) =>
    useQuery<SkuListResponse>({
      queryKey: ["nexus-sku-list", store, rep, c.key, client],
      queryFn: async () => {
        const res = await fetch(`/api/roster/sku-list?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}&classification=${c.key}${clientQS}`);
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json();
      },
      enabled: !!store,
    })
  );

  const insightsPath = `/store-detail?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}${clientQS}`;
  const onBack = () => setLocation(insightsPath, { replace: true });
  const goToSku = (barcode: string, classification: string) => {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    setLocation(`/store-detail/sku?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}&classification=${classification}&barcode=${encodeURIComponent(barcode)}${clientQS}&returnTo=${encodeURIComponent(returnTo)}`);
  };

  const isLoading = queries.some((q) => q.isLoading);
  const anyError = queries.some((q) => q.error);
  const resolvedClient = queries.find((q) => q.data)?.data?.resolvedClient || "";

  if (isLoading) return <Sf2LoadingState />;
  if (anyError) return <div className="store-overview-page"><p className="error-state">Couldn't load this data right now.</p></div>;

  let allRows = CHIPS.flatMap((c, i) => (queries[i].data?.rows || []).map((r) => ({ ...r, source: c.key })));

  if (urgentOnly) {
    allRows = allRows.filter((r) => String(r.priority || "").startsWith("P1"));
  }
  if (activeChip !== "all") {
    allRows = allRows.filter((r) => r.source === activeChip);
  }

  return (
    <div className="store-overview-page">
      <header className="topbar">
        <button className="icon-btn" onClick={onBack}><ArrowLeft size={24} /></button>
        <div className="brand"><BrandLogo size={20} /></div>
        <div className="sync-state"><span className="sync-dot" /><span>Synced</span></div>
      </header>

      <main className="page-content">
        <div className="detailhead">
          <h1>{urgentOnly ? "Urgent Issues" : "All Stock Issues"}</h1>
          <p>{resolvedClient} · {store.toUpperCase()}{urgentOnly ? " · P1 priority only" : ""}</p>
        </div>

        <div className="pillrow">
          <button className={`pill ${activeChip === "all" ? "active" : ""}`} onClick={() => setActiveChip("all")}>All</button>
          {CHIPS.map((c) => (
            <button key={c.key} className={`pill ${activeChip === c.key ? "active" : ""}`} onClick={() => setActiveChip(c.key)}>{c.label}</button>
          ))}
        </div>

        <section className="store-card list">
          {allRows.map((r, i) => (
            <button className="row" key={`${r.barcode}-${i}`} onClick={() => goToSku(r.barcode, r.source)}>
              <div>
                <div className="rowtitle">{r.articleDescription}</div>
                <div className="rowmeta">
                  {r.classification} · Store SOH {r.storeSoh}
                  {r.dcSoh !== null && ` · DC SOH ${r.dcSoh}`}
                  {r.cover !== null && ` · WFC ${r.cover.toFixed(1)}`}
                </div>
              </div>
              <div className="rowright"><ChevronRight size={20} /></div>
            </button>
          ))}
          {allRows.length === 0 && <p className="empty-state">No issues match this filter.</p>}
        </section>
      </main>
    </div>
  );
}
