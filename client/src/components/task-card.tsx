import { Task } from "@/lib/mock-data";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Box, AlertCircle, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

interface TaskCardProps {
  task: Task;
}

export function TaskCard({ task }: TaskCardProps) {
  return (
    <Link href={`/task/${task.id}`}>
      <a className="block group">
        <Card className={cn(
          "transition-all duration-200 hover:shadow-md border-l-4",
          task.status === 'completed' ? "border-l-green-500" : 
          task.priority === 'high' ? "border-l-red-500" : "border-l-blue-500"
        )}>
          <CardHeader className="p-4 pb-2">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <Badge variant={task.status === 'completed' ? 'secondary' : 'outline'} 
                  className={cn("text-xs font-medium mb-1", 
                    task.status === 'completed' && "bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400"
                  )}>
                  {task.status === 'completed' ? 'Completed' : 'Pending'}
                </Badge>
                <CardTitle className="text-base font-semibold leading-tight group-hover:text-primary transition-colors">
                  {task.productName}
                </CardTitle>
                <div className="text-xs font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded w-fit">
                  {task.sku}
                </div>
              </div>
              {task.status === 'completed' ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <div className={cn("h-2 w-2 rounded-full mt-1.5", 
                  task.priority === 'high' ? "bg-red-500 animate-pulse" : "bg-blue-500"
                )} />
              )}
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            <div className="grid gap-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 shrink-0" />
                <span className="truncate">{task.store}</span>
              </div>
              <div className="flex items-center gap-2">
                <Box className="h-4 w-4 shrink-0" />
                <span className="truncate">{task.client}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </a>
    </Link>
  );
}
