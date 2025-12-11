import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { mockTasks, Task } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, Camera, CheckCircle2, AlertCircle, MapPin, 
  Calendar, BarChart3, Package, Layers, Info 
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function TaskDetail() {
  const [match, params] = useRoute("/task/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [task, setTask] = useState<Task | null>(null);
  
  // Form State
  const [comment, setComment] = useState("");
  const [reasonCode, setReasonCode] = useState("");
  const [image1, setImage1] = useState<string | null>(null);
  const [image2, setImage2] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (params?.id) {
      const found = mockTasks.find(t => t.uniqueId === params.id);
      if (found) {
        setTask(found);
        if (found.actionStatus === 'Completed') {
          setComment(found.actionTakenComment || "");
          setReasonCode(found.reasonCode || "");
          setImage1(found.image1 || null);
          setImage2(found.image2 || null);
        }
      }
    }
  }, [params?.id]);

  if (!task) return null;

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

    setIsSubmitting(true);
    setTimeout(() => {
      task.actionStatus = 'Completed';
      task.actionTakenComment = comment;
      task.reasonCode = reasonCode;
      task.image1 = image1 || undefined;
      task.image2 = image2 || undefined;
      task.captureDate = new Date().toISOString().split('T')[0];
      
      toast({
        title: "Action Captured",
        description: "Task updated successfully.",
      });
      setIsSubmitting(false);
      setLocation("/");
    }, 1000);
  };

  const handleImageUpload = (slot: 1 | 2) => {
    const mockImages = [
      "https://images.unsplash.com/photo-1606859191214-25806e8e2423?auto=format&fit=crop&q=80&w=400",
      "https://images.unsplash.com/photo-1550989460-0adf9ea622e2?auto=format&fit=crop&q=80&w=400"
    ];
    const img = mockImages[Math.floor(Math.random() * mockImages.length)];
    if (slot === 1) setImage1(img);
    else setImage2(img);
    
    toast({
      title: "Image Captured",
      description: `Image ${slot} attached.`,
    });
  };

  const isCompleted = task.actionStatus === 'Completed';

  return (
    <Layout>
      <div className="space-y-6 pb-24">
        <Button 
          variant="ghost" 
          className="pl-0 hover:bg-transparent text-muted-foreground hover:text-foreground"
          onClick={() => setLocation("/")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Tasks
        </Button>

        <div className="space-y-4">
          {/* Header Section */}
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

          {/* Action Card */}
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

          {/* Location & Metrics */}
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

          {/* Reference Image */}
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

          {/* Feedback Form */}
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
                {/* Image 1 */}
                {image1 ? (
                  <div className="relative rounded-lg overflow-hidden border aspect-square group">
                    <img src={image1} alt="Proof 1" className="w-full h-full object-cover" />
                    {!isCompleted && (
                      <Button variant="destructive" size="icon" className="absolute top-1 right-1 h-6 w-6" onClick={() => setImage1(null)}>×</Button>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] p-1 text-center">Image 1</div>
                  </div>
                ) : (
                  <Button variant="outline" className="h-auto aspect-square flex flex-col gap-2" onClick={() => handleImageUpload(1)} disabled={isCompleted}>
                    <Camera className="h-6 w-6 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Add Image 1</span>
                  </Button>
                )}

                {/* Image 2 */}
                {image2 ? (
                  <div className="relative rounded-lg overflow-hidden border aspect-square group">
                    <img src={image2} alt="Proof 2" className="w-full h-full object-cover" />
                    {!isCompleted && (
                      <Button variant="destructive" size="icon" className="absolute top-1 right-1 h-6 w-6" onClick={() => setImage2(null)}>×</Button>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] p-1 text-center">Image 2</div>
                  </div>
                ) : (
                  <Button variant="outline" className="h-auto aspect-square flex flex-col gap-2" onClick={() => handleImageUpload(2)} disabled={isCompleted}>
                    <Camera className="h-6 w-6 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Add Image 2</span>
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
              disabled={isSubmitting}
            >
              {isSubmitting ? "Saving..." : "Submit Action"}
            </Button>
          </div>
        </div>
      )}
    </Layout>
  );
}
