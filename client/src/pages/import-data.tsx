import { useState } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle } from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

export default function ImportData() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = () => {
    if (!file) return;

    setIsUploading(true);
    
    // Simulate processing time
    setTimeout(() => {
      setIsUploading(false);
      toast({
        title: "Import Successful",
        description: `Successfully imported tasks from ${file.name}`,
      });
      setLocation("/");
    }, 2000);
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Import Data</h1>
          <Button variant="ghost" onClick={() => setLocation("/")}>Cancel</Button>
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
              <Label htmlFor="picture">Spreadsheet File</Label>
              <div className="flex items-center gap-4">
                <div className="grid w-full max-w-sm items-center gap-1.5">
                  <Input 
                    id="excel-upload" 
                    type="file" 
                    accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                    onChange={handleFileChange}
                  />
                </div>
              </div>
            </div>

            {file && (
              <div className="bg-muted/50 p-4 rounded-lg flex items-start gap-3">
                <FileSpreadsheet className="h-5 w-5 text-green-600 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-medium text-sm">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(2)} KB • Ready to upload
                  </p>
                </div>
              </div>
            )}

            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-900/50 flex gap-3">
              <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0" />
              <div className="text-sm text-blue-900 dark:text-blue-100 space-y-2">
                <p className="font-medium">Expected Column Headers</p>
                <p className="opacity-90">
                  Ensure your sheet includes: <code className="bg-blue-100 dark:bg-blue-900 px-1 py-0.5 rounded">Store</code>, <code className="bg-blue-100 dark:bg-blue-900 px-1 py-0.5 rounded">SKU</code>, <code className="bg-blue-100 dark:bg-blue-900 px-1 py-0.5 rounded">Product Name</code>, <code className="bg-blue-100 dark:bg-blue-900 px-1 py-0.5 rounded">Client</code>, <code className="bg-blue-100 dark:bg-blue-900 px-1 py-0.5 rounded">Instructions</code>.
                </p>
                <p className="text-xs opacity-75">
                  * Additional columns will be stored as custom data.
                </p>
              </div>
            </div>

            <Button 
              className="w-full sm:w-auto" 
              onClick={handleUpload} 
              disabled={!file || isUploading}
            >
              {isUploading ? (
                <>Processing...</>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Import Tasks
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
