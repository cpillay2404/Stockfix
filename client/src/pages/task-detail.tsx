import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation, useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { fetchTask, updateTask, uploadImage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { 
  ArrowLeft, Camera, CheckCircle2, AlertCircle, MapPin, 
  Calendar, Layers, Info, Loader2, LogOut
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
        <div className="space-y-6">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-60 w-full" />
        </div>
      </Layout>
    );
  }

  if (!task) {
    return (
      <Layout>
        <div className="text-center py-12">
          <p className="text-destructive">Task not found</p>
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
        title: "Required Field",
        description: "Please indicate if the system was adjusted to match the physical count.",
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

  const getActionColor = (action: string) => {
    const a = action?.toLowerCase() || '';
    if (a.includes('fix') || a.includes('urgent') || a.includes('check count')) return 'text-red-600 bg-red-50 border-red-200';
    if (a.includes('oos') || a.includes('risk') || a.includes('out of stock')) return 'text-orange-600 bg-orange-50 border-orange-200';
    if (a.includes('monitor')) return 'text-blue-600 bg-blue-50 border-blue-200';
    if (a.includes('optimal')) return 'text-green-600 bg-green-50 border-green-200';
    return 'text-gray-600 bg-gray-50 border-gray-200';
  };

  return (
    <Layout>
      <div className="space-y-6 pb-24">
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

        <div className="flex items-center justify-between">
          <Button 
            variant="ghost" 
            className="pl-0 hover:bg-transparent text-muted-foreground hover:text-foreground"
            onClick={handleBackToTasks}
            data-testid="button-back"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <Button
            variant="ghost"
            className="text-muted-foreground hover:text-foreground"
            onClick={handleExitVisit}
            data-testid="button-exit-visit"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Exit Visit
          </Button>
        </div>

        <div className="space-y-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1 pr-4">
              <Badge variant="outline" className="mb-2 font-mono text-xs text-muted-foreground">
                {task.barcode}
              </Badge>
              <h1 className="text-xl font-bold leading-tight">{task.articleDescription}</h1>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{task.client}</span>
                <span>•</span>
                <span>{task.stockClassification}</span>
              </div>
            </div>
            {isCompleted && <CheckCircle2 className="h-8 w-8 text-green-500 shrink-0" />}
          </div>

          <div className={cn("border rounded-lg p-4", getActionColor(task.action))}>
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <h3 className="font-semibold">Required Action</h3>
                <p className="text-sm leading-relaxed font-medium">
                  {task.action}
                </p>
                {task.weekEnding && (
                  <div className="pt-2 text-xs font-medium opacity-80">
                    Week Ending: {task.weekEnding}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-card rounded-lg border shadow-sm divide-y">
            <div className="p-4 grid grid-cols-1 gap-3">
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium truncate">{task.storeName}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Layers className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Banner:</span>
                <span>{task.banner}</span>
              </div>
            </div>
            
            <div className="p-4 grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-1">
                <div className="text-muted-foreground text-xs">DC SOH</div>
                <div className="font-mono font-medium">{task.dcSoh}</div>
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground text-xs">Store SOH</div>
                <div className="font-mono font-medium">{task.storeSoh}</div>
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground text-xs">Sell Out P4 Weeks</div>
                <div className="font-mono font-medium">{task.p4WeekSales}</div>
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground text-xs">WFC</div>
                <div className="font-mono font-medium">{task.storeWfc}</div>
              </div>
            </div>
          </div>

          <Separator className="my-6" />

          <div className="space-y-5">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" />
              Task Feedback
            </h3>

            <div className="space-y-2">
              <Label htmlFor="physicalCount">
                Physical Count {requiresPhysicalCount && <span className="text-red-500">*</span>}
              </Label>
              <Input
                id="physicalCount"
                type="number"
                placeholder="Enter physical count..."
                value={physicalCount}
                onChange={(e) => setPhysicalCount(e.target.value)}
                disabled={isCompleted}
                data-testid="input-physical-count"
              />
            </div>

            <div className="space-y-2">
              <Label>Variance (auto-calculated)</Label>
              <div className={cn(
                "p-3 rounded-md border bg-muted font-mono text-sm",
                variance !== null && variance < 0 && "text-red-600",
                variance !== null && variance > 0 && "text-green-600"
              )}>
                {variance !== null ? variance : "—"}
              </div>
              <p className="text-xs text-muted-foreground">
                Variance = Physical Count - Store SOH
              </p>
            </div>

            <div className="space-y-3 p-4 bg-muted/50 rounded-lg border">
              <Label>
                System adjusted to match physical count? <span className="text-red-500">*</span>
              </Label>
              <RadioGroup
                value={systemAdjusted === true ? "yes" : systemAdjusted === false ? "no" : ""}
                onValueChange={(value) => setSystemAdjusted(value === "yes")}
                disabled={isCompleted}
                className="flex gap-6"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="yes" id="system-yes" data-testid="radio-system-yes" />
                  <Label htmlFor="system-yes" className="font-normal cursor-pointer">Yes</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="no" id="system-no" data-testid="radio-system-no" />
                  <Label htmlFor="system-no" className="font-normal cursor-pointer">No</Label>
                </div>
              </RadioGroup>
              {systemAdjusted === null && (
                <p className="text-xs text-amber-600">Please select Yes or No</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="reasonCode">
                Reason Code {systemAdjusted === false && <span className="text-red-500">*</span>}
              </Label>
              <Select 
                value={reasonCode} 
                onValueChange={setReasonCode}
                disabled={isCompleted}
              >
                <SelectTrigger data-testid="select-reason-code">
                  <SelectValue placeholder="Select reason code..." />
                </SelectTrigger>
                <SelectContent>
                  {REASON_CODES.map((code) => (
                    <SelectItem key={code} value={code}>{code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {systemAdjusted === false && !reasonCode && (
                <p className="text-xs text-amber-600">Required when system was not adjusted</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="actionTakenComment">Action Taken / Comment</Label>
              <Textarea 
                id="actionTakenComment"
                placeholder="Describe what action you took..."
                className="min-h-[80px]"
                value={actionTakenComment}
                onChange={(e) => setActionTakenComment(e.target.value)}
                disabled={isCompleted}
                data-testid="textarea-action-comment"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="feedback">Feedback (optional)</Label>
              <Textarea 
                id="feedback"
                placeholder="Any additional feedback..."
                className="min-h-[60px]"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                disabled={isCompleted}
                data-testid="textarea-feedback"
              />
            </div>

            <div className="space-y-3">
              <Label>Photo Evidence</Label>
              <div className="grid grid-cols-2 gap-3">
                {image1 ? (
                  <div className="relative rounded-lg overflow-hidden border aspect-square group">
                    <img src={image1} alt="Photo 1" className="w-full h-full object-cover" />
                    {!isCompleted && (
                      <Button variant="destructive" size="icon" className="absolute top-1 right-1 h-6 w-6" onClick={() => setImage1(null)}>×</Button>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] p-1 text-center">Photo 1</div>
                  </div>
                ) : (
                  <Button 
                    variant="outline" 
                    className="h-auto aspect-square flex flex-col gap-2" 
                    onClick={() => handleImageClick(1)} 
                    disabled={isCompleted || uploadingImage === 1}
                    data-testid="button-add-image-1"
                  >
                    {uploadingImage === 1 ? (
                      <Loader2 className="h-6 w-6 animate-spin" />
                    ) : (
                      <>
                        <Camera className="h-6 w-6 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Photo 1</span>
                      </>
                    )}
                  </Button>
                )}

                {image2 ? (
                  <div className="relative rounded-lg overflow-hidden border aspect-square group">
                    <img src={image2} alt="Photo 2" className="w-full h-full object-cover" />
                    {!isCompleted && (
                      <Button variant="destructive" size="icon" className="absolute top-1 right-1 h-6 w-6" onClick={() => setImage2(null)}>×</Button>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] p-1 text-center">Photo 2</div>
                  </div>
                ) : (
                  <Button 
                    variant="outline" 
                    className="h-auto aspect-square flex flex-col gap-2" 
                    onClick={() => handleImageClick(2)} 
                    disabled={isCompleted || uploadingImage === 2}
                    data-testid="button-add-image-2"
                  >
                    {uploadingImage === 2 ? (
                      <Loader2 className="h-6 w-6 animate-spin" />
                    ) : (
                      <>
                        <Camera className="h-6 w-6 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Photo 2</span>
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>

            {isCompleted && task.captureDate && (
              <div className="p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-lg">
                <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    Captured: {new Date(task.captureDate).toLocaleString()}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {!isCompleted && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t z-50">
          <div className="max-w-md mx-auto">
            <Button 
              className="w-full h-12 text-base font-semibold shadow-lg" 
              size="lg"
              onClick={handleSubmit}
              disabled={updateMutation.isPending}
              data-testid="button-submit-action"
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Submit Action"
              )}
            </Button>
          </div>
        </div>
      )}
    </Layout>
  );
}
