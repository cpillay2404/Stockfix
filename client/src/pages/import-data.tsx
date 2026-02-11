import { useState, useRef, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Upload, FileSpreadsheet, AlertCircle, Loader2, CheckCircle2, Trash2, Download, FileText, Users, Lock, Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { importExcel, type ImportJobStatus } from "@/lib/api";

interface FileQueueItem {
  file: File;
  status: 'pending' | 'importing' | 'completed' | 'failed';
  progress?: ImportJobStatus;
  result?: string;
  error?: string;
}

export default function ImportData() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [fileQueue, setFileQueue] = useState<FileQueueItem[]>([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const [clearExisting, setClearExisting] = useState(true);
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<ImportJobStatus | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const multiFileInputRef = useRef<HTMLInputElement>(null);
  
  // Contacts import state
  const [contactsFile, setContactsFile] = useState<File | null>(null);
  const contactsFileInputRef = useRef<HTMLInputElement>(null);

  // Client password management state
  const [newClientName, setNewClientName] = useState("");
  const [newClientPassword, setNewClientPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [savingPassword, setSavingPassword] = useState(false);

  const { data: clientPasswords, refetch: refetchPasswords } = useQuery({
    queryKey: ["client-passwords"],
    queryFn: async () => {
      const res = await fetch('/api/client-auth/all');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const handleSetPassword = async () => {
    if (!newClientName.trim() || !newClientPassword.trim()) {
      toast({
        title: "Missing Information",
        description: "Please enter both client name and password.",
        variant: "destructive",
      });
      return;
    }
    
    setSavingPassword(true);
    try {
      const res = await fetch('/api/client-auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientName: newClientName.trim(), password: newClientPassword }),
      });
      
      if (!res.ok) throw new Error('Failed to set password');
      
      toast({
        title: "Password Set",
        description: `Password set for ${newClientName}.`,
      });
      
      setNewClientName("");
      setNewClientPassword("");
      refetchPasswords();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to set password. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSavingPassword(false);
    }
  };

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

  const handleMultiFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newItems: FileQueueItem[] = Array.from(e.target.files).map(f => ({
        file: f,
        status: 'pending' as const,
      }));
      setFileQueue(prev => [...prev, ...newItems]);
    }
    if (multiFileInputRef.current) {
      multiFileInputRef.current.value = '';
    }
  };

  const removeFromQueue = (index: number) => {
    setFileQueue(prev => prev.filter((_, i) => i !== index));
  };

  const processQueue = async () => {
    if (fileQueue.length === 0) return;
    setIsProcessingQueue(true);

    for (let i = 0; i < fileQueue.length; i++) {
      if (fileQueue[i].status === 'completed' || fileQueue[i].status === 'failed') continue;

      setFileQueue(prev => prev.map((item, idx) => 
        idx === i ? { ...item, status: 'importing' as const } : item
      ));

      try {
        const shouldClear = clearExisting && i === 0;
        const result = await importExcel(fileQueue[i].file, shouldClear, (status) => {
          setFileQueue(prev => prev.map((item, idx) => 
            idx === i ? { ...item, progress: status } : item
          ));
        });

        setFileQueue(prev => prev.map((item, idx) => 
          idx === i ? { ...item, status: 'completed' as const, result: result.message } : item
        ));
      } catch (error: any) {
        setFileQueue(prev => prev.map((item, idx) => 
          idx === i ? { ...item, status: 'failed' as const, error: error.message } : item
        ));
      }
    }

    setIsProcessingQueue(false);
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    toast({
      title: "Queue Complete",
      description: `Finished processing ${fileQueue.length} files.`,
    });
  };

  const clearQueue = () => {
    if (isProcessingQueue) return;
    setFileQueue([]);
  };

  const queuePendingCount = fileQueue.filter(f => f.status === 'pending').length;
  const queueCompletedCount = fileQueue.filter(f => f.status === 'completed').length;
  const queueFailedCount = fileQueue.filter(f => f.status === 'failed').length;

  // Contacts import mutation
  const contactsImportMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/contacts/import', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to import contacts');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      toast({
        title: "Contacts Imported",
        description: data.message,
      });
      setContactsFile(null);
      if (contactsFileInputRef.current) {
        contactsFileInputRef.current.value = '';
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Import Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleContactsFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setContactsFile(e.target.files[0]);
    }
  };

  const handleContactsUpload = () => {
    if (!contactsFile) return;
    contactsImportMutation.mutate(contactsFile);
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
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Batch Import (Multiple Files)
            </CardTitle>
            <CardDescription>
              Select multiple files to import them one after another automatically. Only the first file will clear existing data (if enabled above).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid w-full max-w-sm items-center gap-1.5">
              <Label htmlFor="multi-upload">Add Files to Queue</Label>
              <input
                ref={multiFileInputRef}
                id="multi-upload"
                type="file"
                multiple
                accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                onChange={handleMultiFileChange}
                disabled={isProcessingQueue}
                data-testid="input-multi-file"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            {fileQueue.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-muted-foreground">
                    {fileQueue.length} file{fileQueue.length !== 1 ? 's' : ''} in queue
                    {queueCompletedCount > 0 && ` • ${queueCompletedCount} done`}
                    {queueFailedCount > 0 && ` • ${queueFailedCount} failed`}
                  </p>
                  {!isProcessingQueue && (
                    <Button variant="ghost" size="sm" onClick={clearQueue} data-testid="button-clear-queue">
                      <Trash2 className="h-3 w-3 mr-1" />
                      Clear
                    </Button>
                  )}
                </div>

                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {fileQueue.map((item, index) => (
                    <div
                      key={`${item.file.name}-${index}`}
                      className={`p-3 rounded-lg border flex items-start gap-3 ${
                        item.status === 'completed' ? 'bg-green-50 border-green-200' :
                        item.status === 'failed' ? 'bg-red-50 border-red-200' :
                        item.status === 'importing' ? 'bg-blue-50 border-blue-200' :
                        'bg-muted/50 border-border'
                      }`}
                    >
                      {item.status === 'completed' ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                      ) : item.status === 'failed' ? (
                        <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                      ) : item.status === 'importing' ? (
                        <Loader2 className="h-4 w-4 text-blue-600 mt-0.5 shrink-0 animate-spin" />
                      ) : (
                        <FileSpreadsheet className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.file.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(item.file.size / (1024 * 1024)).toFixed(2)} MB
                          {item.status === 'pending' && ' • Waiting'}
                          {item.status === 'importing' && ' • Importing...'}
                          {item.status === 'completed' && ` • ${item.result || 'Done'}`}
                          {item.status === 'failed' && ` • ${item.error || 'Failed'}`}
                        </p>
                        {item.status === 'importing' && item.progress && (
                          <div className="mt-2 space-y-1">
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>{item.progress.processedRows.toLocaleString()} / {item.progress.totalRows.toLocaleString()} rows</span>
                              <span>{item.progress.progress}%</span>
                            </div>
                            <Progress value={item.progress.progress} className="h-1.5" />
                          </div>
                        )}
                      </div>
                      {item.status === 'pending' && !isProcessingQueue && (
                        <button
                          onClick={() => removeFromQueue(index)}
                          className="text-gray-400 hover:text-red-500 shrink-0"
                          data-testid={`button-remove-queue-${index}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <Button
                  className="w-full"
                  onClick={processQueue}
                  disabled={isProcessingQueue || queuePendingCount === 0}
                  data-testid="button-start-queue"
                >
                  {isProcessingQueue ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing Queue...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Import All ({queuePendingCount} file{queuePendingCount !== 1 ? 's' : ''})
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Import Contacts
            </CardTitle>
            <CardDescription>
              Upload rep and manager contact information for email notifications. Supported formats: .xlsx, .csv
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid w-full max-w-sm items-center gap-1.5">
              <Label htmlFor="contacts-upload">Contacts File</Label>
              <input 
                ref={contactsFileInputRef}
                id="contacts-upload" 
                type="file" 
                accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                onChange={handleContactsFileChange}
                disabled={contactsImportMutation.isPending}
                data-testid="input-contacts-file"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            {contactsFile && (
              <div className="bg-muted/50 p-4 rounded-lg flex items-start gap-3">
                {contactsImportMutation.isSuccess ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                ) : (
                  <FileSpreadsheet className="h-5 w-5 text-blue-600 mt-0.5" />
                )}
                <div className="space-y-1 flex-1">
                  <p className="font-medium text-sm">{contactsFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(contactsFile.size / 1024).toFixed(2)} KB
                    {contactsImportMutation.isSuccess && " • Import Complete"}
                    {!contactsImportMutation.isSuccess && " • Ready to upload"}
                  </p>
                </div>
              </div>
            )}

            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-900/50 flex gap-3">
              <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0" />
              <div className="text-sm text-blue-900 dark:text-blue-100 space-y-2">
                <p className="font-medium">Expected Column Headers:</p>
                <div className="flex flex-wrap gap-1">
                  {['REP NAME', 'REP EMAIL', 'LINE MANAGER', 'LINE MANAGER EMAIL'].map(h => (
                    <code key={h} className="bg-blue-100 dark:bg-blue-900 px-1.5 py-0.5 rounded text-xs border border-blue-200 dark:border-blue-800">
                      {h}
                    </code>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  When a rep completes a task, emails will be sent only to their email and their line manager's email.
                </p>
              </div>
            </div>

            <Button 
              className="w-full sm:w-auto" 
              onClick={handleContactsUpload} 
              disabled={!contactsFile || contactsImportMutation.isPending}
              data-testid="button-import-contacts"
            >
              {contactsImportMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Import Contacts
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

        {/* Client Password Management */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Client Access Passwords
            </CardTitle>
            <CardDescription>
              Manage passwords for client access to the app
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Add New Password */}
            <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
              <Label className="text-sm font-medium">Set Client Password</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Client Name"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  className="flex-1"
                  data-testid="input-client-name"
                />
                <Input
                  type="password"
                  placeholder="Password"
                  value={newClientPassword}
                  onChange={(e) => setNewClientPassword(e.target.value)}
                  className="flex-1"
                  data-testid="input-client-password"
                />
                <Button
                  onClick={handleSetPassword}
                  disabled={savingPassword}
                  data-testid="button-set-password"
                >
                  {savingPassword ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Set"
                  )}
                </Button>
              </div>
            </div>

            {/* Existing Passwords */}
            {clientPasswords && clientPasswords.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Configured Clients</Label>
                <div className="space-y-2">
                  {clientPasswords.map((client: { clientName: string; hasPassword: boolean }) => (
                    <div 
                      key={client.clientName}
                      className="flex items-center justify-between p-3 bg-white border rounded-lg"
                    >
                      <div className="flex items-center gap-2">
                        <Lock className="h-4 w-4 text-green-600" />
                        <span className="font-medium">{client.clientName}</span>
                      </div>
                      <span className="text-sm text-green-600">Password Set</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(!clientPasswords || clientPasswords.length === 0) && (
              <p className="text-sm text-gray-500 text-center py-4">
                No client passwords configured yet
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
