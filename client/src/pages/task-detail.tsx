import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { mockTasks, Task } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Upload, Camera, CheckCircle2, AlertCircle, MapPin, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function TaskDetail() {
  const [match, params] = useRoute("/task/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [task, setTask] = useState<Task | null>(null);
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);

  useEffect(() => {
    if (params?.id) {
      const found = mockTasks.find(t => t.id === params.id);
      if (found) {
        setTask(found);
        if (found.status === 'completed') {
          setFeedback(found.feedback || "");
          setUploadedImage(found.imageUrl || null);
        }
      }
    }
  }, [params?.id]);

  if (!task) return null;

  const handleSubmit = () => {
    if (!feedback) {
      toast({
        title: "Feedback required",
        description: "Please provide details on the action taken.",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    // Simulate API call
    setTimeout(() => {
      task.status = 'completed';
      task.feedback = feedback;
      task.imageUrl = uploadedImage || undefined;
      
      toast({
        title: "Task Completed",
        description: "Your updates have been synced to Excel.",
      });
      setIsSubmitting(false);
      setLocation("/");
    }, 1000);
  };

  const handleImageUpload = () => {
    // Simulate image upload
    const mockImages = [
      "https://images.unsplash.com/photo-1606859191214-25806e8e2423?auto=format&fit=crop&q=80&w=400",
      "https://images.unsplash.com/photo-1550989460-0adf9ea622e2?auto=format&fit=crop&q=80&w=400",
      "https://images.unsplash.com/photo-1584473457406-6240486418e9?auto=format&fit=crop&q=80&w=400"
    ];
    setUploadedImage(mockImages[Math.floor(Math.random() * mockImages.length)]);
    toast({
      title: "Image Uploaded",
      description: "Photo attached successfully.",
    });
  };

  const isCompleted = task.status === 'completed';

  return (
    <Layout>
      <div className="space-y-6 pb-20">
        <Button 
          variant="ghost" 
          className="pl-0 hover:bg-transparent text-muted-foreground hover:text-foreground"
          onClick={() => setLocation("/")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Tasks
        </Button>

        <div className="space-y-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold leading-tight">{task.productName}</h1>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-sm">{task.sku}</span>
                <span>•</span>
                <span className="text-sm">{task.client}</span>
              </div>
            </div>
            {isCompleted && <CheckCircle2 className="h-8 w-8 text-green-500" />}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border p-4 shadow-sm space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-1">
                <div className="text-muted-foreground flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> Store
                </div>
                <div className="font-medium">{task.store}</div>
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" /> Due Date
                </div>
                <div className="font-medium">{task.dueDate}</div>
              </div>
            </div>
            
            <Separator />
            
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Instructions
              </div>
              <div className="text-base leading-relaxed bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-100 p-3 rounded-md border border-blue-100 dark:border-blue-900/50">
                {task.description}
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-4">
            <h3 className="font-semibold text-lg">Report Feedback</h3>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Comments</label>
                <Textarea 
                  placeholder="Describe the action taken..."
                  className="min-h-[120px] text-base"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  disabled={isCompleted}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Photo Proof</label>
                {uploadedImage ? (
                  <div className="relative rounded-lg overflow-hidden border aspect-video group">
                    <img src={uploadedImage} alt="Proof" className="w-full h-full object-cover" />
                    {!isCompleted && (
                      <Button 
                        variant="destructive" 
                        size="icon" 
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => setUploadedImage(null)}
                      >
                        <span className="sr-only">Remove</span>
                        ×
                      </Button>
                    )}
                  </div>
                ) : (
                  <Button 
                    variant="outline" 
                    className="w-full h-24 border-dashed flex flex-col gap-2 hover:bg-muted/50"
                    onClick={handleImageUpload}
                    disabled={isCompleted}
                  >
                    <Camera className="h-6 w-6 text-muted-foreground" />
                    <span className="text-muted-foreground">Tap to take photo</span>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {!isCompleted && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t">
          <div className="max-w-md mx-auto">
            <Button 
              className="w-full h-12 text-base font-semibold" 
              size="lg"
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Submitting..." : "Complete Task"}
            </Button>
          </div>
        </div>
      )}
    </Layout>
  );
}
