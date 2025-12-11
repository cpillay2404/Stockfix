import { Task } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Box, AlertCircle, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

interface TaskCardProps {
  task: Task;
}

export function TaskCard({ task }: TaskCardProps) {
  const isPending = task.actionStatus === 'Pending';
  
  const missedSales = parseFloat(task.missedSales);
  const isHighPriority = missedSales > 100;

  return (
    <Link href={`/task/${task.uniqueId}`} className="block group">
      <Card className={cn(
        "transition-all duration-200 hover:shadow-md border-l-4",
        !isPending ? "border-l-green-500" : 
        isHighPriority ? "border-l-red-500" : "border-l-blue-500"
      )}>
        <CardHeader className="p-4 pb-2">
          <div className="flex justify-between items-start">
            <div className="space-y-1 overflow-hidden">
              <Badge variant={!isPending ? 'secondary' : 'outline'} 
                className={cn("text-xs font-medium mb-1", 
                  !isPending && "bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400"
                )}>
                {task.actionStatus}
              </Badge>
              <CardTitle className="text-base font-semibold leading-tight group-hover:text-primary transition-colors truncate">
                {task.articleDescription}
              </CardTitle>
              <div className="text-xs font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded w-fit">
                {task.barcode}
              </div>
            </div>
            {!isPending ? (
              <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
            ) : (
              <div className={cn("h-2 w-2 rounded-full mt-1.5 shrink-0", 
                isHighPriority ? "bg-red-500 animate-pulse" : "bg-blue-500"
              )} />
            )}
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          <div className="grid gap-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 shrink-0" />
              <span className="truncate">{task.storeName}</span>
            </div>
            <div className="flex items-center gap-2">
              <Box className="h-4 w-4 shrink-0" />
              <span className="truncate">{task.client} • {task.category}</span>
            </div>
            {isPending && isHighPriority && (
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-medium text-xs mt-1">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>Missed Sales: ${task.missedSales}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
