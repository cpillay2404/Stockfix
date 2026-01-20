import { useState, useRef, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Upload, FileSpreadsheet, AlertCircle, Loader2, CheckCircle2, Trash2, Download, FileText } from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { importExcel, type ImportJobStatus } from "@/lib/api";

export default function ImportData() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [clearExisting, setClearExisting] = useState(true);
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<ImportJobStatus | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: taskCount } = useQuery({
    queryKey: ["task-count"],
    queryFn: async () => {
      const res = await fetch('/api/tasks/export/count');
      if (!res.ok) return { count: 0 };
      return res.json();
    },
  });

  const isLargeDataset = (taskCount?.count || 0) > 50000;

  const handleExport = async (type: 'all' | 'all-csv' | 'rep' | 'manager') => {
    setIsExporting(type);
    
    const config = {
      'all': { url: '/api/tasks/export', filename: 'stockfix_all_tasks.xlsx', title: 'All Tasks Export (Excel)' },
      'all-csv': { url: '/api/tasks/export/csv', filename: 'stockfix_all_tasks.csv', title: 'All Tasks Export (CSV)' },
      rep: { url: '/api/export/rep-leaderboard', filename: 'rep_leaderboard.xlsx', title: 'Rep Leaderboard Export' },
      manager: { url: '/api/export/manager-leaderboard', filename: 'manager_leaderboard.xlsx', title: 'Manager Leaderboard Export' },
    };
    
    toast({
      title: `${config[type].title} Started`,
      description: type === 'all-csv' ? "Streaming download..." : "Preparing your download...",
    });
    
    try {
      const response = await fetch(config[type].url);
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        if (errorData?.useCSV) {
          toast({
            title: "Dataset Too Large for Excel",
            description: `${errorData.count.toLocaleString()} tasks. Please use CSV export instead.`,
            variant: "destructive",
          });
          setIsExporting(null);
          return;
        }
        throw new Error('Export failed');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = config[type].filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Export Complete",
        description: `${config[type].filename} downloaded successfully.`,
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "Export Failed",
        description: "There was an error exporting the data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(null);
    }
  };

  const importMutation = useMutation({
    mutationFn: (file: File) => importExcel(file, clearExisting, (status) => {
      setImportProgress(status);
    }),
    onSuccess: (data: any) => {
      setImportProgress(null);
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast({
        title: "Import Successful",
        description: data.message,
      });
      setTimeout(() => setLocation("/"), 3000);
    },
    onError: (error: Error) => {
      setImportProgress(null);
      toast({
        title: "Import Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = () => {
    if (!file) return;
    importMutation.mutate(file);
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Import Data</h1>
          <Button variant="ghost" onClick={() => setLocation("/")} disabled={importMutation.isPending}>
            Cancel
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Upload Excel Sheet</CardTitle>
            <CardDescription>
              Upload your daily task list. Supported formats: .xlsx, .csv
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid w-full max-w-sm items-center gap-1.5">
              <Label htmlFor="excel-upload">Spreadsheet File</Label>
              <div className="flex items-center gap-4">
                <div className="grid w-full max-w-sm items-center gap-1.5">
                  <input 
                    ref={fileInputRef}
                    id="excel-upload" 
                    type="file" 
                    accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                    onChange={handleFileChange}
                    disabled={importMutation.isPending}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              </div>
            </div>

            {file && (
              <div className="bg-muted/50 p-4 rounded-lg flex items-start gap-3">
                {importMutation.isSuccess ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                ) : (
                  <FileSpreadsheet className="h-5 w-5 text-green-600 mt-0.5" />
                )}
                <div className="space-y-1 flex-1">
                  <p className="font-medium text-sm">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB
                    {importMutation.isSuccess && " • Import Complete"}
                    {!importMutation.isSuccess && !importProgress && " • Ready to upload"}
                    {file.size > 20 * 1024 * 1024 && !importMutation.isPending && !importMutation.isSuccess && " • Large file - will process in background"}
                  </p>
                  
                  {importProgress && (
                    <div className="mt-3 space-y-2">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Processing: {importProgress.processedRows.toLocaleString()} / {importProgress.totalRows.toLocaleString()} rows</span>
                        <span>{importProgress.progress}%</span>
                      </div>
                      <Progress value={importProgress.progress} className="h-2" />
                      <p className="text-xs text-green-600">
                        {importProgress.createdCount.toLocaleString()} tasks created
                        {importProgress.skippedCount > 0 && `, ${importProgress.skippedCount.toLocaleString()} skipped`}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center space-x-3 p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-900/50">
              <Checkbox 
                id="clear-existing" 
                checked={clearExisting}
                onCheckedChange={(checked) => setClearExisting(checked === true)}
                disabled={importMutation.isPending}
                data-testid="checkbox-clear-existing"
              />
              <div className="flex-1">
                <Label htmlFor="clear-existing" className="text-sm font-medium cursor-pointer flex items-center gap-2">
                  <Trash2 className="h-4 w-4 text-orange-600" />
                  Full Refresh (Clear all existing tasks before import)
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Recommended for weekly imports. Images remain safe in cloud storage.
                </p>
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-900/50 flex gap-3">
              <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0" />
              <div className="text-sm text-blue-900 dark:text-blue-100 space-y-2">
                <p className="font-medium">Expected Column Headers:</p>
                <div className="flex flex-wrap gap-1">
                  {['client', 'REGION.1', 'BANNER.1', 'cleaned store name', 'LINE MANAGER', 'REP NAME', 'barcode', 'article description', 'Stock Classification (This Week)', 'Action Column', 'week ending', 'Store SOH', 'WFC', 'Sell out p4 weeks', 'Supplying dc soh'].map(h => (
                    <code key={h} className="bg-blue-100 dark:bg-blue-900 px-1.5 py-0.5 rounded text-xs border border-blue-200 dark:border-blue-800">
                      {h}
                    </code>
                  ))}
                </div>
              </div>
            </div>

            <Button 
              className="w-full sm:w-auto" 
              onClick={handleUpload} 
              disabled={!file || importMutation.isPending}
            >
              {importMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Import Tasks
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Export Data</CardTitle>
            <CardDescription>
              Download task data and leaderboards.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {taskCount?.count > 0 && (
              <div className={`p-4 rounded-lg border ${isLargeDataset ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-100'}`}>
                <p className={`text-sm font-medium ${isLargeDataset ? 'text-amber-800' : 'text-green-900'}`}>
                  {taskCount.count.toLocaleString()} tasks available for export
                </p>
                {isLargeDataset && (
                  <p className="text-xs text-amber-700 mt-1">
                    Large dataset detected. Use CSV export for faster, more reliable downloads.
                  </p>
                )}
              </div>
            )}
            <div className="flex flex-col gap-2">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">All Tasks</div>
              <Button 
                className="w-full" 
                variant={isLargeDataset ? "default" : "outline"}
                onClick={() => handleExport('all-csv')} 
                disabled={isExporting !== null}
                data-testid="button-export-csv"
              >
                {isExporting === 'all-csv' ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Streaming...
                  </>
                ) : (
                  <>
                    <FileText className="mr-2 h-4 w-4" />
                    Export as CSV {isLargeDataset && '(Recommended)'}
                  </>
                )}
              </Button>
              <Button 
                className="w-full" 
                variant="outline"
                onClick={() => handleExport('all')} 
                disabled={isExporting !== null || isLargeDataset}
                data-testid="button-export-all"
              >
                {isExporting === 'all' ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Export as Excel {isLargeDataset && '(Disabled - too large)'}
                  </>
                )}
              </Button>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mt-4 mb-1">Leaderboards</div>
              <Button 
                className="w-full" 
                variant="outline"
                onClick={() => handleExport('rep')} 
                disabled={isExporting !== null}
                data-testid="button-export-rep"
              >
                {isExporting === 'rep' ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Export Rep Leaderboard
                  </>
                )}
              </Button>
              <Button 
                className="w-full" 
                variant="outline"
                onClick={() => handleExport('manager')} 
                disabled={isExporting !== null}
                data-testid="button-export-manager"
              >
                {isExporting === 'manager' ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Export Manager Leaderboard
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
