import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation, useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchTask, fetchTasks, updateTask, uploadImage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { 
  ArrowLeft, Camera, CheckCircle2, AlertCircle, 
  Loader2, X, Plus, Home, Store, Eye, ListChecks
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ComposedChart, Bar, Line, XAxis, YAxis, ResponsiveContainer, LabelList } from "recharts";

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

function MiniChartCard({ title, data }: { title: string; data: ChartDataPoint[] }) {
  const displayData = (!data || data.length === 0) 
    ? [{ weekEnding: '', value: 0 }] 
    : data;
  
  const formatWeekLabel = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[1]}/${parts[2]}`;
    }
    return dateStr;
  };

  const formatValue = (val: number) => {
    if (val >= 1000) return `${(val / 1000).toFixed(1)}k`;
    if (val % 1 !== 0) return val.toFixed(1);
    return val.toString();
  };

  return (
    <div className="bg-[#003B71] rounded-lg p-2 flex-1 border-2 border-[#002347]">
      <div className="text-[10px] text-white/90 mb-1 font-semibold">{title}</div>
      <div style={{ height: '80px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={displayData} margin={{ top: 15, right: 2, left: -20, bottom: 2 }}>
            <XAxis 
              dataKey="weekEnding" 
              tick={{ fontSize: 7, fill: '#ffffff99' }}
              tickFormatter={formatWeekLabel}
              axisLine={false}
              tickLine={false}
            />
            <YAxis 
              tick={{ fontSize: 7, fill: '#ffffff99' }}
              axisLine={false}
              tickLine={false}
              width={25}
            />
            <Bar dataKey="value" fill="#4a6a8a" radius={[3, 3, 0, 0]}>
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
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function TaskDetail() {
  const [match, params] = useRoute("/task/:id");
  const [, setLocation] = useLocation();
  const search = useSearch();
  const urlParams = new URLSearchParams(search);
  const repFilter = urlParams.get('rep') || '';
  const storeFilter = urlParams.get('store') || '';
  const clientFilter = urlParams.get('client') || '';
  const articleFilter = urlParams.get('article') || '';
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [physicalCount, setPhysicalCount] = useState<string>("");
  const [systemAdjusted, setSystemAdjusted] = useState<boolean | null>(null);
  const [reasonCode, setReasonCode] = useState("");
  const [actionTakenComment, setActionTakenComment] = useState("");
  const [feedback, setFeedback] = useState("");
  const [image1, setImage1] = useState<string | null>(null);
  const [image2, setImage2] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState<1 | 2 | null>(null);
  
  const fileInput1 = useRef<HTMLInputElement>(null);
  const fileInput2 = useRef<HTMLInputElement>(null);

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
        p4Sales: data.sellOut || [],
        wfc: data.wfc || [],
      };
    },
    enabled: !!task,
  });

  const updateMutation = useMutation({
    mutationFn: (updates: any) => updateTask(params!.id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["task", params?.id] });
      toast({
        title: "Action Captured",
        description: "Task updated successfully.",
      });
      handleBackToTasks();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update task. Please try again.",
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
    }
  }, [task]);

  const handleBackToTasks = () => {
    const params = new URLSearchParams();
    if (repFilter) params.set('rep', repFilter);
    if (storeFilter) params.set('store', storeFilter);
    if (clientFilter) params.set('client', clientFilter);
    if (articleFilter) params.set('article', articleFilter);
    setLocation(`/tasks?${params.toString()}`);
  };

  const handleExitVisit = () => {
    setLocation('/');
  };

  if (!params?.id) return null;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#003B71]">
        <div className="bg-[#003B71] text-white px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-1"><ArrowLeft className="h-5 w-5" /><span>Back</span></div>
          <h1 className="text-lg font-semibold">Task Feedback</h1>
          <div className="px-3 py-1 bg-white/20 rounded text-sm">Exit Visit</div>
        </div>
        <div className="p-4 space-y-4">
          <Skeleton className="h-32 w-full rounded-xl bg-white/20" />
          <Skeleton className="h-24 w-full rounded-xl bg-white/20" />
          <Skeleton className="h-48 w-full rounded-xl bg-white/20" />
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="min-h-screen bg-[#003B71] flex flex-col">
        <div className="bg-[#003B71] text-white px-4 py-3 flex items-center justify-between">
          <button onClick={handleBackToTasks} className="flex items-center gap-1">
            <ArrowLeft className="h-5 w-5" /><span>Back</span>
          </button>
          <h1 className="text-lg font-semibold">Task Feedback</h1>
          <button onClick={handleExitVisit} className="px-3 py-1 bg-white/20 rounded text-sm">Exit Visit</button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="bg-white rounded-xl p-8 text-center mx-4">
            <AlertCircle className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h2 className="text-lg font-medium">Task not found</h2>
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
    if (systemAdjusted === null) {
      toast({
        title: "Selection Required",
        description: "Please select Yes or No for system adjustment.",
        variant: "destructive"
      });
      return;
    }

    if (requiresPhysicalCount && !physicalCount) {
      toast({
        title: "Physical Count Required",
        description: "Please enter the physical count for this action type.",
        variant: "destructive"
      });
      return;
    }

    if (systemAdjusted === false && !reasonCode) {
      toast({
        title: "Reason Code Required",
        description: "Please select a reason code when system was not adjusted.",
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
      captureDate: new Date().toISOString(),
    });
  };

  const handleImageClick = (slot: 1 | 2) => {
    if (slot === 1) fileInput1.current?.click();
    else fileInput2.current?.click();
  };

  const handleFileChange = async (slot: 1 | 2, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(slot);
    try {
      const result = await uploadImage(file);
      if (slot === 1) setImage1(result.url);
      else setImage2(result.url);
      
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

  const getActionPillStyle = (action: string) => {
    const a = action?.toLowerCase() || '';
    if (a.includes('urgent') || a.includes('fix counts')) return 'bg-red-500 text-white';
    if (a.includes('review') || a.includes('oos on order')) return 'bg-orange-500 text-white';
    if (a.includes('check count')) return 'bg-amber-500 text-white';
    if (a.includes('monitor')) return 'bg-blue-500 text-white';
    if (a.includes('optimal')) return 'bg-green-500 text-white';
    return 'bg-[#F36C21] text-white';
  };

  return (
    <div className="min-h-screen bg-[#003B71] flex flex-col">
      <input 
        ref={fileInput1} 
        type="file" 
        accept="image/*" 
        capture="environment"
        className="hidden" 
        onChange={(e) => handleFileChange(1, e)}
        disabled={isCompleted}
      />
      <input 
        ref={fileInput2} 
        type="file" 
        accept="image/*" 
        capture="environment"
        className="hidden" 
        onChange={(e) => handleFileChange(2, e)}
        disabled={isCompleted}
      />

      {/* Header */}
      <div className="bg-[#003B71] text-white px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <button 
          onClick={handleBackToTasks}
          className="flex items-center gap-1 text-white hover:opacity-80"
          data-testid="button-back"
        >
          <ArrowLeft className="h-5 w-5" />
          <span>Back</span>
        </button>
        <h1 className="text-lg font-semibold">Task Feedback</h1>
        <button
          onClick={handleExitVisit}
          className="px-3 py-1 bg-white/20 rounded text-sm hover:bg-white/30"
          data-testid="button-exit-visit"
        >
          Exit Visit
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-4 pb-40 space-y-3">
        
        {/* Section 1: Action + SKU Context Card */}
        <div className="bg-white rounded-xl p-4 shadow-sm space-y-4">
          {/* Action Pill */}
          <Badge className={cn("text-sm font-bold px-3 py-1.5 rounded-md", getActionPillStyle(task.action))}>
            {task.action}
          </Badge>

          {/* SKU Title + Barcode */}
          <div>
            <h2 className="text-xl font-bold text-gray-900">{task.articleDescription}</h2>
            <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
              <span>Barcode: {task.barcode}</span>
              <ListChecks className="h-4 w-4" />
            </div>
          </div>

          {/* KPI Tiles - 4 tiles on one line */}
          <div className="grid grid-cols-4 gap-1">
            <div className="border rounded-lg p-1.5 text-center bg-gray-50">
              <div className="text-[9px] text-gray-500 uppercase tracking-wide whitespace-nowrap">SOH</div>
              <div className="text-lg font-bold text-gray-900">{task.storeSoh || '0'}</div>
            </div>
            <div className="border rounded-lg p-1.5 text-center bg-gray-50">
              <div className="text-[9px] text-gray-500 uppercase tracking-wide whitespace-nowrap">DC SOH</div>
              <div className="text-lg font-bold text-gray-900">{task.dcSoh || '0'}</div>
            </div>
            <div className="border rounded-lg p-1.5 text-center bg-gray-50">
              <div className="text-[9px] text-gray-500 uppercase tracking-wide whitespace-nowrap">P4 Sales</div>
              <div className="text-lg font-bold text-gray-900">{task.p4WeekSales || '0'}</div>
            </div>
            <div className="border rounded-lg p-1.5 text-center bg-gray-50">
              <div className="text-[9px] text-gray-500 uppercase tracking-wide whitespace-nowrap">WFC</div>
              <div className="text-lg font-bold text-gray-900">{(parseFloat(task.storeWfc || '0') || 0).toFixed(1)}</div>
            </div>
          </div>
        </div>

        {/* Section 2: SKU Trends - 3 mini charts in a row */}
        <div className="grid grid-cols-3 gap-2">
          <MiniChartCard title="Store SOH" data={trendData?.storeSoh || []} />
          <MiniChartCard title="Sell Out" data={trendData?.p4Sales || []} />
          <MiniChartCard title="WFC" data={trendData?.wfc || []} />
        </div>

        {/* Section 3: Feedback Form Card */}
        <div className="bg-white rounded-xl p-3 shadow-sm space-y-3">
          
          {/* Physical Count with Variance */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label htmlFor="physicalCount" className="text-sm font-semibold text-gray-900">
                Physical Count
              </Label>
              {variance !== null && (
                <span className={cn(
                  "text-xs font-medium",
                  variance < 0 ? "text-red-600" : variance > 0 ? "text-green-600" : "text-gray-600"
                )}>
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
              className="text-sm bg-gray-50 border-gray-300 h-9"
              data-testid="input-physical-count"
            />
          </div>

          {/* System Adjusted Question */}
          <div className="space-y-2">
            <Label className="text-sm text-gray-900">
              Was system stock adjusted to physical count?
            </Label>
            <RadioGroup
              value={systemAdjusted === true ? "yes" : systemAdjusted === false ? "no" : ""}
              onValueChange={(value) => setSystemAdjusted(value === "yes")}
              disabled={isCompleted}
              className="flex gap-10"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="yes" id="system-yes" data-testid="radio-system-yes" className="border-2 border-gray-400" />
                <Label htmlFor="system-yes" className="font-normal cursor-pointer text-sm">Yes</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="no" id="system-no" data-testid="radio-system-no" className="border-2 border-gray-400" />
                <Label htmlFor="system-no" className="font-normal cursor-pointer text-sm">No</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Reason Code */}
          <div className="space-y-1">
            <Label htmlFor="reasonCode" className="text-sm font-semibold text-gray-900">
              Reason Code {systemAdjusted === false && <span className="text-red-500">*</span>}
            </Label>
            <Select 
              value={reasonCode} 
              onValueChange={setReasonCode}
              disabled={isCompleted}
            >
              <SelectTrigger data-testid="select-reason-code" className="text-sm bg-gray-50 border-gray-300 h-9">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {REASON_CODES.map((code) => (
                  <SelectItem key={code} value={code}>{code}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Action Taken / Comment */}
          <div className="space-y-1">
            <Label htmlFor="actionTakenComment" className="text-sm font-semibold text-gray-900">Action Taken / Comment</Label>
            <Textarea 
              id="actionTakenComment"
              placeholder="Enter action taken or comments..."
              className="min-h-[60px] text-sm bg-gray-50 border-gray-300"
              value={actionTakenComment}
              onChange={(e) => setActionTakenComment(e.target.value)}
              disabled={isCompleted}
              data-testid="textarea-action-comment"
            />
          </div>

          {/* Photo Section */}
          <div className="space-y-2 pb-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold text-gray-900">Add Photo</Label>
              {!isCompleted && (!image1 || !image2) && (
                <button
                  onClick={() => handleImageClick(image1 ? 2 : 1)}
                  className="text-[#003B71] text-sm font-medium flex items-center gap-1 hover:underline"
                  data-testid="button-add-photo"
                >
                  <Plus className="h-4 w-4" />
                  Add Photo
                </button>
              )}
            </div>
            
            <div className="flex gap-3">
              {/* Photo 1 Slot */}
              {image1 ? (
                <div className="relative w-20 h-20 rounded-lg overflow-hidden border">
                  <img src={image1} alt="Photo 1" className="w-full h-full object-cover" />
                  {!isCompleted && (
                    <button 
                      className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 hover:bg-black/80"
                      onClick={() => setImage1(null)}
                    >
                      <X className="h-3 w-3 text-white" />
                    </button>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => handleImageClick(1)}
                  className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:border-[#003B71] hover:text-[#003B71]"
                  disabled={isCompleted || uploadingImage !== null}
                  data-testid="button-add-photo-1"
                >
                  {uploadingImage === 1 ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Camera className="h-5 w-5" />
                  )}
                </button>
              )}
              
              {/* Photo 2 Slot */}
              {image2 ? (
                <div className="relative w-20 h-20 rounded-lg overflow-hidden border">
                  <img src={image2} alt="Photo 2" className="w-full h-full object-cover" />
                  {!isCompleted && (
                    <button 
                      className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 hover:bg-black/80"
                      onClick={() => setImage2(null)}
                    >
                      <X className="h-3 w-3 text-white" />
                    </button>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => handleImageClick(2)}
                  className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:border-[#003B71] hover:text-[#003B71]"
                  disabled={isCompleted || uploadingImage !== null}
                  data-testid="button-add-photo-2"
                >
                  {uploadingImage === 2 ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Camera className="h-5 w-5" />
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Completed Status */}
        {isCompleted && task.captureDate && (
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 text-green-700">
              <CheckCircle2 className="h-5 w-5" />
              <span className="text-sm font-medium">
                Captured: {new Date(task.captureDate).toLocaleString()}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Submit Button - Fixed at bottom */}
      {!isCompleted && (
        <div className="fixed bottom-16 left-0 right-0 p-4 bg-[#003B71]">
          <Button
            onClick={handleSubmit}
            disabled={updateMutation.isPending}
            className="w-full bg-[#003B71] hover:bg-[#002a52] text-white py-6 text-lg font-semibold rounded-lg border-2 border-white"
            data-testid="button-submit-action"
          >
            {updateMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Submitting...
              </>
            ) : (
              "Submit Action"
            )}
          </Button>
        </div>
      )}

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg">
        <div className="max-w-md mx-auto grid grid-cols-4">
          <button 
            onClick={handleBackToTasks}
            className="flex flex-col items-center py-2.5 text-[#003B71]"
            data-testid="nav-back"
          >
            <Home className="h-5 w-5" />
            <span className="text-xs mt-0.5">Back</span>
          </button>
          <button 
            onClick={() => setLocation('/tasks')}
            className="flex flex-col items-center py-2.5 text-gray-500 hover:text-[#003B71]"
            data-testid="nav-mocus"
          >
            <ListChecks className="h-5 w-5" />
            <span className="text-xs mt-0.5">Mocus</span>
          </button>
          <button 
            onClick={() => setLocation(`/store-overview?store=${encodeURIComponent(task.storeName)}`)}
            className="flex flex-col items-center py-2.5 text-gray-500 hover:text-[#003B71]"
            data-testid="nav-store"
          >
            <Store className="h-5 w-5" />
            <span className="text-xs mt-0.5">Store</span>
          </button>
          <button 
            onClick={handleExitVisit}
            className="flex flex-col items-center py-2.5 text-gray-500 hover:text-[#003B71]"
            data-testid="nav-visit"
          >
            <Eye className="h-5 w-5" />
            <span className="text-xs mt-0.5">Visit</span>
          </button>
        </div>
      </div>
    </div>
  );
}
