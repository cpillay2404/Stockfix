import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Bell, Wrench, Minus, Plus, Camera, AlertTriangle, X, CheckCircle2 } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import "./StoreOverview.css";

interface SkuRow {
  barcode: string;
  articleDescription: string;
  storeSoh: number;
  classification: string;
}
interface SkuListResponse {
  rows: SkuRow[];
}

const REASON_CODES = [
  "Awaiting delivery (order placed / not received)",
  "No stock available (DC / supplier)",
  "Store out of stock (not ordered / missed order)",
  "Stock in backroom (not on shelf)",
  "Shelf space constraint / planogram issue",
  "Slow-moving / excess stock",
  "On shelf but slow moving",
  "Damaged / expired / returns",
  "Not ranged / discontinued",
  "Store operational issue (closed / access / revamp)",
  "System / data issue (incorrect master data / mapping)",
  "Promo / display not set up",
];

const ACTIONS_TAKEN = [
  "Order placed",
  "Escalated to supervisor / manager",
  "Logged query with DC / supplier",
  "Stock moved from backroom to shelf",
  "Shelf space / planogram discussed with store",
  "System stock corrected / discrepancy logged",
  "Promo / display action completed",
  "Follow-up required (awaiting delivery / revisit)",
  "Unable to action (store closed / access issue)",
];

export default function ActionCapture() {
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const store = params.get("store") || "";
  const rep = params.get("rep") || "";
  const classification = params.get("classification") || "oos";
  const barcode = params.get("barcode") || "";
  const client = params.get("client") || "";
  const clientQS = client ? `&client=${encodeURIComponent(client)}` : "";

  const { data } = useQuery<SkuListResponse>({
    queryKey: ["nexus-sku-list", store, rep, classification, client],
    queryFn: async () => {
      const res = await fetch(`/api/roster/sku-list?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}&classification=${classification}${clientQS}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!store,
  });
  const row = data?.rows.find((r) => r.barcode === barcode);
  const systemCount = row?.storeSoh ?? 0;

  const [physicalCount, setPhysicalCount] = useState(systemCount);
  const [stockAdjusted, setStockAdjusted] = useState<"yes" | "no" | "">("");
  const [reasonCode, setReasonCode] = useState("");
  const [actionTaken, setActionTaken] = useState("");
  const [feedback, setFeedback] = useState("");
  const [photos, setPhotos] = useState<Array<{ file: File; previewUrl: string } | null>>([null, null, null, null]);
  const photoCount = photos.filter((p) => p !== null).length;
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [varianceDismissed, setVarianceDismissed] = useState(false);

  const onBack = () => window.history.back();

  const variance = physicalCount - systemCount;
  const hasVariance = variance !== 0;

  const canSubmit = reasonCode !== "" && actionTaken !== "" && feedback.trim() !== "" && photoCount > 0
    && (!hasVariance || stockAdjusted !== "") && !submitted;

  const submitBlockedReason = () => {
    if (hasVariance && stockAdjusted === "") return "Confirm whether system stock was adjusted";
    if (reasonCode === "") return "Pick a reason code to submit";
    if (actionTaken === "") return "Pick an action taken to submit";
    if (feedback.trim() === "") return "Add feedback to submit";
    if (photoCount === 0) return "Add at least one photo to submit";
    return "";
  };

  const handleSubmit = async () => {
    setSubmitError("");
    setSubmitting(true);
    try {
      const resolveRes = await fetch(
        `/api/nexus-tasks/resolve?store=${encodeURIComponent(store)}&client=${encodeURIComponent(client)}&classification=${encodeURIComponent(classification)}&barcode=${encodeURIComponent(barcode)}`
      );
      if (!resolveRes.ok) {
        throw new Error("Couldn't find a task for this SKU/issue this week");
      }
      const { uniqueId, repName } = await resolveRes.json();

      if (repName === "Unassigned") {
        // Best-effort claim - store/client scoping already confirmed a real
        // task exists; if this session isn't identified the claim silently
        // no-ops server-side and the task stays Unassigned, but feedback
        // still saves via the PATCH below either way.
        await fetch(`/api/nexus-tasks/${encodeURIComponent(uniqueId)}/claim`, { method: "POST" }).catch(() => {});
      }

      const capturedPhotos = photos.filter((p): p is { file: File; previewUrl: string } => p !== null);
      const uploadedPaths: string[] = [];
      for (const p of capturedPhotos) {
        const requestRes = await fetch("/api/uploads/request-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: p.file.name, size: p.file.size, contentType: p.file.type }),
        });
        if (!requestRes.ok) throw new Error("Couldn't prepare photo upload");
        const { uploadURL, objectPath } = await requestRes.json();
        const putRes = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": p.file.type }, body: p.file });
        if (!putRes.ok) throw new Error("Photo upload failed");
        uploadedPaths.push(objectPath);
      }

      const patchRes = await fetch(`/api/nexus-tasks/${encodeURIComponent(uniqueId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionStatus: "Completed",
          reasonCode,
          actionTakenComment: actionTaken,
          feedback,
          physicalCount: String(physicalCount),
          variance: String(variance),
          systemAdjusted: hasVariance ? (stockAdjusted === "yes" ? "Yes" : "No") : undefined,
          image1: uploadedPaths[0] || undefined,
          image2: uploadedPaths[1] || undefined,
          image3: uploadedPaths[2] || undefined,
          image4: uploadedPaths[3] || undefined,
        }),
      });
      if (!patchRes.ok) {
        throw new Error("Failed to save this action");
      }
      setSubmitted(true);
      // Real gap found 2026-08-18 (Carin: "no toast or to say its logged...
      // theres no end visit or log out or fuck all") - submitting just sat
      // on a dead "Action Submitted" screen with nowhere to go. Confirm,
      // then automatically return to the list this SKU came from so the
      // rep can keep working through it.
      setTimeout(() => {
        setLocation(`/store-detail/list?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}&classification=${classification}${clientQS}`);
      }, 1400);
    } catch (err: any) {
      setSubmitError(err?.message || "Failed to submit action");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="stockfix2-page">
      <header className="sf2-topbar">
        <BrandLogo size={20} />
        <div className="sf2-topbar-right">
          <span className="sf2-sync"><span className="sf2-sync-dot" />Synced</span>
          <Bell size={18} />
        </div>
      </header>

      <main className="sf2-content">
        <section className="sf2-actioncapture">
          <div className="sf2-ac-head">
            <div>
              <div className="sf2-ac-label">ACTION CAPTURE</div>
              <div className="sf2-ac-title">{row?.articleDescription || barcode}</div>
            </div>
            {hasVariance && (
              <span className="sf2-ac-variancebadge">
                <AlertTriangle size={12} /> Variance detected: {variance > 0 ? "+" : ""}{variance}
              </span>
            )}
          </div>

          <div className="sf2-ac-field">
            <label>Physical count <span className="req">*</span></label>
            <div className="sf2-ac-stepper">
              <button onClick={() => setPhysicalCount(Math.max(0, physicalCount - 1))}><Minus size={16} /></button>
              <div className="sf2-ac-count">{physicalCount}</div>
              <button onClick={() => setPhysicalCount(physicalCount + 1)}><Plus size={16} /></button>
            </div>
            <div className="sf2-ac-hint">
              {physicalCount === systemCount ? `Matches system count of ${systemCount}` : `${variance > 0 ? "+" : ""}${variance} vs system count of ${systemCount}`}
            </div>
          </div>

          {hasVariance && !varianceDismissed && (
            <div className="sf2-ac-variancebanner">
              <div className="sf2-ac-variancebanner-head">
                <AlertTriangle size={16} />
                <span>Stock variance detected</span>
                <button className="sf2-ac-variancebanner-close" onClick={() => setVarianceDismissed(true)}><X size={14} /></button>
              </div>
              <div className="sf2-ac-variancebanner-sub">
                System SOH {systemCount} · Physical {physicalCount} · Variance {variance > 0 ? "+" : ""}{variance}
              </div>
              <div className="sf2-ac-variancebanner-note">
                Make sure the discrepancy is addressed to avoid replenishment issues.
              </div>
            </div>
          )}

          {hasVariance && (
            <div className="sf2-ac-field">
              <label>System stock adjusted? <span className="req">*</span></label>
              <div className="sf2-ac-yesno">
                <button className={stockAdjusted === "yes" ? "active" : ""} onClick={() => setStockAdjusted("yes")}>
                  <span className="sf2-ac-radio" />Yes
                </button>
                <button className={stockAdjusted === "no" ? "active" : ""} onClick={() => setStockAdjusted("no")}>
                  <span className="sf2-ac-radio" />No
                </button>
              </div>
            </div>
          )}

          <div className="sf2-ac-field">
            <label>Reason code <span className="req">*</span></label>
            <select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)} className="sf2-ac-select">
              <option value="">Select reason code...</option>
              {REASON_CODES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <div className="sf2-ac-field">
            <label>Action taken <span className="req">*</span></label>
            <select value={actionTaken} onChange={(e) => setActionTaken(e.target.value)} className="sf2-ac-select">
              <option value="">Select action taken...</option>
              {ACTIONS_TAKEN.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          <div className="sf2-ac-field">
            <label>Feedback <span className="req">*</span></label>
            <textarea placeholder="Enter feedback..." value={feedback} onChange={(e) => setFeedback(e.target.value)} className="sf2-ac-textarea" />
          </div>

          <div className="sf2-ac-field">
            <label>Photos <span className="req">*</span> <span className="sf2-ac-sublabel">up to 4</span></label>
            <div className="sf2-ac-photos">
              {photos.map((p, i) => (
                <label key={i} className="sf2-ac-photo" style={p ? { backgroundImage: `url(${p.previewUrl})` } : undefined}>
                  <input
                    type="file"
                    accept="image/*"
                    className="sf2-ac-photo-input"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setPhotos((prev) => {
                        const next = [...prev];
                        if (next[i]) URL.revokeObjectURL(next[i]!.previewUrl);
                        next[i] = { file, previewUrl: URL.createObjectURL(file) };
                        return next;
                      });
                    }}
                  />
                  {p ? (
                    <button
                      type="button"
                      className="sf2-ac-photo-remove"
                      onClick={(e) => {
                        e.preventDefault();
                        setPhotos((prev) => {
                          const next = [...prev];
                          URL.revokeObjectURL(next[i]!.previewUrl);
                          next[i] = null;
                          return next;
                        });
                      }}
                    >
                      <X size={12} />
                    </button>
                  ) : (
                    <Camera size={18} />
                  )}
                </label>
              ))}
            </div>
          </div>

          {submitted ? (
            <div className="sf2-ac-toast">
              <CheckCircle2 size={16} />
              Fix logged - returning to the list...
            </div>
          ) : (
            <p className="sf2-ac-note">
              {submitError || (!canSubmit ? submitBlockedReason() : "Note: photos aren't uploaded yet - everything else saves.")}
            </p>
          )}

          <div className="sf2-ac-actions">
            <button className="sf2-ac-cancel" onClick={onBack}>Cancel</button>
            <button className="sf2-ac-submit" disabled={!canSubmit || submitting} onClick={handleSubmit}>
              <Wrench size={16} />
              {submitting ? "Submitting..." : submitted ? "Action Submitted" : "Submit action"}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
