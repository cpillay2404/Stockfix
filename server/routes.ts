import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTaskSchema } from "@shared/schema";
import { z } from "zod";
import multer from "multer";
import * as XLSX from "xlsx";
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

      // Map Excel columns to our schema
      const tasks = data.map((row: any) => ({
        uniqueId: String(row['Unique Id'] || row['uniqueId'] || ''),
        key: String(row['Key'] || row['key'] || ''),
        client: String(row['client'] || ''),
        banner: String(row['BANNER.1'] || row['banner'] || ''),
        region: String(row['REGION.1'] || row['region'] || ''),
        storeName: String(row['STORE NAME'] || row['storeName'] || ''),
        repName: String(row['REP NAME'] || row['repName'] || ''),
        lineManager: String(row['LINE MANAGER'] || row['lineManager'] || ''),
        category: String(row['Category'] || row['category'] || ''),
        barcode: String(row['Barcode'] || row['barcode'] || ''),
        articleDescription: String(row['article description'] || row['articleDescription'] || ''),
        dcSoh: String(row['DC SOH'] || row['dcSoh'] || '0'),
        storeSoh: String(row['Store SOH'] || row['storeSoh'] || '0'),
        p4WeekSales: String(row['P4 week Sales'] || row['p4WeekSales'] || '0'),
        missedSales: String(row['Missed Sales (This Week)'] || row['missedSales'] || '0'),
        storeWfc: String(row['Store WFC (This Week)'] || row['storeWfc'] || '0'),
        stockClassification: String(row['Stock Classification (This Week)'] || row['stockClassification'] || ''),
        action: String(row['Action'] || row['action'] || ''),
        actionDate: String(row['Action Date'] || row['actionDate'] || ''),
        actionStatus: String(row['Action Status'] || row['actionStatus'] || 'Pending'),
        systemImage: String(row['System Image'] || row['systemImage'] || ''),
      }));

      // Validate and insert tasks
      const validatedTasks = tasks
        .filter((task: any) => task.uniqueId && task.barcode)
        .map((task: any) => insertTaskSchema.parse(task));

      const created = await storage.bulkCreateTasks(validatedTasks);

      // Clean up uploaded file
      fs.unlinkSync(req.file.path);

      res.json({ 
        success: true, 
        count: created.length,
        message: `Successfully imported ${created.length} tasks` 
      });
    } catch (error) {
      console.error("Error importing tasks:", error);
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({ error: "Failed to import tasks" });
    }
  });

  return httpServer;
}
