import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation, useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { fetchTask, updateTask, uploadImage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, Camera, CheckCircle2, AlertCircle, MapPin, 
  Calendar, Layers, Info, Loader2, LogOut
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

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
  
  const [comment, setComment] = useState("");
  const [reasonCode, setReasonCode] = useState("");
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
      setComment(task.actionTakenComment || "");
      setReasonCode(task.reasonCode || "");
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

  const handleSubmit = () => {
    if (!comment) {
      toast({
        title: "Comment required",
        description: "Please describe the action taken.",
        variant: "destructive"
      });
      return;
    }

    if (!reasonCode) {
      toast({
        title: "Reason Code required",
        description: "Please select a reason code.",
        variant: "destructive"
      });
      return;
    }

    updateMutation.mutate({
      actionStatus: 'Completed',
      actionTakenComment: comment,
      reasonCode: reasonCode,
      image1: image1 || undefined,
      image2: image2 || undefined,
      captureDate: new Date().toISOString().split('T')[0],
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
        description: `Image ${slot} attached successfully.`,
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

  const isCompleted = task.actionStatus === 'Completed';

  return (
    <Layout>
      <div className="space-y-6 pb-24">
        <input 
          ref={fileInput1} 
          type="file" 
          accept="image/*" 
          className="hidden" 
          onChange={(e) => handleFileChange(1, e)}
          disabled={isCompleted}
        />
        <input 
          ref={fileInput2} 
          type="file" 
          accept="image/*" 
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
                <span>{task.category}</span>
                <span>•</span>
                <span>{task.stockClassification}</span>
              </div>
            </div>
            {isCompleted && <CheckCircle2 className="h-8 w-8 text-green-500 shrink-0" />}
          </div>

          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <h3 className="font-semibold text-blue-900 dark:text-blue-100">Required Action</h3>
                <p className="text-blue-800 dark:text-blue-200 text-sm leading-relaxed">
                  {task.action}
                </p>
                <div className="pt-2 text-xs text-blue-700 dark:text-blue-300 font-medium">
                  Due: {task.actionDate}
                </div>
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
                <div className="text-muted-foreground text-xs">P4 Wk Sales</div>
                <div className="font-mono font-medium">{task.p4WeekSales}</div>
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground text-xs">Missed Sales</div>
                <div className="font-mono font-medium text-red-600 dark:text-red-400">
                  ${task.missedSales}
                </div>
              </div>
            </div>
          </div>

          {task.systemImage && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Info className="h-4 w-4 text-muted-foreground" />
                Reference Image
              </h3>
              <div className="rounded-lg overflow-hidden border bg-muted h-32 w-32 relative">
                <img src={task.systemImage} alt="Reference" className="object-cover w-full h-full" />
              </div>
            </div>
          )}

          <Separator className="my-6" />

          <div className="space-y-5">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" />
              Action Feedback
            </h3>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Reason Code</label>
              <Select 
                value={reasonCode} 
                onValueChange={setReasonCode}
                disabled={isCompleted}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select outcome..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="completed">Action Completed</SelectItem>
                  <SelectItem value="stock_unavailable">Stock Unavailable</SelectItem>
                  <SelectItem value="manager_refusal">Manager Refusal</SelectItem>
                  <SelectItem value="promo_issue">Promo Issue</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Action Taken / Comment</label>
              <Textarea 
                placeholder="Describe what you did..."
                className="min-h-[100px]"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                disabled={isCompleted}
              />
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium">Evidence (Photos)</label>
              <div className="grid grid-cols-2 gap-3">
                {image1 ? (
                  <div className="relative rounded-lg overflow-hidden border aspect-square group">
                    <img src={image1} alt="Proof 1" className="w-full h-full object-cover" />
                    {!isCompleted && (
                      <Button variant="destructive" size="icon" className="absolute top-1 right-1 h-6 w-6" onClick={() => setImage1(null)}>×</Button>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] p-1 text-center">Image 1</div>
                  </div>
                ) : (
                  <Button 
                    variant="outline" 
                    className="h-auto aspect-square flex flex-col gap-2" 
                    onClick={() => handleImageClick(1)} 
                    disabled={isCompleted || uploadingImage === 1}
                  >
                    {uploadingImage === 1 ? (
                      <Loader2 className="h-6 w-6 animate-spin" />
                    ) : (
                      <>
                        <Camera className="h-6 w-6 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Add Image 1</span>
                      </>
                    )}
                  </Button>
                )}

                {image2 ? (
                  <div className="relative rounded-lg overflow-hidden border aspect-square group">
                    <img src={image2} alt="Proof 2" className="w-full h-full object-cover" />
                    {!isCompleted && (
                      <Button variant="destructive" size="icon" className="absolute top-1 right-1 h-6 w-6" onClick={() => setImage2(null)}>×</Button>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] p-1 text-center">Image 2</div>
                  </div>
                ) : (
                  <Button 
                    variant="outline" 
                    className="h-auto aspect-square flex flex-col gap-2" 
                    onClick={() => handleImageClick(2)} 
                    disabled={isCompleted || uploadingImage === 2}
                  >
                    {uploadingImage === 2 ? (
                      <Loader2 className="h-6 w-6 animate-spin" />
                    ) : (
                      <>
                        <Camera className="h-6 w-6 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Add Image 2</span>
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
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
