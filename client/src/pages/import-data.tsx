import { useState, useRef } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, FileSpreadsheet, AlertCircle, Loader2, CheckCircle2, Trash2, Download } from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { importExcel } from "@/lib/api";

export default function ImportData() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [clearExisting, setClearExisting] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    setIsExporting(true);
    toast({
      title: "Export Started",
      description: "Your download will begin shortly. This may take a moment for large datasets.",
    });
    
    // Use direct link download for large files - more reliable than fetch
    const link = document.createElement('a');
    link.href = '/api/tasks/export';
    link.download = 'stockfix_export.xlsx';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Reset button after a delay since we can't track download completion
    setTimeout(() => {
      setIsExporting(false);
    }, 3000);
  };

  const importMutation = useMutation({
    mutationFn: (file: File) => importExcel(file, clearExisting),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast({
        title: "Import Successful",
        description: data.message,
      });
      setTimeout(() => setLocation("/"), 1500);
    },
    onError: (error: Error) => {
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
                <div className="space-y-1">
                  <p className="font-medium text-sm">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(2)} KB
                    {importMutation.isSuccess && " • Import Complete"}
                    {!importMutation.isSuccess && " • Ready to upload"}
                  </p>
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
                  {['client', 'REGION.1', 'BANNER.1', 'cleaned store name', 'REP NAME', 'barcode', 'article description', 'Stock Classification (This Week)', 'Action Column', 'week ending', 'Store SOH', 'WFC', 'Sell out p4 weeks', 'Supplying dc soh'].map(h => (
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
              Download all task data including rep feedback and image URLs as an Excel file.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-100 dark:border-green-900/50">
              <p className="text-sm text-green-900 dark:text-green-100">
                The export includes all columns plus rep-captured data: Reason Code, Action Taken Comment, Feedback, Capture Date, and clickable Image URLs.
              </p>
            </div>
            <Button 
              className="w-full sm:w-auto" 
              variant="outline"
              onClick={handleExport} 
              disabled={isExporting}
              data-testid="button-export"
            >
              {isExporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Export to Excel
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
