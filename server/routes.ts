import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTaskSchema } from "@shared/schema";
import { z } from "zod";
import multer from "multer";
import XLSX from "xlsx";
import path from "path";
import fs from "fs";

// Configure multer for file uploads
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Configure multer for image uploads
const imageUpload = multer({
  dest: 'public/images/',
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Ensure directories exist
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
if (!fs.existsSync('public')) fs.mkdirSync('public');
if (!fs.existsSync('public/images')) fs.mkdirSync('public/images', { recursive: true });

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // GET dashboard stats
  app.get("/api/dashboard/stats", async (req, res) => {
    try {
      const tasks = await storage.getAllTasks();
      
      // Count by action status
      const statusCounts: Record<string, number> = {};
      const actionCounts: Record<string, number> = {};
      const storeCounts: Record<string, number> = {};
      const repCounts: Record<string, number> = {};
      const clientCounts: Record<string, number> = {};
      
      tasks.forEach(task => {
        // Status counts
        statusCounts[task.actionStatus] = (statusCounts[task.actionStatus] || 0) + 1;
        
        // Action type counts
        const actionType = task.action.split(':')[0].trim();
        actionCounts[actionType] = (actionCounts[actionType] || 0) + 1;
        
        // Store counts
        storeCounts[task.storeName] = (storeCounts[task.storeName] || 0) + 1;
        
        // Rep counts
        if (task.repName) {
          repCounts[task.repName] = (repCounts[task.repName] || 0) + 1;
        }
        
        // Client counts
        if (task.client) {
          clientCounts[task.client] = (clientCounts[task.client] || 0) + 1;
        }
      });
      
      // Top 5 stores by task count
      const topStores = Object.entries(storeCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));
      
      // Top reps by task count
      const topReps = Object.entries(repCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));
      
      // All clients with task counts
      const clients = Object.entries(clientCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name, count }));
      
      // Action breakdown for chart
      const actionBreakdown = Object.entries(actionCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([action, count]) => ({ action, count }));
      
      // Stock classification counts
      const stockClassificationCounts: Record<string, number> = {};
      let totalP4WeekSales = 0;
      
      tasks.forEach(task => {
        if (task.stockClassification) {
          stockClassificationCounts[task.stockClassification] = (stockClassificationCounts[task.stockClassification] || 0) + 1;
        }
        totalP4WeekSales += parseFloat(task.p4WeekSales) || 0;
      });
      
      const stockClassifications = Object.entries(stockClassificationCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([classification, count]) => ({ classification, count }));
      
      // Get unique filter values
      const regions = [...new Set(tasks.map(t => t.region).filter(Boolean))].sort();
      const reps = [...new Set(tasks.map(t => t.repName).filter(Boolean))].sort();
      const stores = [...new Set(tasks.map(t => t.storeName).filter(Boolean))].sort();
      const clientList = [...new Set(tasks.map(t => t.client).filter(Boolean))].sort();
      const issueTypes = [...new Set(tasks.map(t => t.stockClassification).filter(Boolean))].sort();
      
      res.json({
        totalTasks: tasks.length,
        totalStores: Object.keys(storeCounts).length,
        pendingCount: statusCounts['Pending'] || 0,
        completedCount: statusCounts['Completed'] || 0,
        totalP4WeekSales,
        statusCounts,
        actionBreakdown,
        stockClassifications,
        topStores,
        topReps,
        clients,
        filters: {
          regions,
          reps,
          stores,
          clients: clientList,
          issueTypes,
        },
      });
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ error: "Failed to fetch dashboard stats" });
    }
  });

  // GET store summary
  app.get("/api/stores/:storeName/summary", async (req, res) => {
    try {
      const storeName = decodeURIComponent(req.params.storeName);
      const allTasks = await storage.getAllTasks();
      const storeTasks = allTasks.filter(t => t.storeName === storeName);
      
      if (storeTasks.length === 0) {
        return res.status(404).json({ error: "Store not found" });
      }

      const pendingTasks = storeTasks.filter(t => t.actionStatus === 'Pending').length;
      const completedTasks = storeTasks.filter(t => t.actionStatus === 'Completed').length;
      
      const totalP4WeekSales = storeTasks.reduce((sum, t) => {
        const sales = parseFloat(t.p4WeekSalesUnits || '0') || 0;
        return sum + sales;
      }, 0);
      
      const totalSOH = storeTasks.reduce((sum, t) => {
        const soh = parseFloat(t.soh || '0') || 0;
        return sum + soh;
      }, 0);

      // Group by client with issue breakdown
      const clientMap: Record<string, { totalIssues: number; urgentCount: number; oosCount: number; noSalesCount: number }> = {};
      storeTasks.forEach(t => {
        const client = t.client || 'Unknown';
        if (!clientMap[client]) {
          clientMap[client] = { totalIssues: 0, urgentCount: 0, oosCount: 0, noSalesCount: 0 };
        }
        clientMap[client].totalIssues++;
        
        const classification = t.stockClassification?.toLowerCase() || '';
        if (classification.includes('idle') || classification.includes('no sales')) {
          clientMap[client].urgentCount++;
          clientMap[client].noSalesCount++;
        }
        if (classification.includes('out of stock') || classification.includes('oos')) {
          clientMap[client].oosCount++;
        }
      });
      
      const clients = Object.entries(clientMap)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.totalIssues - a.totalIssues);
      
      const urgentNoSalesCount = storeTasks.filter(t => 
        t.stockClassification?.toLowerCase().includes('idle') || 
        t.stockClassification?.toLowerCase().includes('no sales')
      ).length;
      
      const outOfStockCount = storeTasks.filter(t => 
        t.stockClassification?.toLowerCase().includes('out of stock') ||
        t.stockClassification?.toLowerCase().includes('oos')
      ).length;

      const negativeSOHCount = storeTasks.filter(t => 
        t.stockClassification?.toLowerCase().includes('negative')
      ).length;

      res.json({
        storeName,
        region: storeTasks[0]?.region || '',
        repName: storeTasks[0]?.repName || '',
        totalTasks: storeTasks.length,
        pendingTasks,
        completedTasks,
        totalP4WeekSales: Math.round(totalP4WeekSales),
        totalSOH: Math.round(totalSOH),
        clients,
        urgentNoSalesCount,
        outOfStockCount,
        negativeSOHCount,
      });
    } catch (error) {
      console.error("Error fetching store summary:", error);
      res.status(500).json({ error: "Failed to fetch store summary" });
    }
  });

  // GET all tasks with pagination
  app.get("/api/tasks", async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const search = (req.query.search as string) || '';
      const status = (req.query.status as string) || '';
      const filters = {
        region: (req.query.region as string) || '',
        rep: (req.query.rep as string) || '',
        store: (req.query.store as string) || '',
        client: (req.query.client as string) || '',
        issue: (req.query.issue as string) || '',
        category: (req.query.category as string) || '',
      };
      
      const result = await storage.getTasksPaginated(page, limit, search, status, filters);
      res.json(result);
    } catch (error) {
      console.error("Error fetching tasks:", error);
      res.status(500).json({ error: "Failed to fetch tasks" });
    }
  });

  // GET single task by uniqueId
  app.get("/api/tasks/:uniqueId", async (req, res) => {
    try {
      const task = await storage.getTaskByUniqueId(req.params.uniqueId);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
      res.json(task);
    } catch (error) {
      console.error("Error fetching task:", error);
      res.status(500).json({ error: "Failed to fetch task" });
    }
  });

  // PATCH update task (for feedback submission)
  app.patch("/api/tasks/:uniqueId", async (req, res) => {
    try {
      const task = await storage.getTaskByUniqueId(req.params.uniqueId);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }

      const updateSchema = z.object({
        actionStatus: z.string().optional(),
        reasonCode: z.string().optional(),
        actionTakenComment: z.string().optional(),
        feedback: z.string().optional(),
        captureDate: z.string().optional(),
        image1: z.string().optional(),
        image2: z.string().optional(),
      });

      const validated = updateSchema.parse(req.body);
      const updated = await storage.updateTask(task.id, validated);
      
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating task:", error);
      res.status(500).json({ error: "Failed to update task" });
    }
  });

  // POST upload image
  app.post("/api/tasks/upload-image", imageUpload.single('image'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No image file provided" });
      }

      const imageUrl = `/images/${req.file.filename}`;
      res.json({ url: imageUrl });
    } catch (error) {
      console.error("Error uploading image:", error);
      res.status(500).json({ error: "Failed to upload image" });
    }
  });

  // POST import Excel file
  app.post("/api/tasks/import", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }

      const workbook = XLSX.readFile(req.file.path);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet);

      console.log("Excel import - Total rows:", data.length);
      if (data.length > 0) {
        console.log("Excel import - Column headers:", Object.keys(data[0] as object));
      }

      // Helper to get value from row with flexible column matching
      const getValue = (row: any, ...possibleKeys: string[]): string => {
        for (const key of possibleKeys) {
          if (row[key] !== undefined && row[key] !== null) {
            return String(row[key]);
          }
          // Also try case-insensitive match
          const lowerKey = key.toLowerCase();
          for (const rowKey of Object.keys(row)) {
            if (rowKey.toLowerCase() === lowerKey || rowKey.toLowerCase().replace(/[^a-z0-9]/g, '') === lowerKey.replace(/[^a-z0-9]/g, '')) {
              return String(row[rowKey]);
            }
          }
        }
        return '';
      };

      // Map Excel columns to our schema with flexible matching
      const mappedTasks = data.map((row: any, index: number) => {
        const task = {
          uniqueId: getValue(row, 'Unique Id', 'UniqueId', 'unique_id', 'uniqueid', 'ID') || `task-${Date.now()}-${index}`,
          key: getValue(row, 'Key', 'key') || `key-${index}`,
          client: getValue(row, 'client', 'Client', 'CLIENT') || 'Unknown',
          banner: getValue(row, 'BANNER.1', 'BANNER', 'Banner', 'banner') || '',
          region: getValue(row, 'REGION.1', 'REGION', 'Region', 'region') || '',
          storeName: getValue(row, 'STORE NAME', 'Store Name', 'StoreName', 'store_name', 'Store') || 'Unknown Store',
          repName: getValue(row, 'REP NAME', 'Rep Name', 'RepName', 'rep_name', 'Rep') || '',
          lineManager: getValue(row, 'LINE MANAGER', 'Line Manager', 'LineManager', 'line_manager') || '',
          category: getValue(row, 'Category', 'CATEGORY', 'category') || '',
          barcode: getValue(row, 'Barcode', 'BARCODE', 'barcode', 'SKU', 'sku') || '',
          articleDescription: getValue(row, 'article description', 'Article Description', 'ArticleDescription', 'Description', 'Product', 'Product Name') || 'No Description',
          dcSoh: getValue(row, 'DC SOH', 'DC_SOH', 'DCSOH', 'dc_soh') || '0',
          storeSoh: getValue(row, 'Store SOH', 'STORE_SOH', 'StoreSoh', 'store_soh') || '0',
          p4WeekSales: getValue(row, 'P4 week Sales', 'P4WeekSales', 'p4_week_sales', 'P4 Sales') || '0',
          missedSales: getValue(row, 'Missed Sales (This Week)', 'Missed Sales', 'MissedSales', 'missed_sales') || '0',
          storeWfc: getValue(row, 'Store WFC (This Week)', 'Store WFC', 'StoreWfc', 'store_wfc', 'WFC') || '0',
          stockClassification: getValue(row, 'Stock Classification (This Week)', 'Stock Classification', 'StockClassification', 'stock_classification') || '',
          action: getValue(row, 'Action', 'ACTION', 'action', 'Task', 'Required Action') || 'Review stock',
          actionDate: getValue(row, 'Action Date', 'ActionDate', 'action_date', 'Due Date', 'Date') || new Date().toISOString().split('T')[0],
          actionStatus: getValue(row, 'Action Status', 'ActionStatus', 'action_status', 'Status') || 'Pending',
          systemImage: getValue(row, 'System Image', 'SystemImage', 'system_image', 'Image') || '',
        };
        return task;
      });

      console.log("Excel import - Mapped tasks:", mappedTasks.length);
      if (mappedTasks.length > 0) {
        console.log("Excel import - Sample task:", JSON.stringify(mappedTasks[0], null, 2));
      }

      // Filter out tasks without barcode (required field)
      const validTasks = mappedTasks.filter((task: any) => task.barcode && task.barcode !== '');
      console.log("Excel import - Valid tasks with barcode:", validTasks.length);

      if (validTasks.length === 0) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ 
          error: "No valid tasks found. Make sure your Excel file has a 'Barcode' column.",
          columns: data.length > 0 ? Object.keys(data[0] as object) : []
        });
      }

      // Validate tasks
      const validatedTasks = validTasks.map((task: any) => insertTaskSchema.parse(task));
      
      // Insert in batches of 100, skip duplicates
      const BATCH_SIZE = 100;
      let totalCreated = 0;
      let totalSkipped = 0;
      
      for (let i = 0; i < validatedTasks.length; i += BATCH_SIZE) {
        const batch = validatedTasks.slice(i, i + BATCH_SIZE);
        try {
          const created = await storage.bulkCreateTasksIgnoreDuplicates(batch);
          totalCreated += created.length;
          console.log(`Excel import - Batch ${Math.floor(i / BATCH_SIZE) + 1}: inserted ${created.length} tasks`);
        } catch (err) {
          // If bulk fails, try one by one
          for (const task of batch) {
            try {
              await storage.createTask(task);
              totalCreated++;
            } catch {
              totalSkipped++;
            }
          }
        }
      }
      
      console.log(`Excel import - Total created: ${totalCreated}, skipped: ${totalSkipped}`);

      // Clean up uploaded file
      fs.unlinkSync(req.file.path);

      res.json({ 
        success: true, 
        count: totalCreated,
        message: `Successfully imported ${totalCreated} tasks` 
      });
    } catch (error) {
      console.error("Error importing tasks:", error);
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({ error: "Failed to import tasks: " + (error instanceof Error ? error.message : 'Unknown error') });
    }
  });

  // GET export tasks as Excel
  app.get("/api/tasks/export", async (req, res) => {
    try {
      const allTasks = await storage.getAllTasks();
      
      // Transform data to match Excel columns
      const exportData = allTasks.map(task => ({
        'Unique Id': task.uniqueId,
        'Key': task.key,
        'client': task.client,
        'BANNER.1': task.banner,
        'REGION.1': task.region,
        'STORE NAME': task.storeName,
        'REP NAME': task.repName,
        'LINE MANAGER': task.lineManager,
        'Category': task.category,
        'Barcode': task.barcode,
        'article description': task.articleDescription,
        'DC SOH': task.dcSoh,
        'Store SOH': task.storeSoh,
        'P4 week Sales': task.p4WeekSales,
        'Missed Sales (This Week)': task.missedSales,
        'Store WFC (This Week)': task.storeWfc,
        'Stock Classification (This Week)': task.stockClassification,
        'Action': task.action,
        'Action Date': task.actionDate,
        'Action Status': task.actionStatus,
        'Reason Code': task.reasonCode || '',
        'Action Taken Comment': task.actionTakenComment || '',
        'Feedback': task.feedback || '',
        'Capture Date': task.captureDate || '',
        'Image 1': task.image1 || '',
        'Image 2': task.image2 || '',
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Tasks');
      
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      
      res.setHeader('Content-Disposition', 'attachment; filename=stockfix_export.xlsx');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(buffer);
    } catch (error) {
      console.error("Error exporting tasks:", error);
      res.status(500).json({ error: "Failed to export tasks" });
    }
  });

  return httpServer;
}
