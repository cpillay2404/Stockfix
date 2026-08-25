import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Wrench, Minus, Plus, Camera, AlertTriangle, X, CheckCircle2 } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import "./StoreOverview.css";
import { markVisitHasCaptures } from "@/lib/visit-guard";
import {
  getCaptureReturnNavigation,
  getCaptureReturnUrl,
} from "@/lib/action-capture-navigation";
import {
  getStockFixEmbeddedHeaders,
  isEmbeddedInPerfectStorePro,
  notifyStockFixTaskCaptured,
} from "@/lib/stockfix-embedded";

interface SkuRow {
  barcode: string;
  articleDescription: string;
  storeSoh: number;
  classification: string;
}
interface SkuListResponse {
  rows: SkuRow[];
}

// Real gap found 2026-08-21 (Carin: "the drop downs when the users are
// capturing lets fix that") - every classification showed the exact same
// full list, letting reps pick options that contradict the situation
// (e.g. "On shelf but slow moving" on a genuine Out of Stock task - if
// it's on the shelf, it isn't out of stock). Confirmed in real data: that
// exact contradiction was the single most-used reason code today. Filter
// each list to what actually makes sense for the task's classification.
const SHORTAGE_REASON_CODES = [
  "Awaiting delivery (order placed / not received)",
  "No stock available (DC / supplier)",
  "Store out of stock (not ordered / missed order)",
  "Stock in backroom (not on shelf)",
  "Shelf space constraint / planogram issue",
  "Not ranged / discontinued",
  "Store operational issue (closed / access / revamp)",
  "System / data issue (incorrect master data / mapping)",
  "Promo / display not set up",
  "Slow moving",
  "No action taken",
  "SOH counts correct",
  "Stock on shelf",
];
const EXCESS_REASON_CODES = [
  "Slow-moving / excess stock",
  "On shelf but slow moving",
  "Slow moving",
  "Stock on Shelf - Not selling",
  "Not ranged / discontinued",
  "Promo / display not set up",
  "Damaged / expired / returns",
  "System / data issue (incorrect master data / mapping)",
  "No action taken",
  "SOH counts correct",
  "Stock on shelf",
];
const DATA_ISSUE_REASON_CODES = [
  "System / data issue (incorrect master data / mapping)",
  "Damaged / expired / returns",
  "Store operational issue (closed / access / revamp)",
  "Slow moving",
  "No action taken",
  "SOH counts correct",
  "Stock on shelf",
];
const reasonCodesFor = (classification: string): string[] => {
  if (classification === "overstock") return EXCESS_REASON_CODES;
  if (classification === "negsoh") return DATA_ISSUE_REASON_CODES;
  return SHORTAGE_REASON_CODES;
};

const SHORTAGE_ACTIONS_TAKEN = [
  "Order placed",
  "Stock on Shelf - Physical count matching system SOH",
  "Escalated to supervisor / manager",
  "Logged query with DC / supplier",
  "Stock moved from backroom to shelf",
  "Shelf space / planogram discussed with store",
  "System stock corrected / discrepancy logged",
  "Promo / display action completed",
  "Follow-up required (awaiting delivery / revisit)",
  "Unable to action (store closed / access issue)",
  "Confirmed correct — no action needed",
];
const EXCESS_ACTIONS_TAKEN = [
  "Recommended for markdown / transfer (Stock not selling)",
  "Removed / disposed of expired stock",
  "Stock on Shelf - Physical count matching system SOH",
  "Escalated to supervisor / manager",
  "Logged query with DC / supplier",
  "System stock corrected / discrepancy logged",
  "Promo / display action completed",
  "Follow-up required (awaiting delivery / revisit)",
  "Unable to action (store closed / access issue)",
  "Confirmed correct — no action needed",
];
const actionsTakenFor = (classification: string): string[] => {
  if (classification === "overstock") return EXCESS_ACTIONS_TAKEN;
  return SHORTAGE_ACTIONS_TAKEN;
};

export default function ActionCapture() {
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const store = params.get("store") || "";
  const rep = params.get("rep") || "";
  const classification = params.get("classification") || "oos";
  const barcode = params.get("barcode") || "";
  const client = params.get("client") || "";
  const embeddedInParentApp = isEmbeddedInPerfectStorePro();
  const fallbackTaskId = params.get("taskId") || "";
  const isEmbeddedTaskFallback = embeddedInParentApp
    && params.get("scope") === "embedded-task-fallback"
    && Boolean(fallbackTaskId);
  const captureTokenHeaders = getStockFixEmbeddedHeaders();
  const repQuery = captureTokenHeaders["X-StockFix-Embedded"]
    ? ""
    : `&rep=${encodeURIComponent(rep)}`;
  // Real gap found 2026-08-21 (Carin: "user is unassigned in the capture
  // feed... going forward how are we going to fix this") - identity relied
  // ENTIRELY on the httpOnly sf_identity cookie surviving to this later
  // request, which can be flaky on mobile browsers/PWAs. select-rep-
  // store.tsx now also stores the identify token in localStorage; sending
  // it explicitly as a Bearer header is a reliable backup that doesn't
  // depend on cookie behavior - the server already prefers it over the
  // cookie. Only applies to direct StockFix sessions, never embedded ones
  // (which use their own separate capture-token header entirely).
  const identityHeaders: Record<string, string> = { ...captureTokenHeaders };
  if (!embeddedInParentApp) {
    try {
      const storedToken = localStorage.getItem("stockfix_identity_token");
      if (storedToken) identityHeaders["Authorization"] = `Bearer ${storedToken}`;
    } catch {
      // localStorage can throw in some restricted/private-browsing contexts.
    }
  }
  const clientQS = client ? `&client=${encodeURIComponent(client)}` : "";
  // Real bug found 2026-08-20 (Carin: "takes me back to the overstocks
  // screen and then it wants me to capture the task again") - scope=fix
  // was getting dropped here, so a capture from Fix's narrow overstock
  // list landed back on Insights' bigger blanket list, where the same
  // SKU can still legitimately appear - looking like it wasn't captured.
  const scope = params.get("scope") || "";
  const scopeQS = scope ? `&scope=${encodeURIComponent(scope)}` : "";
  const returnNavigation = getCaptureReturnNavigation(
    getCaptureReturnUrl(
      { store, rep, classification, client, scope },
      params.get("returnTo") || undefined,
    ),
  );

  const { data } = useQuery<SkuListResponse>({
    queryKey: ["nexus-sku-list", store, rep, classification, client, scope],
    queryFn: async () => {
      const res = await fetch(
        `/api/roster/sku-list?store=${encodeURIComponent(store)}${repQuery}&classification=${classification}${clientQS}${scopeQS}`,
        { headers: captureTokenHeaders },
      );
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!store && !isEmbeddedTaskFallback,
  });
  const { data: fallbackTasks } = useQuery<{
    tasks: Array<{ uniqueId: string; articleDescription: string; storeSoh: number }>;
  }>({
    queryKey: ["embedded-pending-tasks", store, client],
    queryFn: async () => {
      const res = await fetch(
        `/api/nexus-tasks/pending?store=${encodeURIComponent(store)}`,
        { headers: captureTokenHeaders },
      );
      if (!res.ok) throw new Error("Failed to fetch task details");
      return res.json();
    },
    enabled: isEmbeddedTaskFallback,
  });
  const fallbackTask = fallbackTasks?.tasks.find((task) => task.uniqueId === fallbackTaskId);
  const row = data?.rows.find((r) => r.barcode === barcode);
  const systemCount = row?.storeSoh ?? fallbackTask?.storeSoh ?? 0;
  const [fallbackCountInitialized, setFallbackCountInitialized] = useState(false);
  const [physicalCount, setPhysicalCount] = useState(systemCount);
  useEffect(() => {
    if (isEmbeddedTaskFallback && fallbackTask && !fallbackCountInitialized) {
      setPhysicalCount(fallbackTask.storeSoh);
      setFallbackCountInitialized(true);
    }
  }, [fallbackCountInitialized, fallbackTask, isEmbeddedTaskFallback]);
  const [stockAdjusted, setStockAdjusted] = useState<"yes" | "no" | "">("");
  const [reasonCode, setReasonCode] = useState("");
  const [actionTaken, setActionTaken] = useState("");
  const [feedback, setFeedback] = useState("");
  const [photos, setPhotos] = useState<Array<{ file: File; previewUrl: string } | null>>([null, null, null, null]);
  const photoCount = photos.filter((p) => p !== null).length;
  // Real gap found 2026-08-24 (Perfect Store Pro, after ruling out the
  // iframe/permissions-policy chain: "the browser is ignoring
  // capture=environment and choosing the gallery... implement the
  // explicit camera path with getUserMedia, called directly from the
  // user's tap, and show the error when permission or device access
  // fails"). capture="environment" is only a hint some mobile browsers
  // ignore, especially embedded. A real getUserMedia camera view is
  // called directly from the tap on each photo slot's button, with the
  // existing file input kept as a visible fallback if the camera can't
  // be opened, rather than a silent guess at what the user wanted.
  const [cameraSlotIndex, setCameraSlotIndex] = useState<number | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<{ slot: number; message: string } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRefs = useRef<Array<HTMLInputElement | null>>([null, null, null, null]);

  useEffect(() => {
    if (cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);

  const stopCamera = () => {
    cameraStream?.getTracks().forEach((track) => track.stop());
    setCameraStream(null);
    setCameraSlotIndex(null);
  };

  useEffect(() => {
    return () => { cameraStream?.getTracks().forEach((track) => track.stop()); };
  }, [cameraStream]);

  const openCamera = async (i: number) => {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      fileInputRefs.current[i]?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      setCameraStream(stream);
      setCameraSlotIndex(i);
    } catch (err: any) {
      const name = err?.name || "";
      const message =
        name === "NotAllowedError" || name === "SecurityError"
          ? "Camera permission was denied. Allow camera access in your browser settings, or choose a photo from your gallery instead."
          : name === "NotReadableError"
            ? "The camera is busy or unavailable right now. Try again, or choose a photo from your gallery instead."
            : name === "NotFoundError"
              ? "No camera was found on this device. Choose a photo from your gallery instead."
              : "Could not open the camera. Choose a photo from your gallery instead.";
      setCameraError({ slot: i, message });
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video || cameraSlotIndex === null) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const slot = cameraSlotIndex;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `capture-${Date.now()}.jpg`, { type: "image/jpeg" });
      const previewUrl = URL.createObjectURL(file);
      setPhotos((prev) => {
        const next = [...prev];
        if (next[slot]) URL.revokeObjectURL(next[slot]!.previewUrl);
        next[slot] = { file, previewUrl };
        return next;
      });
      stopCamera();
    }, "image/jpeg", 0.9);
  };
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [varianceDismissed, setVarianceDismissed] = useState(false);

  const onBack = () => setLocation(returnNavigation.destination, returnNavigation.options);

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
      let uniqueId = fallbackTaskId;
      let repName = "Unassigned";
      if (!isEmbeddedTaskFallback) {
        const resolveRes = await fetch(
          `/api/nexus-tasks/resolve?store=${encodeURIComponent(store)}&client=${encodeURIComponent(client)}&classification=${encodeURIComponent(classification)}&barcode=${encodeURIComponent(barcode)}`,
          { headers: identityHeaders },
        );
        if (!resolveRes.ok) {
          throw new Error("Couldn't find a task for this SKU/issue this week");
        }
        ({ uniqueId, repName } = await resolveRes.json());
      }

      if (repName.trim().toUpperCase() === "UNASSIGNED" && !embeddedInParentApp) {
        // Direct StockFix sessions use the rep/merchandiser identity selected
        // in StockFix. Embedded sessions leave identity assignment to the
        // authenticated parent application.
        const claimRes = await fetch(`/api/nexus-tasks/${encodeURIComponent(uniqueId)}/claim`, { method: "POST", headers: identityHeaders });
        if (!claimRes.ok) {
          let detail = "";
          try {
            const body = await claimRes.json();
            detail = typeof body?.error === "string" ? body.error : "";
          } catch {
            // Keep the user-facing error generic if the server did not return JSON.
          }
          throw new Error(detail || "Your StockFix identity could not be confirmed. Please go back and select your name again.");
        }
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
        headers: { "Content-Type": "application/json", ...identityHeaders },
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
      notifyStockFixTaskCaptured(uniqueId);
      markVisitHasCaptures(store, rep, client);
      setSubmitted(true);
      // Return to the saved source URL rather than jumping a presumed number
      // of browser-history entries. That keeps direct links and app launches
      // inside the store flow instead of accidentally reaching the splash.
      setTimeout(() => {
        setLocation(returnNavigation.destination, returnNavigation.options);
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
        </div>
      </header>

      <main className="sf2-content">
        <section className="sf2-actioncapture">
          <div className="sf2-ac-head">
            <div>
              <div className="sf2-ac-label">ACTION CAPTURE</div>
              <div className="sf2-ac-title">{row?.articleDescription || fallbackTask?.articleDescription || barcode}</div>
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
              {reasonCodesFor(classification).map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <div className="sf2-ac-field">
            <label>Action taken <span className="req">*</span></label>
            <select value={actionTaken} onChange={(e) => setActionTaken(e.target.value)} className="sf2-ac-select">
              <option value="">Select action taken...</option>
              {actionsTakenFor(classification).map((a) => <option key={a} value={a}>{a}</option>)}
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
                <div key={i} className="sf2-ac-photo" style={p ? { backgroundImage: `url(${p.previewUrl})` } : undefined}>
                  {/* Hidden fallback file input - the visible control is the
                      camera button below, but this stays available so a
                      failed/unavailable camera still has a working path
                      (native picker, which also offers "gallery" itself). */}
                  <input
                    ref={(el) => { fileInputRefs.current[i] = el; }}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sf2-ac-photo-input"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setPhotos((prev) => {
                        const next = [...prev];
                        if (next[i]) URL.revokeObjectURL(next[i]!.previewUrl);
                        next[i] = { file, previewUrl: URL.createObjectURL(file) };
                        return next;
                      });
                      setCameraError(null);
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
                    <button type="button" className="sf2-ac-photo-trigger" onClick={() => openCamera(i)} aria-label="Take photo">
                      <Camera size={18} />
                    </button>
                  )}
                  {cameraError?.slot === i && (
                    <div className="sf2-ac-camera-error">
                      {cameraError.message}
                      <button type="button" onClick={() => { setCameraError(null); fileInputRefs.current[i]?.click(); }}>
                        Choose from gallery
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {cameraSlotIndex !== null && (
            <div className="sf2-ac-camera-overlay" role="dialog" aria-modal="true">
              <video ref={videoRef} autoPlay playsInline muted className="sf2-ac-camera-video" />
              <div className="sf2-ac-camera-controls">
                <button type="button" className="sf2-ac-camera-cancel" onClick={stopCamera}>Cancel</button>
                <button type="button" className="sf2-ac-camera-shutter" onClick={capturePhoto} aria-label="Capture photo" />
              </div>
            </div>
          )}

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
