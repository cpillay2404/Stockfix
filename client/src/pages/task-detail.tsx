import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation, useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchTask, updateTask, uploadImage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ArrowLeft, Camera, CheckCircle2, AlertCircle, Loader2, X, Plus, LogOut, ClipboardEdit, Image } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ComposedChart, Bar, Line, XAxis, YAxis, ResponsiveContainer, LabelList } from "recharts";
import BottomNav from "@/components/BottomNav";
import { useAccess } from "@/context/AccessContext";

const REASON_CODES = [
  "Awaiting delivery / stock not received",
  "Order placed",
  "Damaged or expired",
  "Count corrected – system = physical count",
  "Manual correction done",
  "No shelf space",
  "Slow-moving stock",
  "Stock in backroom",
  "Stock received and on shelf",
  "Store closed / promo / revamp",
  "System or data error",
  "Other"
];

const ACTIONS_REQUIRING_PHYSICAL_COUNT = [
  "Fix Counts: Negative SOH",
  "Check Count: No Sales in 30 Days"
];

const requiresPhysicalCountForAction = (action: string): boolean => {
  if (!action) return false;
  return ACTIONS_REQUIRING_PHYSICAL_COUNT.some(
    requiredAction => action === requiredAction || action.includes(requiredAction)
  );
};

interface ChartDataPoint {
  weekEnding: string;
  value: number;
}

function MiniChart({ title, data }: { title: string; data: ChartDataPoint[] }) {
  const displayData = (!data || data.length === 0) 
    ? [{ weekEnding: '', value: 0 }] 
    : data;
  
  const formatWeekLabel = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}`;
    }
    return dateStr;
  };

  const formatValue = (val: number) => {
    if (val >= 1000) return `${(val / 1000).toFixed(1)}k`;
    if (val % 1 !== 0) return val.toFixed(1);
    return val.toString();
  };

  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: '10px', color: '#6B7280', marginBottom: '4px', fontWeight: 600, textAlign: 'center' }}>
        {title}
      </div>
      <div style={{ height: '70px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={displayData} margin={{ top: 15, right: 2, left: -20, bottom: 0 }}>
            <XAxis 
              dataKey="weekEnding" 
              tick={{ fontSize: 7, fill: '#9CA3AF' }}
              tickFormatter={formatWeekLabel}
              axisLine={false}
              tickLine={false}
              interval={0}
            />
            <YAxis 
              tick={{ fontSize: 7, fill: '#9CA3AF' }}
              axisLine={false}
              tickLine={false}
              width={18}
            />
            <Bar dataKey="value" fill="#003B71" radius={[2, 2, 0, 0]}>
              <LabelList 
                dataKey="value" 
                position="top" 
                fill="#F36C21" 
                fontSize={8}
                fontWeight={700}
                formatter={formatValue}
              />
            </Bar>
            <Line 
              type="monotone" 
              dataKey="value" 
              stroke="#F36C21" 
              strokeWidth={1.5}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const getActionBgColor = (action: string) => {
  const a = action?.toLowerCase() || '';
  if (a.includes('urgent') || a.includes('fix counts')) return '#DC2626';
  if (a.includes('review') || a.includes('oos') || a.includes('check count')) return '#F97316';
  if (a.includes('monitor')) return '#3B82F6';
  if (a.includes('optimal')) return '#22C55E';
  return '#F36C21';
};

export default function TaskDetail() {
  const [match, params] = useRoute("/task/:id");
  const [, setLocation] = useLocation();
  const search = useSearch();
  const urlParams = new URLSearchParams(search);
  const { accessMode, clientLocked, clearAll, selectedClient: contextClient, selectedStore: contextStore } = useAccess();
  
  const isClientMode = accessMode === 'client' && clientLocked;
  
  useEffect(() => {
    if (isClientMode && (!contextClient || !contextStore)) {
      setLocation('/select-client');
    }
  }, [isClientMode, contextClient, contextStore, setLocation]);
  
  const repFilter = isClientMode ? '' : (urlParams.get('rep') || '');
  const storeFilter = isClientMode && contextStore ? contextStore : (urlParams.get('store') || '');
  const clientFilter = isClientMode && contextClient ? contextClient : (urlParams.get('client') || '');
  const articleFilter = urlParams.get('article') || '';
  const fromPage = urlParams.get('from') || '';
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [physicalCount, setPhysicalCount] = useState<string>("");
  const [systemAdjusted, setSystemAdjusted] = useState<boolean | null>(null);
  const [reasonCode, setReasonCode] = useState("");
  const [actionTakenComment, setActionTakenComment] = useState("");
  const [feedback, setFeedback] = useState("");
  const [image1, setImage1] = useState<string | null>(null);
  const [image2, setImage2] = useState<string | null>(null);
  const [image3, setImage3] = useState<string | null>(null);
  const [image4, setImage4] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState<1 | 2 | 3 | 4 | null>(null);
  const [showPhotoChoice, setShowPhotoChoice] = useState(false);
  const [activePhotoSlot, setActivePhotoSlot] = useState<1 | 2 | 3 | 4>(1);
  
  const cameraInput1 = useRef<HTMLInputElement>(null);
  const cameraInput2 = useRef<HTMLInputElement>(null);
  const cameraInput3 = useRef<HTMLInputElement>(null);
  const cameraInput4 = useRef<HTMLInputElement>(null);
  const galleryInput1 = useRef<HTMLInputElement>(null);
  const galleryInput2 = useRef<HTMLInputElement>(null);
  const galleryInput3 = useRef<HTMLInputElement>(null);
  const galleryInput4 = useRef<HTMLInputElement>(null);

  const { data: task, isLoading } = useQuery({
    queryKey: ["task", params?.id],
    queryFn: () => fetchTask(params!.id),
    enabled: !!params?.id,
  });

  const { data: trendData } = useQuery({
    queryKey: ["skuTrends", task?.storeName, task?.barcode],
    queryFn: async () => {
      if (!task) return null;
      const params = new URLSearchParams({
        barcode: task.barcode,
        store: task.storeName,
      });
      const response = await fetch(`/api/sku-trends?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch SKU trends');
      const data = await response.json();
      return {
        storeSoh: data.storeSoh || [],
        sellOut: data.sellOut || [],
        wfc: data.wfc || [],
      };
    },
    enabled: !!task,
  });

  const updateMutation = useMutation({
    mutationFn: (updates: any) => updateTask(params!.id, updates),
    onSuccess: async () => {
      // Invalidate and refetch all related queries to ensure fresh data
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tasks"] }),
        queryClient.invalidateQueries({ queryKey: ["task", params?.id] }),
        queryClient.invalidateQueries({ queryKey: ["task-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["store-overview"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] }),
        queryClient.invalidateQueries({ queryKey: ["gamification-leaderboard"] }),
      ]);
      
      toast({
        title: "Action Submitted",
        description: "Task marked as completed.",
      });
      handleBackToTasks();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to submit action. Please try again.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (task) {
      setPhysicalCount(task.physicalCount || "");
      setSystemAdjusted(task.systemAdjusted === "Yes" ? true : task.systemAdjusted === "No" ? false : null);
      setReasonCode(task.reasonCode || "");
      setActionTakenComment(task.actionTakenComment || "");
      setFeedback(task.feedback || "");
      setImage1(task.image1 || null);
      setImage2(task.image2 || null);
      setImage3(task.image3 || null);
      setImage4(task.image4 || null);
    }
  }, [task]);

  const handleBackToTasks = () => {
    const params = new URLSearchParams();
    if (repFilter) params.set('rep', repFilter);
    if (storeFilter) params.set('store', storeFilter);
    if (clientFilter) params.set('client', clientFilter);
    if (articleFilter) params.set('article', articleFilter);
    
    // Navigate back to the page they came from
    if (fromPage === 'rep-progress' && repFilter) {
      setLocation(`/rep-progress?${params.toString()}`);
    } else {
      setLocation(`/tasks?${params.toString()}`);
    }
  };

  const handleExitVisit = () => {
    const params = new URLSearchParams();
    if (repFilter) params.set('rep', repFilter);
    if (storeFilter) params.set('store', storeFilter);
    if (clientFilter) params.set('client', clientFilter);
    if (articleFilter) params.set('article', articleFilter);
    setLocation(`/exit-visit?${params.toString()}`);
  };

  if (!params?.id) return null;

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#F3F4F6' }}>
        <div style={{ backgroundColor: '#003B71', padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'rgba(255,255,255,0.8)' }}>
              <ArrowLeft style={{ width: '18px', height: '18px' }} />
              <span>Back</span>
            </div>
            <h1 style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', fontSize: '18px', fontWeight: 600, color: '#FFFFFF', margin: 0 }}>Task Feedback</h1>
            <div style={{ width: '70px' }} />
          </div>
        </div>
        <div style={{ padding: '16px' }}>
          <Skeleton style={{ height: '100px', borderRadius: '12px', backgroundColor: '#E5E7EB', marginBottom: '12px' }} />
          <Skeleton style={{ height: '100px', borderRadius: '12px', backgroundColor: '#E5E7EB', marginBottom: '12px' }} />
          <Skeleton style={{ height: '200px', borderRadius: '12px', backgroundColor: '#E5E7EB' }} />
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#F3F4F6', display: 'flex', flexDirection: 'column' }}>
        <div style={{ backgroundColor: '#003B71', padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
            <button onClick={handleBackToTasks} style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'rgba(255,255,255,0.8)', background: 'none', border: 'none', cursor: 'pointer' }}>
              <ArrowLeft style={{ width: '18px', height: '18px' }} />
              <span>Back</span>
            </button>
            <h1 style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', fontSize: '18px', fontWeight: 600, color: '#FFFFFF', margin: 0 }}>Task Feedback</h1>
            <div style={{ width: '70px' }} />
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: '12px', padding: '32px', textAlign: 'center' }}>
            <AlertCircle style={{ width: '48px', height: '48px', margin: '0 auto', color: '#9CA3AF', marginBottom: '16px' }} />
            <h2 style={{ fontSize: '18px', fontWeight: 500, marginBottom: '8px' }}>Task not found</h2>
            <Button variant="link" onClick={handleBackToTasks}>Go back to tasks</Button>
          </div>
        </div>
      </div>
    );
  }

  const storeSohNum = parseFloat(task.storeSoh || "0") || 0;
  const physicalCountNum = parseFloat(physicalCount) || 0;
  const variance = physicalCount ? physicalCountNum - storeSohNum : null;

  const requiresPhysicalCount = requiresPhysicalCountForAction(task.action || '');

  const handleSubmit = () => {
    if (!physicalCount) {
      toast({
        title: "Physical Count Required",
        description: "Please enter the physical count.",
        variant: "destructive"
      });
      return;
    }

    if (systemAdjusted === null) {
      toast({
        title: "Selection Required",
        description: "Please select Yes or No for system adjustment.",
        variant: "destructive"
      });
      return;
    }

    if (!reasonCode) {
      toast({
        title: "Reason Code Required",
        description: "Please select a reason code.",
        variant: "destructive"
      });
      return;
    }

    if (!actionTakenComment.trim()) {
      toast({
        title: "Action Taken Required",
        description: "Please enter the action taken or comment.",
        variant: "destructive"
      });
      return;
    }

    if (!feedback.trim()) {
      toast({
        title: "Feedback Required",
        description: "Please enter feedback.",
        variant: "destructive"
      });
      return;
    }

    if (!image1 && !image2 && !image3 && !image4) {
      toast({
        title: "Photo Required",
        description: "Please capture at least one photo.",
        variant: "destructive"
      });
      return;
    }

    updateMutation.mutate({
      actionStatus: 'Completed',
      physicalCount: physicalCount || null,
      variance: variance !== null ? variance.toString() : null,
      systemAdjusted: systemAdjusted ? "Yes" : "No",
      reasonCode: reasonCode || null,
      actionTakenComment: actionTakenComment || null,
      feedback: feedback || null,
      image1: image1 || null,
      image2: image2 || null,
      image3: image3 || null,
      image4: image4 || null,
      captureDate: new Date().toISOString(),
    });
  };

  const handleImageClick = (slot: 1 | 2 | 3 | 4) => {
    setActivePhotoSlot(slot);
    setShowPhotoChoice(true);
  };

  const handleCameraChoice = () => {
    setShowPhotoChoice(false);
    const cameraInputs = { 1: cameraInput1, 2: cameraInput2, 3: cameraInput3, 4: cameraInput4 };
    cameraInputs[activePhotoSlot].current?.click();
  };

  const handleGalleryChoice = () => {
    setShowPhotoChoice(false);
    const galleryInputs = { 1: galleryInput1, 2: galleryInput2, 3: galleryInput3, 4: galleryInput4 };
    galleryInputs[activePhotoSlot].current?.click();
  };

  const handleFileChange = async (slot: 1 | 2 | 3 | 4, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(slot);
    try {
      const result = await uploadImage(file);
      const setters = { 1: setImage1, 2: setImage2, 3: setImage3, 4: setImage4 };
      setters[slot](result.url);
      
      toast({
        title: "Image Uploaded",
        description: `Photo ${slot} attached successfully.`,
      });
    } catch (error) {
      toast({
        title: "Upload Failed",
        description: "Failed to upload image. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploadingImage(null);
    }
  };

  const isCompleted = task.actionStatus === 'Completed' || !!task.captureDate;
  const actionBgColor = getActionBgColor(task.action);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F3F4F6', paddingBottom: '140px' }}>
      {/* Camera inputs */}
      <input ref={cameraInput1} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => handleFileChange(1, e)} disabled={isCompleted} />
      <input ref={cameraInput2} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => handleFileChange(2, e)} disabled={isCompleted} />
      <input ref={cameraInput3} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => handleFileChange(3, e)} disabled={isCompleted} />
      <input ref={cameraInput4} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => handleFileChange(4, e)} disabled={isCompleted} />
      {/* Gallery inputs */}
      <input ref={galleryInput1} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleFileChange(1, e)} disabled={isCompleted} />
      <input ref={galleryInput2} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleFileChange(2, e)} disabled={isCompleted} />
      <input ref={galleryInput3} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleFileChange(3, e)} disabled={isCompleted} />
      <input ref={galleryInput4} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleFileChange(4, e)} disabled={isCompleted} />

      {/* Photo Choice Modal */}
      {showPhotoChoice && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
          onClick={() => setShowPhotoChoice(false)}
        >
          <div 
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              padding: '24px',
              width: '300px',
              maxWidth: 'calc(100% - 32px)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#003B71', marginBottom: '20px', textAlign: 'center' }}>
              Add Photo
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button
                onClick={handleCameraChoice}
                data-testid="button-take-photo"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '16px',
                  backgroundColor: '#003B71',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '16px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                <Camera style={{ width: '24px', height: '24px' }} />
                Take Photo
              </button>
              <button
                onClick={handleGalleryChoice}
                data-testid="button-choose-gallery"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '16px',
                  backgroundColor: '#F36C21',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '16px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                <Image style={{ width: '24px', height: '24px' }} />
                Choose from Gallery
              </button>
              <button
                onClick={() => setShowPhotoChoice(false)}
                data-testid="button-cancel-photo"
                style={{
                  padding: '12px',
                  backgroundColor: 'transparent',
                  color: '#6B7280',
                  border: '1px solid #D1D5DB',
                  borderRadius: '10px',
                  fontSize: '14px',
                  cursor: 'pointer',
                  marginTop: '4px',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ backgroundColor: '#003B71', padding: '16px', paddingBottom: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', marginBottom: '12px' }}>
          {isClientMode ? (
            <button 
              onClick={() => {
                clearAll();
                setLocation('/');
              }}
              data-testid="button-logout"
              style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'rgba(255,255,255,0.85)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }}
            >
              <LogOut style={{ width: '18px', height: '18px' }} />
              <span>Logout</span>
            </button>
          ) : (
            <button 
              onClick={handleBackToTasks}
              data-testid="button-back"
              style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'rgba(255,255,255,0.85)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }}
            >
              <ArrowLeft style={{ width: '18px', height: '18px' }} />
              <span>Back</span>
            </button>
          )}
          <h1 style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', fontSize: '18px', fontWeight: 600, color: '#FFFFFF', margin: 0 }}>
            Task Feedback
          </h1>
          <div style={{ width: '70px' }} />
        </div>

        {/* Action Banner */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
          <div style={{ 
            backgroundColor: actionBgColor, 
            color: '#FFFFFF', 
            padding: '8px 16px', 
            borderRadius: '20px', 
            fontSize: '13px', 
            fontWeight: 600,
            textAlign: 'center',
          }}>
            {task.action}
          </div>
        </div>

        {/* SKU Identity Block */}
        <div style={{ textAlign: 'center', marginBottom: '12px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#FFFFFF', marginBottom: '4px', lineHeight: 1.3 }}>
            {task.articleDescription}
          </h2>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>
            {task.barcode}
          </div>
        </div>

        {/* KPI Row - 4 White Cards - Still in Blue Header */}
        <div style={{ display: 'flex', gap: '6px' }}>
          <div style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: '8px', padding: '8px 4px', textAlign: 'center' }}>
            <div style={{ fontSize: '9px', color: '#6B7280', textTransform: 'uppercase', marginBottom: '2px' }}>SOH</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#003B71', fontFamily: 'monospace' }}>{task.storeSoh || '0'}</div>
          </div>
          <div style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: '8px', padding: '8px 4px', textAlign: 'center' }}>
            <div style={{ fontSize: '9px', color: '#6B7280', textTransform: 'uppercase', marginBottom: '2px' }}>DC SOH</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#003B71', fontFamily: 'monospace' }}>{task.dcSoh || '0'}</div>
          </div>
          <div style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: '8px', padding: '8px 4px', textAlign: 'center' }}>
            <div style={{ fontSize: '9px', color: '#6B7280', textTransform: 'uppercase', marginBottom: '2px' }}>Sell Out</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#003B71', fontFamily: 'monospace' }}>{task.p4WeekSales || '0'}</div>
          </div>
          <div style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: '8px', padding: '8px 4px', textAlign: 'center' }}>
            <div style={{ fontSize: '9px', color: '#6B7280', textTransform: 'uppercase', marginBottom: '2px' }}>WFC</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#003B71', fontFamily: 'monospace' }}>{(parseFloat(task.storeWfc || '0') || 0).toFixed(1)}</div>
          </div>
        </div>
      </div>

      {/* Content - White/Grey Background */}
      <div style={{ padding: '16px' }}>
        {/* Charts Section - 3 Separate Cards */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <div style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: '10px', padding: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <MiniChart title="Store SOH" data={trendData?.storeSoh || []} />
          </div>
          <div style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: '10px', padding: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <MiniChart title="Sell Out" data={trendData?.sellOut || []} />
          </div>
          <div style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: '10px', padding: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <MiniChart title="WFC" data={trendData?.wfc || []} />
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: '1px', backgroundColor: '#D1D5DB', marginBottom: '16px' }} />

        {/* Capture Store Feedback Header */}
        <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ClipboardEdit style={{ width: '20px', height: '20px', color: '#003B71' }} />
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1F2937', margin: 0 }}>Capture Store Feedback</h3>
        </div>

        {/* Feedback Form Card */}
        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '12px', padding: '14px' }}>
          {/* Physical Count with Variance */}
          <div style={{ marginBottom: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <Label htmlFor="physicalCount" style={{ fontSize: '13px', fontWeight: 600, color: '#1F2937' }}>
                Physical Count <span style={{ color: '#DC2626' }}>*</span>
              </Label>
              {variance !== null && (
                <span style={{ fontSize: '12px', fontWeight: 500, color: variance < 0 ? '#DC2626' : variance > 0 ? '#16A34A' : '#6B7280' }}>
                  Variance: {variance > 0 ? '+' : ''}{variance}
                </span>
              )}
            </div>
            <Input
              id="physicalCount"
              type="number"
              placeholder="Enter count..."
              value={physicalCount}
              onChange={(e) => setPhysicalCount(e.target.value)}
              disabled={isCompleted}
              data-testid="input-physical-count"
              style={{ fontSize: '14px', height: '40px', backgroundColor: '#F9FAFB' }}
            />
          </div>

          {/* System Adjusted Question */}
          <div style={{ marginBottom: '14px' }}>
            <Label style={{ fontSize: '13px', color: '#1F2937', display: 'block', marginBottom: '8px' }}>
              System stock adjusted? <span style={{ color: '#DC2626' }}>*</span>
            </Label>
            <RadioGroup
              value={systemAdjusted === true ? "yes" : systemAdjusted === false ? "no" : ""}
              onValueChange={(value) => setSystemAdjusted(value === "yes")}
              disabled={isCompleted}
              style={{ display: 'flex', gap: '24px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <RadioGroupItem value="yes" id="system-yes" data-testid="radio-system-yes" />
                <Label htmlFor="system-yes" style={{ fontWeight: 400, cursor: 'pointer', fontSize: '14px' }}>Yes</Label>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <RadioGroupItem value="no" id="system-no" data-testid="radio-system-no" />
                <Label htmlFor="system-no" style={{ fontWeight: 400, cursor: 'pointer', fontSize: '14px' }}>No</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Reason Code */}
          <div style={{ marginBottom: '14px' }}>
            <Label htmlFor="reasonCode" style={{ fontSize: '13px', fontWeight: 600, color: '#1F2937', display: 'block', marginBottom: '6px' }}>
              Reason Code <span style={{ color: '#DC2626' }}>*</span>
            </Label>
            <Select 
              value={reasonCode} 
              onValueChange={setReasonCode}
              disabled={isCompleted}
            >
              <SelectTrigger data-testid="select-reason-code" style={{ fontSize: '14px', height: '40px', backgroundColor: '#F9FAFB' }}>
                <SelectValue placeholder="Select reason code..." />
              </SelectTrigger>
              <SelectContent>
                {REASON_CODES.map((code) => (
                  <SelectItem key={code} value={code}>{code}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Action Taken / Comment */}
          <div style={{ marginBottom: '14px' }}>
            <Label htmlFor="actionTakenComment" style={{ fontSize: '13px', fontWeight: 600, color: '#1F2937', display: 'block', marginBottom: '6px' }}>
              Action Taken / Comment <span style={{ color: '#DC2626' }}>*</span>
            </Label>
            <Textarea 
              id="actionTakenComment"
              placeholder="Enter action taken or comments..."
              value={actionTakenComment}
              onChange={(e) => setActionTakenComment(e.target.value)}
              disabled={isCompleted}
              data-testid="textarea-action-comment"
              style={{ minHeight: '70px', fontSize: '14px', backgroundColor: '#F9FAFB' }}
            />
          </div>

          {/* Feedback */}
          <div style={{ marginBottom: '14px' }}>
            <Label htmlFor="feedback" style={{ fontSize: '13px', fontWeight: 600, color: '#1F2937', display: 'block', marginBottom: '6px' }}>
              Feedback <span style={{ color: '#DC2626' }}>*</span>
            </Label>
            <Textarea 
              id="feedback"
              placeholder="Enter feedback..."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              disabled={isCompleted}
              data-testid="textarea-feedback"
              style={{ minHeight: '70px', fontSize: '14px', backgroundColor: '#F9FAFB' }}
            />
          </div>

          {/* Photo Section */}
          <div style={{ paddingBottom: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <Label style={{ fontSize: '13px', fontWeight: 600, color: '#1F2937' }}>Add Photos <span style={{ color: '#DC2626' }}>*</span> <span style={{ fontWeight: 400, color: '#6B7280' }}>(up to 4)</span></Label>
              {!isCompleted && [image1, image2, image3, image4].filter(Boolean).length < 4 && (
                <button
                  onClick={() => {
                    const nextSlot = !image1 ? 1 : !image2 ? 2 : !image3 ? 3 : 4;
                    handleImageClick(nextSlot as 1 | 2 | 3 | 4);
                  }}
                  data-testid="button-add-photo"
                  style={{ color: '#003B71', fontSize: '13px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  <Plus style={{ width: '16px', height: '16px' }} />
                  Add Photo
                </button>
              )}
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
              {([
                { img: image1, setImg: setImage1, slot: 1 as const },
                { img: image2, setImg: setImage2, slot: 2 as const },
                { img: image3, setImg: setImage3, slot: 3 as const },
                { img: image4, setImg: setImage4, slot: 4 as const },
              ]).map(({ img, setImg, slot }) => (
                img ? (
                  <div key={slot} style={{ position: 'relative', width: '70px', height: '70px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #E5E7EB' }}>
                    <img src={img} alt={`Photo ${slot}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    {!isCompleted && (
                      <button 
                        onClick={() => setImg(null)}
                        style={{ position: 'absolute', top: '2px', right: '2px', backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: '50%', padding: '2px', border: 'none', cursor: 'pointer' }}
                      >
                        <X style={{ width: '10px', height: '10px', color: '#FFFFFF' }} />
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    key={slot}
                    onClick={() => handleImageClick(slot)}
                    disabled={isCompleted || uploadingImage !== null}
                    data-testid={`button-add-photo-${slot}`}
                    style={{ width: '70px', height: '70px', border: '2px dashed #D1D5DB', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', background: 'none', cursor: 'pointer' }}
                  >
                    {uploadingImage === slot ? (
                      <Loader2 style={{ width: '18px', height: '18px', animation: 'spin 1s linear infinite' }} />
                    ) : (
                      <Camera style={{ width: '18px', height: '18px' }} />
                    )}
                  </button>
                )
              ))}
            </div>
          </div>
        </div>

        {/* Completed Status */}
        {isCompleted && task.captureDate && (
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: '12px', padding: '14px', marginTop: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#15803D' }}>
              <CheckCircle2 style={{ width: '20px', height: '20px' }} />
              <span style={{ fontSize: '14px', fontWeight: 500 }}>
                Captured: {new Date(task.captureDate).toLocaleString()}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Submit Button - Sticky Footer above bottom nav */}
      {!isCompleted && (
        <div style={{ position: 'fixed', bottom: '56px', left: 0, right: 0, padding: '12px 16px', backgroundColor: '#FFFFFF', boxShadow: '0 -2px 10px rgba(0,0,0,0.1)', zIndex: 50 }}>
          <Button
            onClick={handleSubmit}
            disabled={updateMutation.isPending}
            data-testid="button-submit-action"
            style={{ width: '100%', height: '48px', backgroundColor: '#F36C21', color: '#FFFFFF', fontSize: '16px', fontWeight: 600, borderRadius: '10px' }}
            className="hover:bg-[#E05A10]"
          >
            {updateMutation.isPending ? (
              <>
                <Loader2 style={{ marginRight: '8px', width: '20px', height: '20px', animation: 'spin 1s linear infinite' }} />
                Submitting...
              </>
            ) : (
              "Submit Action"
            )}
          </Button>
        </div>
      )}

      {/* Bottom Navigation */}
      <BottomNav 
        rep={repFilter} 
        store={storeFilter} 
        client={clientFilter}
        activeTaskId={params?.id}
      />
    </div>
  );
}
