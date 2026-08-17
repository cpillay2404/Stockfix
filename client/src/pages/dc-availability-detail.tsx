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
  cover: number | null;
}
interface SkuListResponse {
  resolvedClient: string;
  rows: SkuRow[];
}

export default function DcAvailabilityDetail() {
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const store = params.get("store") || "";
  const rep = params.get("rep") || "";
  const client = params.get("client") || "";
  const clientQS = client ? `&client=${encodeURIComponent(client)}` : "";

  const fetchList = (classification: string) => async (): Promise<SkuListResponse> => {
    const res = await fetch(`/api/roster/sku-list?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}&classification=${classification}${clientQS}`);
    if (!res.ok) throw new Error("Failed to fetch");
    return res.json();
  };

  const oosQuery = useQuery({ queryKey: ["nexus-sku-list", store, rep, "oos", client], queryFn: fetchList("oos"), enabled: !!store });
  const lowQuery = useQuery({ queryKey: ["nexus-sku-list", store, rep, "low", client], queryFn: fetchList("low"), enabled: !!store });

  const onBack = () => window.history.back();
  const goToSku = (barcode: string, classification: string) =>
    setLocation(`/store-detail/sku?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}&classification=${classification}&barcode=${encodeURIComponent(barcode)}${clientQS}`);

  if (oosQuery.isLoading || lowQuery.isLoading) {
    return <Sf2LoadingState />;
  }
  if (oosQuery.error || lowQuery.error || !oosQuery.data || !lowQuery.data) {
    return <div className="store-overview-page"><p className="error-state">Couldn't load this data right now.</p></div>;
  }

  const oosWithDc = oosQuery.data.rows.filter((r) => (r.dcSoh || 0) > 0);
  const oosNoDc = oosQuery.data.rows.filter((r) => (r.dcSoh || 0) === 0);
  const lowWithDc = lowQuery.data.rows.filter((r) => (r.dcSoh || 0) > 0);

  const Section = ({ title, subtitle, rows, classification }: { title: string; subtitle: string; rows: SkuRow[]; classification: string }) => (
    <>
      <div className="sectionhead"><h2>{title}</h2><small>{rows.length} SKUs</small></div>
      <section className="store-card list" style={{ marginBottom: 12 }}>
        {rows.slice(0, 10).map((r) => (
          <button className="row" key={r.barcode} onClick={() => goToSku(r.barcode, classification)}>
            <div>
              <div className="rowtitle">{r.articleDescription}</div>
              <div className="rowmeta">Store SOH {r.storeSoh} · DC SOH {r.dcSoh ?? "—"}</div>
            </div>
            <div className="rowright"><ChevronRight size={20} /></div>
          </button>
        ))}
        {rows.length === 0 && <p className="empty-state">None.</p>}
        {rows.length > 10 && <p className="loading-state" style={{ fontSize: 11, padding: "8px 0" }}>+{rows.length - 10} more</p>}
      </section>
    </>
  );

  return (
    <div className="store-overview-page">
      <header className="topbar">
        <button className="icon-btn" onClick={onBack}><ArrowLeft size={24} /></button>
        <div className="brand"><BrandLogo size={20} /></div>
        <div className="sync-state"><span className="sync-dot" /><span>Synced</span></div>
      </header>

      <main className="page-content">
        <div className="detailhead">
          <h1>Supply Availability</h1>
          <p>{oosQuery.data.resolvedClient} — distinguishes store execution opportunity vs. supply constraint</p>
        </div>

        <section className="summary">
          <div className="store-card stat"><div className="n">{oosWithDc.length}</div><div className="l">OOS, DC has stock</div></div>
          <div className="store-card stat"><div className="n">{oosNoDc.length}</div><div className="l">OOS, no DC stock</div></div>
          <div className="store-card stat"><div className="n">{lowWithDc.length}</div><div className="l">Low, DC has stock</div></div>
        </section>

        <Section title="OOS — DC Has Stock" subtitle="Escalate for replenishment" rows={oosWithDc} classification="oos" />
        <Section title="OOS — No DC Stock" subtitle="Supply constrained" rows={oosNoDc} classification="oos" />
        <Section title="Low Stock — DC Has Stock" subtitle="Order now" rows={lowWithDc} classification="low" />
      </main>
    </div>
  );
}
