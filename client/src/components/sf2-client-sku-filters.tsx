import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";

interface SkuOption {
  barcode: string;
  articleDescription: string;
  client?: string;
}

interface Sf2ClientSkuFiltersProps {
  store: string;
  rep: string;
  client: string; // "" or "ALL" both mean "no explicit filter yet"
  basePath: string; // the current page's path, e.g. "/store-detail/supply"
  // When provided, picking a SKU calls this instead of navigating to the
  // full SKU detail page - Carin, 2026-08-13: "stay on the insights screen
  // and only change the numbers based on the selection." Omit to keep the
  // old navigate-away behavior (not currently used anywhere, kept for
  // pages that might want the full detail page instead).
  onSkuSelect?: (barcode: string, skuClient?: string) => void;
}

// Shared Client/SKU filter row - the same dropdowns Insights has, reused on
// Supply/Analysis/Fix so switching client works consistently everywhere
// (Carin, 2026-08-13: "what happened to the client and sku drop downs?" -
// they were only ever built into the Insights page, not carried over when
// Supply/Analysis/Fix were split out).
export default function Sf2ClientSkuFilters({ store, rep, client, basePath, onSkuSelect }: Sf2ClientSkuFiltersProps) {
  const [, setLocation] = useLocation();
  const activeClient = client || "ALL";

  const { data: clientOptions } = useQuery<{ clients: string[] }>({
    queryKey: ["clients-for-store", store, rep],
    queryFn: async () => {
      const res = await fetch(`/api/roster/clients-for-store?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}`);
      if (!res.ok) throw new Error("Failed to fetch clients");
      return res.json();
    },
    enabled: !!store,
  });

  const { data: skuOptions } = useQuery<{ rows: SkuOption[] }>({
    queryKey: ["nexus-sku-list", store, rep, "cover", activeClient],
    queryFn: async () => {
      const res = await fetch(`/api/roster/sku-list?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}&classification=cover&client=${encodeURIComponent(activeClient)}`);
      if (!res.ok) throw new Error("Failed to fetch SKU list");
      return res.json();
    },
    enabled: !!store,
  });

  const goTo = (path: string, extra: string) =>
    setLocation(`${path}?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}${extra}`);

  const setClient = (next: string) => {
    goTo(basePath, next ? `&client=${encodeURIComponent(next)}` : "&client=ALL");
  };

  const goToSku = (barcode: string, skuClient?: string) => {
    if (onSkuSelect) {
      onSkuSelect(barcode, skuClient);
      return;
    }
    const qs = skuClient ? `&client=${encodeURIComponent(skuClient)}` : (client ? `&client=${encodeURIComponent(client)}` : "&client=ALL");
    goTo("/store-detail/sku", `&classification=cover&barcode=${encodeURIComponent(barcode)}${qs}`);
  };

  return (
    <section className="sf2-filters">
      {(clientOptions?.clients?.length ?? 0) > 1 ? (
        <div className="sf2-filter sf2-filter-select">
          <span>Client</span>
          <select value={client && client !== "ALL" ? client : ""} onChange={(e) => setClient(e.target.value)}>
            <option value="">All Clients</option>
            {clientOptions!.clients.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      ) : (
        <div className="sf2-filter">
          <span>Client</span>
          <strong>{clientOptions?.clients?.[0] || "—"}</strong>
        </div>
      )}
      <div className="sf2-filter sf2-filter-select">
        <span>SKU</span>
        <select
          value=""
          onChange={(e) => {
            if (!e.target.value) return;
            const [barcode, skuClient] = e.target.value.split("::");
            goToSku(barcode, skuClient || undefined);
            e.target.value = "";
          }}
        >
          <option value="">All SKUs</option>
          {(skuOptions?.rows || []).map((r) => (
            <option key={`${r.client || ""}-${r.barcode}`} value={`${r.barcode}::${r.client || ""}`}>
              {r.articleDescription}{activeClient === "ALL" && r.client ? ` (${r.client})` : ""}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}
