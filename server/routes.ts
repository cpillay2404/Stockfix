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
  
  // GET all tasks
  app.get("/api/tasks", async (req, res) => {
    try {
      const tasks = await storage.getAllTasks();
      res.json(tasks);
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
      
      // Insert in batches of 100 to avoid stack overflow
      const BATCH_SIZE = 100;
      let totalCreated = 0;
      
      for (let i = 0; i < validatedTasks.length; i += BATCH_SIZE) {
        const batch = validatedTasks.slice(i, i + BATCH_SIZE);
        const created = await storage.bulkCreateTasks(batch);
        totalCreated += created.length;
        console.log(`Excel import - Batch ${Math.floor(i / BATCH_SIZE) + 1}: inserted ${created.length} tasks`);
      }

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

  return httpServer;
}
