import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation, useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { fetchTask, updateTask, uploadImage } from "@/lib/api";
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
      <Layout>
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </Layout>
    );
  }

  if (!task) {
    return (
      <Layout>
        <div className="text-center py-12">
          <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-lg font-medium">Task not found</h2>
          <Button variant="link" onClick={handleBackToTasks}>Go back to tasks</Button>
        </div>
      </Layout>
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

  const getActionBadgeStyle = (action: string) => {
    const a = action?.toLowerCase() || '';
    if (a.includes('urgent') || a.includes('place order')) return 'bg-[#F36C21] text-white border-0';
    if (a.includes('fix') || a.includes('check count')) return 'bg-red-500 text-white border-0';
    if (a.includes('oos') || a.includes('risk') || a.includes('out of stock')) return 'bg-orange-500 text-white border-0';
    if (a.includes('monitor')) return 'bg-blue-500 text-white border-0';
    if (a.includes('optimal')) return 'bg-green-500 text-white border-0';
    return 'bg-gray-500 text-white border-0';
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
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
      <div className="bg-[#003B71] text-white px-4 py-3 flex items-center justify-between">
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
      <div className="flex-1 overflow-auto p-4 pb-24 space-y-4">
        {/* Action Badge */}
        <Badge className={cn("text-sm font-medium px-3 py-1", getActionBadgeStyle(task.action))}>
          {task.action}
        </Badge>

        {/* Product Info */}
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-gray-900">{task.articleDescription}</h2>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>Barcode: {task.barcode}</span>
            <ListChecks className="h-4 w-4" />
          </div>
        </div>

        {/* Stats Row */}
        <div className="bg-white rounded-lg border shadow-sm">
          <div className="grid grid-cols-3 divide-x">
            <div className="p-4 text-center">
              <div className="text-xs text-gray-500 mb-1">Store SOH</div>
              <div className="text-2xl font-bold text-gray-900">{task.storeSoh || '0'}</div>
            </div>
            <div className="p-4 text-center">
              <div className="text-xs text-gray-500 mb-1">Sell Out (P4 Weeks)</div>
              <div className="text-2xl font-bold text-gray-900">{task.p4WeekSales || '0'}</div>
            </div>
            <div className="p-4 text-center">
              <div className="text-xs text-gray-500 mb-1">WFC</div>
              <div className="text-2xl font-bold text-gray-900">{task.storeWfc || '0'}</div>
            </div>
          </div>
        </div>

        {/* Physical Count with Variance */}
        <div className="bg-white rounded-lg border shadow-sm p-4 space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="physicalCount" className="text-base font-semibold">
              Physical Count {requiresPhysicalCount && <span className="text-red-500">*</span>}
            </Label>
            {variance !== null && (
              <span className={cn(
                "text-sm font-medium",
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
            className="text-lg"
            data-testid="input-physical-count"
          />
        </div>

        {/* System Adjusted Question */}
        <div className="bg-white rounded-lg border shadow-sm p-4 space-y-3">
          <Label className="text-base">
            Was the system stock adjusted to match the physical count? <span className="text-red-500">*</span>
          </Label>
          <RadioGroup
            value={systemAdjusted === true ? "yes" : systemAdjusted === false ? "no" : ""}
            onValueChange={(value) => setSystemAdjusted(value === "yes")}
            disabled={isCompleted}
            className="flex gap-8"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="yes" id="system-yes" data-testid="radio-system-yes" className="border-2" />
              <Label htmlFor="system-yes" className="font-normal cursor-pointer text-base">Yes</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="no" id="system-no" data-testid="radio-system-no" className="border-2" />
              <Label htmlFor="system-no" className="font-normal cursor-pointer text-base">No</Label>
            </div>
          </RadioGroup>
        </div>

        {/* Reason Code */}
        <div className="bg-white rounded-lg border shadow-sm p-4 space-y-2">
          <Label htmlFor="reasonCode" className="text-base font-semibold">
            Reason Code {systemAdjusted === false && <span className="text-red-500">*</span>}
          </Label>
          <Select 
            value={reasonCode} 
            onValueChange={setReasonCode}
            disabled={isCompleted}
          >
            <SelectTrigger data-testid="select-reason-code" className="text-base">
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
        <div className="bg-white rounded-lg border shadow-sm p-4 space-y-2">
          <Label htmlFor="actionTakenComment" className="text-base font-semibold">Action Taken / Comment</Label>
          <Textarea 
            id="actionTakenComment"
            placeholder="Enter action taken or comments..."
            className="min-h-[80px] text-base"
            value={actionTakenComment}
            onChange={(e) => setActionTakenComment(e.target.value)}
            disabled={isCompleted}
            data-testid="textarea-action-comment"
          />
        </div>

        {/* Photo Section */}
        <div className="bg-white rounded-lg border shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-base font-semibold">Add Photo</Label>
            {!isCompleted && !image1 && !image2 && (
              <button
                onClick={() => handleImageClick(1)}
                className="text-[#003B71] text-sm font-medium flex items-center gap-1 hover:underline"
                data-testid="button-add-photo"
              >
                <Plus className="h-4 w-4" />
                Add Photo
              </button>
            )}
          </div>
          
          <div className="flex gap-3">
            {image1 && (
              <div className="relative w-24 h-24 rounded-lg overflow-hidden border">
                <img src={image1} alt="Photo 1" className="w-full h-full object-cover" />
                {!isCompleted && (
                  <button 
                    className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 hover:bg-black/80"
                    onClick={() => setImage1(null)}
                  >
                    <X className="h-4 w-4 text-white" />
                  </button>
                )}
              </div>
            )}
            
            {image2 && (
              <div className="relative w-24 h-24 rounded-lg overflow-hidden border">
                <img src={image2} alt="Photo 2" className="w-full h-full object-cover" />
                {!isCompleted && (
                  <button 
                    className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 hover:bg-black/80"
                    onClick={() => setImage2(null)}
                  >
                    <X className="h-4 w-4 text-white" />
                  </button>
                )}
              </div>
            )}

            {!isCompleted && (image1 || image2) && (!image1 || !image2) && (
              <button
                onClick={() => handleImageClick(image1 ? 2 : 1)}
                className="w-24 h-24 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:border-[#003B71] hover:text-[#003B71]"
                disabled={uploadingImage !== null}
                data-testid="button-add-more-photo"
              >
                {uploadingImage ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <>
                    <Plus className="h-6 w-6" />
                    <span className="text-xs mt-1">Add Photo</span>
                  </>
                )}
              </button>
            )}

            {!isCompleted && !image1 && !image2 && (
              <button
                onClick={() => handleImageClick(1)}
                className="w-24 h-24 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:border-[#003B71] hover:text-[#003B71]"
                disabled={uploadingImage !== null}
                data-testid="button-add-first-photo"
              >
                {uploadingImage === 1 ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <>
                    <Camera className="h-6 w-6" />
                    <span className="text-xs mt-1">Photo 1</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Completed Status */}
        {isCompleted && task.captureDate && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center gap-2 text-green-700">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-sm font-medium">
                Captured: {new Date(task.captureDate).toLocaleString()}
              </span>
            </div>
          </div>
        )}

        {/* Submit Button */}
        {!isCompleted && (
          <Button
            onClick={handleSubmit}
            disabled={updateMutation.isPending}
            className="w-full bg-[#003B71] hover:bg-[#002a52] text-white py-6 text-lg font-semibold rounded-lg"
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
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg">
        <div className="max-w-md mx-auto grid grid-cols-4">
          <button 
            onClick={handleBackToTasks}
            className="flex flex-col items-center py-3 text-[#003B71]"
            data-testid="nav-back"
          >
            <Home className="h-5 w-5" />
            <span className="text-xs mt-1">Back</span>
          </button>
          <button 
            onClick={() => setLocation('/tasks')}
            className="flex flex-col items-center py-3 text-gray-500 hover:text-[#003B71]"
            data-testid="nav-mocus"
          >
            <ListChecks className="h-5 w-5" />
            <span className="text-xs mt-1">Mocus</span>
          </button>
          <button 
            onClick={() => setLocation(`/store-overview?store=${encodeURIComponent(task.storeName)}`)}
            className="flex flex-col items-center py-3 text-gray-500 hover:text-[#003B71]"
            data-testid="nav-store"
          >
            <Store className="h-5 w-5" />
            <span className="text-xs mt-1">Store</span>
          </button>
          <button 
            onClick={handleExitVisit}
            className="flex flex-col items-center py-3 text-gray-500 hover:text-[#003B71]"
            data-testid="nav-visit"
          >
            <Eye className="h-5 w-5" />
            <span className="text-xs mt-1">Visit</span>
          </button>
        </div>
      </div>
    </div>
  );
}
