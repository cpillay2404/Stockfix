import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTaskSchema } from "@shared/schema";
import { normalizeObjectUrl } from "@shared/urlUtils";
import { z } from "zod";
import multer from "multer";
import XLSX from "xlsx";
import path from "path";
import fs from "fs";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { sendTaskCompletedEmail } from "./email";
import { calculateBadge, calculateRepGamificationStats, getLeaderboard, getTeamStats, type RepGamificationStats } from "./gamification";
import { db } from "./db";
import { sql, eq, and } from "drizzle-orm";

function safeParseFloat(val: string | number | null | undefined): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  const cleaned = val.replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}
import { tasks } from "@shared/schema";

// Async import job tracking
interface ImportJob {
  id: string;
  status: 'processing' | 'completed' | 'failed';
  progress: number;
  totalRows: number;
  processedRows: number;
  createdCount: number;
  skippedCount: number;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}

const importJobs = new Map<string, ImportJob>();

function generateJobId(): string {
  return `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Async import processing function for large files
function mapRowToTask(row: any, index: number, getValue: (row: any, ...keys: string[]) => string, sanitizeBarcode: (val: string) => string, sanitizeNumeric: (val: string) => string, parseToISODate: (val: any) => string) {
  const storeVal = getValue(row, 'cleaned store name', 'STORE NAME', 'Store Name', 'StoreName', 'store_name', 'Store');
  const barcodeVal = sanitizeBarcode(getValue(row, 'barcode', 'Barcode', 'BARCODE', 'SKU', 'sku'));
  const weekEndingVal = getValue(row, 'week ending', 'Week Ending', 'WeekEnding', 'week_ending', 'Date');
  const weekEndingISO = parseToISODate(weekEndingVal);
  
  return {
    uniqueId: `${storeVal}-${barcodeVal}-${weekEndingISO}`.replace(/[^a-zA-Z0-9-]/g, '') || `task-${Date.now()}-${index}`,
    key: `${storeVal}-${barcodeVal}`.substring(0, 100) || `key-${index}`,
    client: getValue(row, 'client', 'Client', 'CLIENT') || 'Unknown',
    banner: getValue(row, 'BANNER.1', 'BANNER', 'Banner', 'banner') || '',
    region: getValue(row, 'REGION.1', 'REGION', 'Region', 'region') || '',
    storeName: storeVal || 'Unknown Store',
    repName: getValue(row, 'REP NAME', 'Rep Name', 'RepName', 'rep_name', 'Rep') || '',
    lineManager: getValue(row, 'LINE MANAGER', 'Line Manager', 'LineManager', 'line_manager') || '',
    category: getValue(row, 'Category', 'CATEGORY', 'category') || '',
    barcode: barcodeVal || '',
    articleDescription: getValue(row, 'article description', 'Article Description', 'ArticleDescription', 'Description', 'Product', 'Product Name') || 'No Description',
    dcSoh: sanitizeNumeric(getValue(row, 'Supplying dc soh', 'DC SOH', 'DC_SOH', 'DCSOH', 'dc_soh', 'Supplying DC SOH')),
    storeSoh: sanitizeNumeric(getValue(row, 'Store SOH', 'STORE_SOH', 'StoreSoh', 'store_soh', 'store soh')),
    p4WeekSales: sanitizeNumeric(getValue(row, 'Sell out p4 weeks', 'P4 week Sales', 'P4WeekSales', 'p4_week_sales', 'P4 Sales', 'Sell out P4 weeks', 'sell out p4 weeks')),
    missedSales: sanitizeNumeric(getValue(row, 'Missed Sales (This Week)', 'Missed Sales', 'MissedSales', 'missed_sales')),
    storeWfc: sanitizeNumeric(getValue(row, 'WFC', ' WFC', 'Store WFC (This Week)', 'Store WFC', 'StoreWfc', 'store_wfc')),
    stockClassification: getValue(row, 'Stock Classification (This Week)', 'Stock Classification', 'StockClassification', 'stock_classification') || '',
    weekEnding: weekEndingVal || new Date().toISOString().split('T')[0],
    weekEndingDate: weekEndingISO,
    action: getValue(row, 'Action Column', 'Action', 'ACTION', 'action', 'Task', 'Required Action') || 'Review stock',
    actionDate: null,
    actionStatus: getValue(row, 'Action Status', 'ActionStatus', 'action_status', 'Status') || 'Pending',
    systemImage: getValue(row, 'System Image', 'SystemImage', 'system_image', 'Image') || '',
  };
}

const getValueHelper = (row: any, ...possibleKeys: string[]): string => {
  for (const key of possibleKeys) {
    if (row[key] !== undefined && row[key] !== null) {
      return String(row[key]);
    }
    const lowerKey = key.toLowerCase();
    for (const rowKey of Object.keys(row)) {
      if (rowKey.toLowerCase() === lowerKey || rowKey.toLowerCase().replace(/[^a-z0-9]/g, '') === lowerKey.replace(/[^a-z0-9]/g, '')) {
        return String(row[rowKey]);
      }
    }
  }
  return '';
};

const sanitizeBarcodeHelper = (val: string): string => {
  if (!val || val === '' || val === '0') return '';
  let cleaned = val.trim().replace(',', '.');
  if (/[eE]\+/.test(cleaned)) {
    const num = Number(cleaned);
    if (!isNaN(num)) return num.toFixed(0);
  }
  cleaned = cleaned.replace(/\.0+$/, '');
  return cleaned;
};

const sanitizeNumericHelper = (val: string): string => {
  if (!val || val === '' || val === '0') return '0';
  let cleaned = val.trim();
  const hasDot = cleaned.includes('.');
  const hasComma = cleaned.includes(',');
  if (hasDot && hasComma) {
    const lastDot = cleaned.lastIndexOf('.');
    const lastComma = cleaned.lastIndexOf(',');
    if (lastComma > lastDot) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (hasComma) {
    cleaned = cleaned.replace(',', '.');
  }
  return cleaned;
};

const parseToISODateHelper = (dateVal: any): string => {
  if (!dateVal) return new Date().toISOString().split('T')[0];
  try {
    if (typeof dateVal === 'number' || !isNaN(Number(dateVal))) {
      const num = Number(dateVal);
      if (num > 1 && num < 100000) {
        const excelEpoch = new Date(1899, 11, 30);
        const resultDate = new Date(excelEpoch.getTime() + num * 24 * 60 * 60 * 1000);
        return resultDate.toISOString().split('T')[0];
      }
    }
    const parsed = new Date(String(dateVal));
    if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 2000 && parsed.getFullYear() < 2100) {
      return parsed.toISOString().split('T')[0];
    }
  } catch (e) {}
  return new Date().toISOString().split('T')[0];
};

async function processImportAsync(filePath: string, clearExisting: boolean, jobId: string): Promise<void> {
  const job = importJobs.get(jobId);
  if (!job) return;

  try {
    console.log(`Async import [${jobId}] - Starting...`);
    
    if (clearExisting) {
      console.log(`Async import [${jobId}] - Clearing existing tasks...`);
      await storage.deleteAllTasks();
    }

    const fileStats = fs.statSync(filePath);
    const fileSizeMB = (fileStats.size / (1024 * 1024)).toFixed(2);
    console.log(`Async import [${jobId}] - Reading file (${fileSizeMB}MB)...`);
    
    const workbook = XLSX.readFile(filePath, { cellDates: false, cellFormula: false, cellHTML: false, cellStyles: false, cellNF: false });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);
    
    job.totalRows = data.length;
    console.log(`Async import [${jobId}] - Total rows: ${data.length}, parsing and inserting...`);

    const BATCH_SIZE = 500;
    let batchTasks: any[] = [];
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const mapped = mapRowToTask(row, i, getValueHelper, sanitizeBarcodeHelper, sanitizeNumericHelper, parseToISODateHelper);
      
      if (!mapped.barcode || mapped.barcode === '') {
        job.skippedCount++;
        continue;
      }
      
      try {
        const validated = insertTaskSchema.parse(mapped);
        batchTasks.push(validated);
      } catch {
        job.skippedCount++;
      }
      
      if (batchTasks.length >= BATCH_SIZE) {
        const batchLen = batchTasks.length;
        try {
          const inserted = await db.insert(tasks).values(batchTasks).onConflictDoNothing().returning({ id: tasks.id });
          job.createdCount += inserted.length;
          job.skippedCount += batchLen - inserted.length;
        } catch (err) {
          for (const task of batchTasks) {
            try {
              await storage.createTask(task);
              job.createdCount++;
            } catch {
              job.skippedCount++;
            }
          }
        }
        batchTasks = [];
        job.processedRows = i + 1;
        job.progress = Math.round(((i + 1) / data.length) * 100);
        
        if (i % 5000 === 0) {
          console.log(`Async import [${jobId}] - Progress: ${job.progress}% (${i + 1}/${data.length})`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    }
    
    if (batchTasks.length > 0) {
      const batchLen = batchTasks.length;
      try {
        const inserted = await db.insert(tasks).values(batchTasks).onConflictDoNothing().returning({ id: tasks.id });
        job.createdCount += inserted.length;
        job.skippedCount += batchLen - inserted.length;
      } catch (err) {
        for (const task of batchTasks) {
          try {
            await storage.createTask(task);
            job.createdCount++;
          } catch {
            job.skippedCount++;
          }
        }
      }
    }
    
    job.processedRows = data.length;
    job.progress = 100;

    fs.unlinkSync(filePath);
    invalidateGamificationCache();
    
    job.status = 'completed';
    job.completedAt = new Date();
    console.log(`Async import [${jobId}] - Completed: ${job.createdCount} created, ${job.skippedCount} skipped`);
    
  } catch (error: any) {
    console.error(`Async import [${jobId}] - Error:`, error);
    job.status = 'failed';
    job.error = error.message || 'Unknown error';
    job.completedAt = new Date();
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

// Priority action types - these are the most important tasks reps should focus on
// Lower number = higher priority (appears first)
const PRIORITY_ACTIONS = [
  { pattern: 'fix counts: negative', priority: 1 },
  { pattern: 'negative soh', priority: 1 },
  { pattern: 'check count: no sales in 60', priority: 2 },
  { pattern: 'check count: no sales in 15', priority: 3 },
  { pattern: 'urgent: place order', priority: 4 },
  { pattern: 'check count: no sales in 30', priority: 5 },
];

// Returns priority level (1=highest, 999=lowest/normal)
function getTaskPriority(action: string | null | undefined): number {
  if (!action) return 999;
  const normalizedAction = action.toLowerCase().trim();
  
  for (const { pattern, priority } of PRIORITY_ACTIONS) {
    if (normalizedAction.includes(pattern)) {
      return priority;
    }
  }
  return 999; // Non-priority tasks
}

// Check if a task is a priority task
function isPriorityTask(action: string | null | undefined): boolean {
  return getTaskPriority(action) < 999;
}

// Sort tasks by priority (priority tasks first, then by creation date)
function sortByPriority<T extends { action: string; createdAt: Date | string }>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    const priorityA = getTaskPriority(a.action);
    const priorityB = getTaskPriority(b.action);
    
    if (priorityA !== priorityB) {
      return priorityA - priorityB; // Lower priority number comes first
    }
    
    // Same priority - sort by creation date (newest first)
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

// Simple in-memory cache for expensive calculations
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  key: string;
}

const gamificationCache: Map<string, CacheEntry<{
  stats: RepGamificationStats[];
  weekEndingDate: string | null;
}>> = new Map();

const dashboardStatsCache: Map<string, CacheEntry<any>> = new Map();

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const DASHBOARD_CACHE_TTL_MS = 60 * 1000; // 1 minute for dashboard stats

function getCachedGamificationStats(cacheKey: string): { stats: RepGamificationStats[]; weekEndingDate: string | null } | null {
  const entry = gamificationCache.get(cacheKey);
  if (entry && (Date.now() - entry.timestamp) < CACHE_TTL_MS) {
    return entry.data;
  }
  return null;
}

function setCachedGamificationStats(cacheKey: string, data: { stats: RepGamificationStats[]; weekEndingDate: string | null }) {
  gamificationCache.set(cacheKey, {
    data,
    timestamp: Date.now(),
    key: cacheKey,
  });
}

// Clear cache when tasks are modified
function invalidateGamificationCache() {
  gamificationCache.clear();
  storage.clearFiltersCache();
}

// Clear all caches endpoint
function clearAllCaches() {
  gamificationCache.clear();
  dashboardStatsCache.clear();
  storage.clearFiltersCache();
}

// Configure multer for file uploads - increased to 150MB for large imports
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 150 * 1024 * 1024 }, // 150MB limit
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['.xlsx', '.xls', '.csv'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Allowed: ${allowedTypes.join(', ')}`));
    }
  }
});

// Memory-based multer for small files like contacts (uses buffer instead of disk)
const uploadMemory = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit for contacts
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['.xlsx', '.xls', '.csv'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Allowed: ${allowedTypes.join(', ')}`));
    }
  }
});

// Multer error handler middleware
const handleMulterError = (err: any, req: any, res: any, next: any) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 150MB.' });
    }
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  } else if (err) {
    return res.status(400).json({ error: err.message || 'Upload failed' });
  }
  next();
};

// Image uploads now use cloud storage via object storage integration

// Ensure directories exist
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
if (!fs.existsSync('public')) fs.mkdirSync('public');
if (!fs.existsSync('public/images')) fs.mkdirSync('public/images', { recursive: true });

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Add cache-busting headers for all API routes to ensure fresh data
  app.use('/api', (req, res, next) => {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Surrogate-Control': 'no-store'
    });
    next();
  });
  
  // Register object storage routes for persistent file uploads
  registerObjectStorageRoutes(app);
  
  // Serve legacy images from public/images directory (backward compatibility)
  app.get('/images/:filename', (req, res) => {
    const filePath = path.join(process.cwd(), 'public', 'images', req.params.filename);
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).json({ error: 'Image not found' });
    }
  });
  
  // GET dashboard stats
  app.get("/api/dashboard/stats", async (req, res) => {
    try {
      const regionFilter = req.query.region as string | undefined;
      const clientFilter = req.query.client as string | undefined;
      
      // Check cache first
      const cacheKey = `dashboard_${regionFilter || 'all'}_${clientFilter || 'all'}`;
      const cached = dashboardStatsCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < DASHBOARD_CACHE_TTL_MS) {
        return res.json(cached.data);
      }
      
      // Get latest week for filtering - only show current week's data
      const latestWeek = await storage.getLatestWeekEndingDate();
      
      // Use optimized SQL-based method instead of loading all tasks
      const result = await storage.getDashboardStatsOptimized({
        region: regionFilter,
        client: clientFilter,
        weekEndingDate: latestWeek || undefined,
      });
      
      const response = {
        totalTasks: result.totalTasks,
        totalStores: result.filters.stores.length,
        pendingCount: result.statusCounts['Pending'] || 0,
        completedCount: result.statusCounts['Completed'] || 0,
        statusCounts: result.statusCounts,
        filters: {
          regions: result.filters.regions,
          reps: result.filters.reps,
          stores: result.filters.stores,
          clients: result.filters.clients,
        },
      };
      
      // Cache the response
      dashboardStatsCache.set(cacheKey, { data: response, timestamp: Date.now(), key: cacheKey });
      
      res.json(response);
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ error: "Failed to fetch dashboard stats" });
    }
  });

  // GET stores for a specific rep
  app.get("/api/reps/:repName/stores", async (req, res) => {
    try {
      const repName = decodeURIComponent(req.params.repName);
      
      // Check cache first
      const cacheKey = `rep_stores_${repName}`;
      const cached = dashboardStatsCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < DASHBOARD_CACHE_TTL_MS) {
        return res.json(cached.data);
      }
      
      // Use SQL DISTINCT for performance
      const stores = await storage.getStoresForRep(repName);
      
      const response = { stores };
      dashboardStatsCache.set(cacheKey, { data: response, timestamp: Date.now(), key: cacheKey });
      
      res.json(response);
    } catch (error) {
      console.error("Error fetching rep stores:", error);
      res.status(500).json({ error: "Failed to fetch rep stores" });
    }
  });

  // GET top attention SKUs for store overview
  app.get("/api/top-attention-skus", async (req, res) => {
    try {
      const store = req.query.store as string;
      const rep = req.query.rep as string | undefined;
      const client = req.query.client as string | undefined;
      const article = req.query.article as string | undefined;
      
      if (!store) {
        return res.status(400).json({ error: "Store is required" });
      }
      
      // Check cache first
      const cacheKey = `top_attention_skus_${store}_${rep || 'all'}_${client || 'all'}_${article || 'all'}`;
      const cached = dashboardStatsCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < DASHBOARD_CACHE_TTL_MS) {
        return res.json(cached.data);
      }
      
      // Use store-specific latest week to avoid week mismatch issues
      const latestWeekEnding = await storage.getLatestWeekEndingDateForStore(store, rep);
      
      if (!latestWeekEnding) {
        return res.json({ skus: [] });
      }
      
      // Get tasks filtered at SQL level
      let latestWeekTasks = await storage.getTasksFiltered({
        weekEndingDate: latestWeekEnding,
        store,
        repName: rep,
      });
      
      // Apply client filter if provided
      if (client && client !== 'All Clients') {
        latestWeekTasks = latestWeekTasks.filter(t => t.client === client);
      }
      
      // Apply article filter if provided
      if (article && article !== 'All Articles') {
        latestWeekTasks = latestWeekTasks.filter(t => t.articleDescription === article);
      }
      
      if (latestWeekTasks.length === 0) {
        return res.json({ skus: [] });
      }
      
      // Calculate sales statistics for the store
      const sellOutValues = latestWeekTasks
        .map(t => safeParseFloat(t.p4WeekSales))
        .filter(v => !isNaN(v))
        .sort((a, b) => a - b);
      
      const median = sellOutValues.length > 0 
        ? sellOutValues[Math.floor(sellOutValues.length / 2)] 
        : 0;
      const p75Index = Math.floor(sellOutValues.length * 0.75);
      const p75 = sellOutValues.length > 0 ? sellOutValues[p75Index] : 0;
      
      // Compute attention score for each task
      const scoredTasks = latestWeekTasks.map(task => {
        const actionText = task.action || '';
        
        // Base score from action priority
        let baseScore = 10; // Default for Optimal
        if (actionText.includes('Fix Counts: Negative SOH') || actionText.includes('Negative SOH')) baseScore = 100;
        else if (actionText.includes('Check Count: No Sales in 60')) baseScore = 95;
        else if (actionText.includes('Check Count: No Sales in 15')) baseScore = 92;
        else if (actionText.includes('Check Count: No Sales in 30')) baseScore = 90;
        else if (actionText.includes('Check Count: No Sales')) baseScore = 88;
        else if (actionText.includes('Urgent: DC OOS')) baseScore = 85;
        else if (actionText.includes('Urgent: Place Order')) baseScore = 80;
        else if (actionText.includes('OOS – Stock on Order') || actionText.includes('OOS - Stock on Order')) baseScore = 75;
        else if (actionText.includes('Review: Risk of OOS')) baseScore = 70;
        else if (actionText.includes('Monitor: Possible Overstock')) baseScore = 40;
        
        // Sales score
        const sellOut = safeParseFloat(task.p4WeekSales);
        let salesScore = 0;
        if (sellOut >= p75) salesScore = 30;
        else if (sellOut > median) salesScore = 15;
        
        // Risk score
        const soh = safeParseFloat(task.storeSoh);
        const wfc = task.storeWfc ? safeParseFloat(task.storeWfc) : 999;
        let riskScore = 0;
        if (soh < 0) riskScore += 25;
        else if (soh === 0) riskScore += 20;
        if (wfc <= 1) riskScore += 15;
        else if (wfc <= 2) riskScore += 8;
        
        const attentionScore = baseScore + salesScore + riskScore;
        
        return {
          uniqueId: task.uniqueId,
          action: task.action,
          articleDescription: task.articleDescription,
          barcode: task.barcode,
          client: task.client,
          storeSoh: task.storeSoh,
          p4WeekSales: task.p4WeekSales,
          storeWfc: task.storeWfc,
          attentionScore,
        };
      });
      
      // First try to fill top 5 with highest priority tasks (priorities 1-4)
      const topPriorityTasks = scoredTasks.filter(t => {
        const p = getTaskPriority(t.action);
        return p >= 1 && p <= 4;
      });
      topPriorityTasks.sort((a, b) => b.attentionScore - a.attentionScore);
      
      const seenBarcodes = new Set<string>();
      const topSkus = [];
      for (const task of topPriorityTasks) {
        if (!seenBarcodes.has(task.barcode)) {
          seenBarcodes.add(task.barcode);
          topSkus.push(task);
          if (topSkus.length >= 5) break;
        }
      }
      
      // If fewer than 5, fill remaining slots with No Sales 30d tasks
      if (topSkus.length < 5) {
        const noSales30Tasks = scoredTasks.filter(t => {
          const action = (t.action || '').toLowerCase();
          return action.includes('check count: no sales in 30');
        });
        noSales30Tasks.sort((a, b) => b.attentionScore - a.attentionScore);
        for (const task of noSales30Tasks) {
          if (!seenBarcodes.has(task.barcode)) {
            seenBarcodes.add(task.barcode);
            topSkus.push(task);
            if (topSkus.length >= 5) break;
          }
        }
      }
      
      const response = { skus: topSkus };
      dashboardStatsCache.set(cacheKey, { data: response, timestamp: Date.now(), key: cacheKey });
      
      res.json(response);
    } catch (error) {
      console.error("Error fetching top attention SKUs:", error);
      res.status(500).json({ error: "Failed to fetch top attention SKUs" });
    }
  });

  // GET stores for a specific client
  app.get("/api/clients/:clientName/stores", async (req, res) => {
    try {
      const clientName = decodeURIComponent(req.params.clientName);
      
      // Check cache first
      const cacheKey = `client_stores_${clientName}`;
      const cached = dashboardStatsCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < DASHBOARD_CACHE_TTL_MS) {
        return res.json(cached.data);
      }
      
      // Use SQL DISTINCT for performance
      const stores = await storage.getStoresForClient(clientName);
      
      const response = { stores };
      dashboardStatsCache.set(cacheKey, { data: response, timestamp: Date.now(), key: cacheKey });
      
      res.json(response);
    } catch (error) {
      console.error("Error fetching client stores:", error);
      res.status(500).json({ error: "Failed to fetch client stores" });
    }
  });

  // GET store overview (scoped to rep+store for Store Overview page)
  app.get("/api/store-overview", async (req, res) => {
    try {
      const rep = req.query.rep as string;
      const store = req.query.store as string;
      const client = req.query.client as string | undefined;
      const article = req.query.article as string | undefined;
      
      if (!store) {
        return res.status(400).json({ error: "Store is required" });
      }
      
      // Check cache first
      const cacheKey = `store_overview_${store}_${rep || 'all'}_${client || 'all'}_${article || 'all'}`;
      const cached = dashboardStatsCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < DASHBOARD_CACHE_TTL_MS) {
        return res.json(cached.data);
      }
      
      // Get latest week ending date for THIS SPECIFIC STORE (not global)
      const latestWeekEnding = await storage.getLatestWeekEndingDateForStore(store, rep || undefined);
      
      // Use SQL-level filtering for performance - filter by latest week
      let scopedTasks = await storage.getTasksFiltered({
        store,
        repName: rep || undefined,
        client: (client && client !== 'All Clients') ? client : undefined,
        weekEndingDate: latestWeekEnding || undefined,
      });
      
      // Apply optional article filter
      if (article && article !== 'All Articles') {
        scopedTasks = scopedTasks.filter(t => t.articleDescription === article);
      }
      
      if (scopedTasks.length === 0) {
        return res.json({
          storeName: store,
          region: '',
          repName: rep || '',
          tiles: { totalSKUs: 0, actionRequired: 0, understockOOS: 0, overstock: 0 },
          charts: { storeSoh: [], sellOutP4: [], wfc: [] },
          filters: { clients: [], articles: [] },
          latestWeekEnding: null,
        });
      }
      
      // For latest week, use the filtered tasks directly
      const latestWeekTasks = scopedTasks;
      
      // Count unique SKUs (barcode + article description)
      const getSkuKey = (t: any) => `${t.barcode}|${t.articleDescription}`;
      const uniqueSkus = new Set(latestWeekTasks.map(getSkuKey));
      const totalSKUs = uniqueSkus.size;
      
      // Action Required: Stock Classification != "Optimal"
      const actionRequiredSkus = new Set(
        latestWeekTasks
          .filter(t => t.stockClassification !== 'Optimal')
          .map(getSkuKey)
      );
      const actionRequired = actionRequiredSkus.size;
      
      // Understock/OOS: Understock, OOS, Out of Stock
      const understockOosSkus = new Set(
        latestWeekTasks
          .filter(t => ['Understock', 'OOS', 'Out of Stock'].includes(t.stockClassification || ''))
          .map(getSkuKey)
      );
      const understockOOS = understockOosSkus.size;
      
      // Overstock
      const overstockSkus = new Set(
        latestWeekTasks
          .filter(t => t.stockClassification === 'Overstock')
          .map(getSkuKey)
      );
      const overstock = overstockSkus.size;
      
      // Charts: use efficient SQL aggregate for 12-week history
      const chartAggregates = await storage.getChartAggregates({
        store,
        repName: rep || undefined,
        client: (client && client !== 'All Clients') ? client : undefined,
        article: (article && article !== 'All Articles') ? article : undefined,
        limit: 12,
      });
      
      // Reverse to get chronological order (oldest first)
      const chartDataAsc = [...chartAggregates].reverse();
      
      const storeSohData = chartDataAsc.map(c => ({ weekEnding: c.weekEnding, value: c.storeSohSum }));
      const sellOutP4Data = chartDataAsc.map(c => ({ weekEnding: c.weekEnding, value: c.sellOutP4Sum }));
      const wfcData = chartDataAsc.map(c => ({ weekEnding: c.weekEnding, value: c.wfcAvg }));
      
      // Get filter options (unique clients and articles within scope)
      const clients = [...new Set(scopedTasks.map(t => t.client).filter(Boolean))].sort();
      const articles = [...new Set(scopedTasks.map(t => t.articleDescription).filter(Boolean))].sort();
      
      const response = {
        storeName: store,
        region: latestWeekTasks[0]?.region || '',
        repName: rep,
        latestWeekEnding,
        tiles: { totalSKUs, actionRequired, understockOOS, overstock },
        charts: {
          storeSoh: storeSohData,
          sellOutP4: sellOutP4Data,
          wfc: wfcData,
        },
        filters: { clients, articles },
      };
      
      // Cache the response
      dashboardStatsCache.set(cacheKey, { data: response, timestamp: Date.now(), key: cacheKey });
      
      res.json(response);
    } catch (error) {
      console.error("Error fetching store overview:", error);
      res.status(500).json({ error: "Failed to fetch store overview" });
    }
  });

  // GET SKU trends (historical data for a specific barcode at a specific store)
  app.get("/api/sku-trends", async (req, res) => {
    try {
      const barcode = req.query.barcode as string;
      const store = req.query.store as string;
      
      if (!barcode || !store) {
        return res.status(400).json({ error: "Barcode and store are required" });
      }
      
      // Use SQL-level filtering for performance
      const skuTasks = await storage.getTasksFiltered({ store })
        .then(tasks => tasks.filter(t => t.barcode === barcode));
      
      if (skuTasks.length === 0) {
        return res.json({
          barcode,
          store,
          storeSoh: [],
          sellOut: [],
          wfc: [],
        });
      }
      
      // Get unique week endings sorted ascending (oldest to newest for chart display)
      const weekEndings = [...new Set(skuTasks.map(t => t.weekEndingDate).filter(Boolean))].sort();
      
      // Get last 6 weeks of data for the charts
      const last6Weeks = weekEndings.slice(-6);
      
      // Store SOH per week
      const storeSohData = last6Weeks.map(week => {
        const weekTask = skuTasks.find(t => t.weekEndingDate === week);
        return { 
          weekEnding: week, 
          value: weekTask ? safeParseFloat(weekTask.storeSoh) : 0 
        };
      });
      
      // Sell Out P4 Weeks per week
      const sellOutData = last6Weeks.map(week => {
        const weekTask = skuTasks.find(t => t.weekEndingDate === week);
        return { 
          weekEnding: week, 
          value: weekTask ? safeParseFloat(weekTask.p4WeekSales) : 0 
        };
      });
      
      // WFC per week
      const wfcData = last6Weeks.map(week => {
        const weekTask = skuTasks.find(t => t.weekEndingDate === week);
        return { 
          weekEnding: week, 
          value: weekTask ? safeParseFloat(weekTask.storeWfc) : 0 
        };
      });
      
      res.json({
        barcode,
        store,
        storeSoh: storeSohData,
        sellOut: sellOutData,
        wfc: wfcData,
      });
    } catch (error) {
      console.error("Error fetching SKU trends:", error);
      res.status(500).json({ error: "Failed to fetch SKU trends" });
    }
  });

  // GET store summary
  app.get("/api/stores/:storeName/summary", async (req, res) => {
    try {
      const storeName = decodeURIComponent(req.params.storeName);
      const includeAll = req.query.includeAll === 'true';
      
      // Use SQL-level filtering for performance
      const latestWeek = includeAll ? undefined : await storage.getLatestWeekEndingDate();
      
      const storeTasks = await storage.getTasksFiltered({
        weekEndingDate: latestWeek || undefined,
        store: storeName,
      });
      
      if (storeTasks.length === 0) {
        return res.status(404).json({ error: "Store not found" });
      }

      const pendingTasks = storeTasks.filter(t => t.actionStatus === 'Pending').length;
      const completedTasks = storeTasks.filter(t => t.actionStatus === 'Completed').length;
      
      const totalP4WeekSales = storeTasks.reduce((sum, t) => {
        const sales = safeParseFloat(t.p4WeekSalesUnits || '0');
        return sum + sales;
      }, 0);
      
      const totalSOH = storeTasks.reduce((sum, t) => {
        const soh = safeParseFloat(t.soh || '0');
        return sum + soh;
      }, 0);

      // Group by client with issue breakdown based on actual data:
      // - urgentCount: tasks with action starting with "Urgent:"
      // - oosCount: tasks with stock_classification = "Out of Stock"
      // - noSalesCount: tasks with stock_classification = "No Sales (Idle Stock)"
      // - negativeCount: tasks with stock_classification = "Negative SOH"
      const clientMap: Record<string, { totalIssues: number; urgentCount: number; oosCount: number; noSalesCount: number; negativeCount: number }> = {};
      storeTasks.forEach(t => {
        const client = t.client || 'Unknown';
        if (!clientMap[client]) {
          clientMap[client] = { totalIssues: 0, urgentCount: 0, oosCount: 0, noSalesCount: 0, negativeCount: 0 };
        }
        clientMap[client].totalIssues++;
        
        const action = t.action?.toLowerCase() || '';
        const classification = t.stockClassification || '';
        
        // Urgent = action starts with "Urgent:"
        if (action.startsWith('urgent')) {
          clientMap[client].urgentCount++;
        }
        // Out of Stock
        if (classification === 'Out of Stock') {
          clientMap[client].oosCount++;
        }
        // No Sales (Idle Stock)  
        if (classification === 'No Sales (Idle Stock)') {
          clientMap[client].noSalesCount++;
        }
        // Negative SOH
        if (classification === 'Negative SOH') {
          clientMap[client].negativeCount++;
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

      // Count actions by type
      const actionCounts: Record<string, number> = {};
      storeTasks.forEach(t => {
        const action = t.action || 'Unknown';
        actionCounts[action] = (actionCounts[action] || 0) + 1;
      });
      const actionsByType = Object.entries(actionCounts)
        .map(([action, count]) => ({ action, count }))
        .sort((a, b) => b.count - a.count);

      // Count SKUs OOS (Out of Stock classification)
      const skusOOS = storeTasks.filter(t => 
        t.stockClassification === 'Out of Stock'
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
        skusOOS,
        actionsByType,
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

  // GET latest week ending date
  app.get("/api/tasks/latest-week", async (req, res) => {
    try {
      const latestWeek = await storage.getLatestWeekEndingDate();
      res.json({ latestWeekEndingDate: latestWeek });
    } catch (error) {
      console.error("Error fetching latest week:", error);
      res.status(500).json({ error: "Failed to fetch latest week" });
    }
  });

  // GET task summary with action counts for a specific scope
  app.get("/api/tasks/summary", async (req, res) => {
    try {
      const rep = req.query.rep as string;
      const store = req.query.store as string;
      const client = req.query.client as string | undefined;
      const article = req.query.article as string | undefined;
      
      // Check cache first
      const cacheKey = `tasks_summary_${rep || 'all'}_${store || 'all'}_${client || 'all'}_${article || 'all'}`;
      const cached = dashboardStatsCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < DASHBOARD_CACHE_TTL_MS) {
        return res.json(cached.data);
      }
      
      // Use store-specific latest week to avoid week mismatch issues
      const latestWeekEnding = store 
        ? await storage.getLatestWeekEndingDateForStore(store, rep)
        : await storage.getLatestWeekEndingDate();
      
      let scopedTasks = await storage.getTasksFiltered({
        weekEndingDate: latestWeekEnding || undefined,
        repName: rep || undefined,
        store: store || undefined,
        client: (client && client !== 'All Clients') ? client : undefined,
      });
      
      if (article && article !== 'All Articles') scopedTasks = scopedTasks.filter(t => t.articleDescription === article);
      
      // Count by action type (separate for pending and completed)
      const pendingActionCounts: Record<string, number> = {};
      const completedActionCounts: Record<string, number> = {};
      let pendingCount = 0;
      let pendingCountExcludingOptimal = 0;
      let completedCount = 0;
      
      scopedTasks.forEach(task => {
        const action = task.action || 'Unknown';
        
        if (task.actionStatus === 'Pending') {
          pendingCount++;
          pendingActionCounts[action] = (pendingActionCounts[action] || 0) + 1;
          if (action !== 'Optimal') {
            pendingCountExcludingOptimal++;
          }
        } else {
          completedCount++;
          completedActionCounts[action] = (completedActionCounts[action] || 0) + 1;
        }
      });
      
      // Get unique articles for filter dropdown
      const articles = [...new Set(scopedTasks.map(t => t.articleDescription).filter(Boolean))].sort();
      
      const response = {
        latestWeekEnding,
        totalTasks: scopedTasks.length,
        pendingCount,
        pendingCountExcludingOptimal,
        completedCount,
        pendingActionCounts,
        completedActionCounts,
        articles,
      };
      
      // Cache the response
      dashboardStatsCache.set(cacheKey, { data: response, timestamp: Date.now(), key: cacheKey });
      
      res.json(response);
    } catch (error) {
      console.error("Error fetching task summary:", error);
      res.status(500).json({ error: "Failed to fetch task summary" });
    }
  });

  // GET all tasks with pagination (defaults to latest week only)
  app.get("/api/tasks", async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const search = (req.query.search as string) || '';
      const status = (req.query.status as string) || '';
      const includeAll = req.query.includeAll === 'true';
      
      // Get latest week ending date unless includeAll is true
      let weekEndingDate = '';
      if (!includeAll) {
        const latestWeek = await storage.getLatestWeekEndingDate();
        weekEndingDate = latestWeek || '';
      }
      
      const clientVal = (req.query.client as string) || '';
      const articleVal = (req.query.article as string) || '';
      
      const filters = {
        region: (req.query.region as string) || '',
        rep: (req.query.rep as string) || '',
        store: (req.query.store as string) || '',
        client: clientVal === 'All Clients' ? '' : clientVal,
        issue: (req.query.issue as string) || '',
        category: (req.query.category as string) || '',
        article: articleVal === 'All Articles' ? '' : articleVal,
        weekEndingDate,
      };
      
      // Check cache - only cache if no search term (searches should be fresh)
      const cacheKey = search ? null : `tasks_list_${page}_${limit}_${status}_${Object.values(filters).join('_')}`;
      if (cacheKey) {
        const cached = dashboardStatsCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < DASHBOARD_CACHE_TTL_MS) {
          return res.json(cached.data);
        }
      }
      
      const result = await storage.getTasksPaginated(page, limit, search, status, filters);
      
      // Cache the result if no search term
      if (cacheKey) {
        dashboardStatsCache.set(cacheKey, { data: result, timestamp: Date.now(), key: cacheKey });
      }
      
      res.json(result);
    } catch (error) {
      console.error("Error fetching tasks:", error);
      res.status(500).json({ error: "Failed to fetch tasks" });
    }
  });

  // GET export task count - check before export (lightweight SQL count, this week only)
  app.get("/api/tasks/export/count", async (req, res) => {
    try {
      const latestWeek = await storage.getLatestWeekEndingDate();
      if (!latestWeek) {
        return res.json({ count: 0, weekEndingDate: null });
      }
      const count = await storage.getTaskCountByWeek(latestWeek);
      res.json({ count, weekEndingDate: latestWeek });
    } catch (error) {
      res.status(500).json({ error: "Failed to count tasks" });
    }
  });

  // GET export this week's tasks as CSV (true streaming from DB)
  app.get("/api/tasks/export/csv", async (req, res) => {
    try {
      console.log("Starting CSV export (this week only, streaming from DB)...");
      const latestWeek = await storage.getLatestWeekEndingDate();
      if (!latestWeek) {
        return res.status(404).json({ error: "No tasks found" });
      }
      const totalCount = await storage.getTaskCountByWeek(latestWeek);
      console.log(`Streaming ${totalCount} tasks for week ${latestWeek} as CSV...`);
      
      // Build full URL for images
      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host || '';
      const baseUrl = `${protocol}://${host}`;
      
      const getFullImageUrl = (imagePath: string | null | undefined): string => {
        if (!imagePath) return '';
        const normalized = normalizeObjectUrl(imagePath);
        if (normalized.startsWith('http')) return normalized;
        return `${baseUrl}${normalized}`;
      };
      
      // CSV headers
      const headers = [
        'Unique Id', 'Key', 'client', 'BANNER.1', 'REGION.1', 'cleaned store name',
        'REP NAME', 'LINE MANAGER', 'Category', 'barcode', 'article description',
        'Supplying dc soh', 'Store SOH', 'Sell out p4 weeks', 'Missed Sales (This Week)',
        'WFC', 'Stock Classification (This Week)', 'week ending', 'Action Column',
        'Action Date', 'Action Status', 'physicalCount', 'variance', 'systemAdjusted',
        'reasonCode', 'actionTakenComment', 'feedback', 'captureDate', 'image1', 'image2', 'image3', 'image4'
      ];
      
      // Helper to escape CSV values - handle all special characters
      const escapeCSV = (val: string | number | null | undefined): string => {
        if (val === null || val === undefined) return '';
        const str = String(val);
        // Remove or replace line breaks and carriage returns
        const cleanStr = str.replace(/[\r\n]+/g, ' ').trim();
        // Always quote if contains comma, quote, or any whitespace issues
        if (cleanStr.includes(',') || cleanStr.includes('"') || cleanStr.includes('\t')) {
          return `"${cleanStr.replace(/"/g, '""')}"`;
        }
        return cleanStr;
      };
      
      // Set headers for streaming CSV download
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=stockfix_export.csv');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Transfer-Encoding', 'chunked');
      
      // Write BOM for Excel compatibility
      res.write('\ufeff');
      
      // Write header row
      res.write(headers.join(',') + '\n');
      
      // Stream rows in batches FROM DATABASE to avoid memory buildup (this week only)
      const BATCH_SIZE = 2000;
      let offset = 0;
      let batchCount = 0;
      
      while (offset < totalCount) {
        const batch = await storage.getTasksBatchByWeek(latestWeek, offset, BATCH_SIZE);
        if (batch.length === 0) break;
        
        const lines = batch.map(task => [
          escapeCSV(task.uniqueId),
          escapeCSV(task.key),
          escapeCSV(task.client),
          escapeCSV(task.banner),
          escapeCSV(task.region),
          escapeCSV(task.storeName),
          escapeCSV(task.repName),
          escapeCSV(task.lineManager),
          escapeCSV(task.category),
          escapeCSV(task.barcode),
          escapeCSV(task.articleDescription),
          escapeCSV(task.dcSoh),
          escapeCSV(task.storeSoh),
          escapeCSV(task.p4WeekSales),
          escapeCSV(task.missedSales),
          escapeCSV(task.storeWfc),
          escapeCSV(task.stockClassification),
          escapeCSV(task.weekEndingDate),
          escapeCSV(task.action),
          escapeCSV(task.actionDate),
          escapeCSV(task.actionStatus),
          escapeCSV(task.physicalCount),
          escapeCSV(task.variance),
          escapeCSV(task.systemAdjusted),
          escapeCSV(task.reasonCode),
          escapeCSV(task.actionTakenComment),
          escapeCSV(task.feedback),
          escapeCSV(task.captureDate),
          escapeCSV(getFullImageUrl(task.image1)),
          escapeCSV(getFullImageUrl(task.image2)),
          escapeCSV(getFullImageUrl(task.image3)),
          escapeCSV(getFullImageUrl(task.image4)),
        ].join(','));
        
        res.write(lines.join('\n') + '\n');
        offset += batch.length;
        batchCount++;
        
        if (batchCount % 10 === 0) {
          console.log(`CSV export progress: ${offset}/${totalCount} rows`);
        }
      }
      
      console.log(`CSV export complete: ${offset} rows exported`);
      res.end();
    } catch (error) {
      console.error("Error exporting tasks as CSV:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to export tasks" });
      } else {
        res.end();
      }
    }
  });

  // GET export this week's tasks as Excel - limited to 50k tasks for stability
  app.get("/api/tasks/export", async (req, res) => {
    try {
      console.log("Starting Excel export (this week only)...");
      
      // Get latest week
      const latestWeek = await storage.getLatestWeekEndingDate();
      if (!latestWeek) {
        return res.status(404).json({ error: "No tasks found" });
      }
      
      // Check count FIRST before loading data to avoid memory issues
      const MAX_EXCEL_ROWS = 50000;
      const taskCount = await storage.getTaskCountByWeek(latestWeek);
      console.log(`Task count for week ${latestWeek}: ${taskCount}`);
      
      if (taskCount > MAX_EXCEL_ROWS) {
        return res.status(400).json({ 
          error: `Too many tasks (${taskCount}) for Excel export. Maximum is ${MAX_EXCEL_ROWS}. Please use CSV export for large datasets.`,
          count: taskCount,
          useCSV: true
        });
      }
      
      // Now safe to load this week's tasks into memory
      const allTasks: typeof import("@shared/schema").tasks.$inferSelect[] = [];
      let offset = 0;
      const BATCH_SIZE = 5000;
      while (offset < taskCount) {
        const batch = await storage.getTasksBatchByWeek(latestWeek, offset, BATCH_SIZE);
        if (batch.length === 0) break;
        allTasks.push(...batch);
        offset += batch.length;
      }
      console.log(`Exporting ${allTasks.length} tasks for week ${latestWeek}...`);
      
      // Build full URL for images
      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host || '';
      const baseUrl = `${protocol}://${host}`;
      
      // Helper to make image URL full path with normalization
      const getFullImageUrl = (imagePath: string | null | undefined): string => {
        if (!imagePath) return '';
        const normalized = normalizeObjectUrl(imagePath);
        if (normalized.startsWith('http')) return normalized;
        return `${baseUrl}${normalized}`;
      };
      
      // Transform data to match Excel columns - export ALL tasks
      const exportData = allTasks.map(task => ({
        'Unique Id': task.uniqueId,
        'Key': task.key,
        'client': task.client,
        'BANNER.1': task.banner,
        'REGION.1': task.region,
        'cleaned store name': task.storeName,
        'REP NAME': task.repName,
        'LINE MANAGER': task.lineManager,
        'Category': task.category,
        'barcode': task.barcode,
        'article description': task.articleDescription,
        'Supplying dc soh': task.dcSoh,
        'Store SOH': task.storeSoh,
        'Sell out p4 weeks': task.p4WeekSales,
        'Missed Sales (This Week)': task.missedSales,
        'WFC': task.storeWfc,
        'Stock Classification (This Week)': task.stockClassification,
        'week ending': task.weekEndingDate,
        'Action Column': task.action,
        'Action Date': task.actionDate,
        'Action Status': task.actionStatus,
        'physicalCount': task.physicalCount || '',
        'variance': task.variance || '',
        'systemAdjusted': task.systemAdjusted || '',
        'reasonCode': task.reasonCode || '',
        'actionTakenComment': task.actionTakenComment || '',
        'feedback': task.feedback || '',
        'captureDate': task.captureDate || '',
        'image1': getFullImageUrl(task.image1),
        'image2': getFullImageUrl(task.image2),
        'image3': getFullImageUrl(task.image3),
        'image4': getFullImageUrl(task.image4),
      }));

      console.log("Creating Excel workbook...");
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Tasks');
      
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      console.log(`Export complete. File size: ${buffer.length} bytes`);
      
      // Set headers for download with explicit content length
      res.setHeader('Content-Disposition', 'attachment; filename=stockfix_export.xlsx');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Length', buffer.length);
      res.setHeader('Cache-Control', 'no-cache');
      res.send(buffer);
    } catch (error) {
      console.error("Error exporting tasks:", error);
      res.status(500).json({ error: "Failed to export tasks" });
    }
  });

  // GET export Rep Leaderboard as Excel
  app.get("/api/export/rep-leaderboard", async (req, res) => {
    try {
      // Use SQL-level filtering for current week only
      const latestWeek = await storage.getLatestWeekEndingDate();
      const allTasks = await storage.getTasksFiltered({
        weekEndingDate: latestWeek || undefined,
      });
      
      const repRegionStats: Record<string, { 
        repName: string; 
        lineManager: string;
        region: string;
        total: number;
        open: number; 
        completed: number; 
        completionRate: number;
      }> = {};
      
      allTasks.forEach(task => {
        const rep = task.repName || 'Unknown';
        const region = task.region || 'Unknown';
        const key = `${rep}|${region}`;
        
        if (!repRegionStats[key]) {
          repRegionStats[key] = { 
            repName: rep, 
            lineManager: task.lineManager || '',
            region: region,
            total: 0,
            open: 0, 
            completed: 0,
            completionRate: 0,
          };
        }
        repRegionStats[key].total++;
        if (task.actionStatus === 'Completed') {
          repRegionStats[key].completed++;
        } else {
          repRegionStats[key].open++;
        }
      });

      const exportData = Object.values(repRegionStats).map(rep => {
        const total = rep.open + rep.completed;
        return {
          'Rep Name': rep.repName,
          'Region': rep.region,
          'Line Manager': rep.lineManager,
          'Total Tasks': total,
          'Open Tasks': rep.open,
          'Completed Tasks': rep.completed,
          'Completion Rate (%)': total > 0 ? Math.round((rep.completed / total) * 100) : 0,
        };
      }).sort((a, b) => {
        if (a['Rep Name'] !== b['Rep Name']) {
          return a['Rep Name'].localeCompare(b['Rep Name']);
        }
        return b['Completion Rate (%)'] - a['Completion Rate (%)'];
      });

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Rep Leaderboard');
      
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      
      res.setHeader('Content-Disposition', 'attachment; filename=rep_leaderboard.xlsx');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(buffer);
    } catch (error) {
      console.error("Error exporting rep leaderboard:", error);
      res.status(500).json({ error: "Failed to export rep leaderboard" });
    }
  });

  // GET export Manager Leaderboard as Excel
  app.get("/api/export/manager-leaderboard", async (req, res) => {
    try {
      // Use SQL-level filtering for current week only
      const latestWeek = await storage.getLatestWeekEndingDate();
      const allTasks = await storage.getTasksFiltered({
        weekEndingDate: latestWeek || undefined,
      });
      
      const managerStats: Record<string, { 
        managerName: string; 
        repCount: number;
        total: number;
        open: number; 
        completed: number; 
        completionRate: number;
        reps: Set<string>;
      }> = {};
      
      allTasks.forEach(task => {
        const manager = task.lineManager || 'Unknown';
        if (!managerStats[manager]) {
          managerStats[manager] = { 
            managerName: manager, 
            repCount: 0,
            total: 0,
            open: 0, 
            completed: 0,
            completionRate: 0,
            reps: new Set(),
          };
        }
        managerStats[manager].total++;
        if (task.repName) {
          managerStats[manager].reps.add(task.repName);
        }
        if (task.actionStatus === 'Completed') {
          managerStats[manager].completed++;
        } else {
          managerStats[manager].open++;
        }
      });

      const exportData = Object.values(managerStats).map(mgr => {
        const total = mgr.open + mgr.completed;
        return {
          'Manager Name': mgr.managerName,
          'Number of Reps': mgr.reps.size,
          'Total Tasks': total,
          'Open Tasks': mgr.open,
          'Completed Tasks': mgr.completed,
          'Completion Rate (%)': total > 0 ? Math.round((mgr.completed / total) * 100) : 0,
        };
      }).sort((a, b) => b['Completion Rate (%)'] - a['Completion Rate (%)']);

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Manager Leaderboard');
      
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      
      res.setHeader('Content-Disposition', 'attachment; filename=manager_leaderboard.xlsx');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(buffer);
    } catch (error) {
      console.error("Error exporting manager leaderboard:", error);
      res.status(500).json({ error: "Failed to export manager leaderboard" });
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
        reasonCode: z.string().nullable().optional(),
        actionTakenComment: z.string().nullable().optional(),
        feedback: z.string().nullable().optional(),
        captureDate: z.string().optional(),
        physicalCount: z.string().nullable().optional(),
        variance: z.string().nullable().optional(),
        systemAdjusted: z.string().nullable().optional(),
        image1: z.string().nullable().optional(),
        image2: z.string().nullable().optional(),
      });

      const validated = updateSchema.parse(req.body);
      
      // Auto-set actionDate when feedback is being submitted (status changes to Complete or feedback is added)
      const updates: any = { ...validated };
      if ((validated.actionStatus && validated.actionStatus !== 'Pending') || validated.feedback || validated.reasonCode) {
        if (!task.actionDate) {
          updates.actionDate = new Date().toISOString().split('T')[0];
        }
      }
      
      const updated = await storage.updateTask(task.id, updates);
      
      // Invalidate gamification cache when tasks are updated
      invalidateGamificationCache();
      
      // Send email notification if this is a task completion submission
      // (actionStatus changed to something other than Pending, or feedback/reasonCode provided)
      const isTaskCompletion = 
        (validated.actionStatus && validated.actionStatus !== 'Pending') ||
        validated.feedback ||
        validated.reasonCode;
      
      console.log('[Task Update] isTaskCompletion:', isTaskCompletion, 'validated:', JSON.stringify(validated));
      
      if (isTaskCompletion && updated) {
        console.log('[Task Update] Triggering email notification...');
        // Build base URL from request
        const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
        const host = req.headers['x-forwarded-host'] || req.headers.host || '';
        const baseUrl = `${protocol}://${host}`;
        
        // Fire and forget - don't block the response
        sendTaskCompletedEmail({
          repName: updated.repName,
          client: updated.client,
          storeName: updated.storeName,
          banner: updated.banner,
          region: updated.region,
          weekEndingDate: updated.weekEndingDate,
          category: updated.category,
          barcode: updated.barcode,
          articleDescription: updated.articleDescription,
          stockClassificationThisWeek: updated.stockClassification,
          actionColumn: updated.action,
          actionStatus: updated.actionStatus,
          storeSOH: updated.storeSoh,
          supplyingDcSoh: updated.dcSoh,
          sellOutP4Weeks: updated.p4WeekSales,
          wfc: updated.storeWfc,
          physicalCount: updated.physicalCount,
          variance: updated.variance,
          systemAdjusted: updated.systemAdjusted,
          reasonCode: updated.reasonCode,
          actionTakenComment: updated.actionTakenComment,
          feedback: updated.feedback,
          captureDate: updated.captureDate,
          image1: updated.image1,
          image2: updated.image2,
          baseUrl: baseUrl,
        }).catch(err => {
          console.error('[Email] Error in fire-and-forget email:', err);
        });
      }
      
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating task:", error);
      res.status(500).json({ error: "Failed to update task" });
    }
  });

  // Old local image upload endpoint removed - now using cloud storage via /api/uploads/request-url

  // GET import job status
  app.get("/api/tasks/import/status/:jobId", (req, res) => {
    const job = importJobs.get(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: "Import job not found" });
    }
    res.json(job);
  });

  // POST import Excel/CSV file (async with job tracking for large files)
  app.post("/api/tasks/import", upload.single('file'), handleMulterError, async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }

      // Log file info for debugging
      const fileSizeMB = (req.file.size / (1024 * 1024)).toFixed(2);
      console.log(`Import - File received: ${req.file.originalname}, Size: ${fileSizeMB}MB`);

      // Check file size (150MB limit)
      if (req.file.size > 150 * 1024 * 1024) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ 
          error: `File too large (${fileSizeMB}MB). Maximum size is 150MB.` 
        });
      }

      // Check if we should clear existing tasks first (full refresh)
      const clearExisting = req.query.clear === 'true' || req.body?.clear === 'true';
      
      // Check if this is a dry run (parse and validate only, don't save)
      const isDryRun = req.query.dryRun === 'true' || req.body?.dryRun === 'true';
      
      // All non-dry-run imports use async processing to avoid timeouts
      const useAsync = !isDryRun;
      
      // Store file path for async processing
      const filePath = req.file.path;
      
      // Process in background to avoid HTTP timeout
      if (useAsync) {
        const jobId = generateJobId();
        const job: ImportJob = {
          id: jobId,
          status: 'processing',
          progress: 0,
          totalRows: 0,
          processedRows: 0,
          createdCount: 0,
          skippedCount: 0,
          startedAt: new Date(),
        };
        importJobs.set(jobId, job);
        
        // Return immediately with job ID
        res.json({ 
          success: true, 
          async: true,
          jobId,
          message: `Large file detected (${fileSizeMB}MB). Processing in background. Poll /api/tasks/import/status/${jobId} for progress.`
        });
        
        // Process in background (don't await)
        processImportAsync(filePath, clearExisting, jobId).catch(err => {
          console.error('Async import error:', err);
          const j = importJobs.get(jobId);
          if (j) {
            j.status = 'failed';
            j.error = err.message || 'Unknown error';
            j.completedAt = new Date();
          }
        });
        
        return;
      }
      
      if (clearExisting) {
        console.log("Import - Clearing all existing tasks for full refresh...");
        await storage.deleteAllTasks();
        console.log("Import - All existing tasks cleared");
      }

      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet);

      console.log("Excel import - Total rows:", data.length);
      if (data.length > 0) {
        const headers = Object.keys(data[0] as object);
        console.log("Excel import - Column headers:", headers);
        // Check specifically for LINE MANAGER variations
        const lineManagerHeader = headers.find(h => 
          h.toLowerCase().includes('line') && h.toLowerCase().includes('manager') ||
          h.toLowerCase() === 'linemanager' ||
          h.toLowerCase() === 'line_manager'
        );
        console.log("Excel import - LINE MANAGER column found:", lineManagerHeader || "NOT FOUND");
        if (lineManagerHeader) {
          console.log("Excel import - Sample LINE MANAGER value:", (data[0] as any)[lineManagerHeader]);
        }
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

      // Sanitize barcode - convert scientific notation (e.g. "6.01E+12" or "6,01E+12") to full number string
      const sanitizeBarcode = (val: string): string => {
        if (!val || val === '' || val === '0') return '';
        let cleaned = val.trim().replace(',', '.');
        if (/[eE]\+/.test(cleaned)) {
          const num = Number(cleaned);
          if (!isNaN(num)) return num.toFixed(0);
        }
        cleaned = cleaned.replace(/\.0+$/, '');
        return cleaned;
      };

      // Sanitize numeric values - handle comma decimal separators (e.g. "1,901975" -> "1.901975")
      const sanitizeNumeric = (val: string): string => {
        if (!val || val === '' || val === '0') return '0';
        let cleaned = val.trim();
        const hasDot = cleaned.includes('.');
        const hasComma = cleaned.includes(',');
        if (hasDot && hasComma) {
          const lastDot = cleaned.lastIndexOf('.');
          const lastComma = cleaned.lastIndexOf(',');
          if (lastComma > lastDot) {
            cleaned = cleaned.replace(/\./g, '').replace(',', '.');
          } else {
            cleaned = cleaned.replace(/,/g, '');
          }
        } else if (hasComma) {
          cleaned = cleaned.replace(',', '.');
        }
        return cleaned;
      };

      // Helper to parse date string to ISO format (YYYY-MM-DD)
      const parseToISODate = (dateVal: any): string => {
        if (!dateVal) return new Date().toISOString().split('T')[0];
        try {
          // Handle Excel serial numbers (numbers like 46057)
          if (typeof dateVal === 'number' || !isNaN(Number(dateVal))) {
            const num = Number(dateVal);
            // Excel serial numbers are typically between 1 and 100000
            if (num > 1 && num < 100000) {
              // Excel date: days since Dec 30, 1899
              const excelEpoch = new Date(1899, 11, 30);
              const resultDate = new Date(excelEpoch.getTime() + num * 24 * 60 * 60 * 1000);
              return resultDate.toISOString().split('T')[0];
            }
          }
          // Try parsing as date string
          const parsed = new Date(String(dateVal));
          if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 2000 && parsed.getFullYear() < 2100) {
            return parsed.toISOString().split('T')[0];
          }
        } catch (e) {}
        return new Date().toISOString().split('T')[0];
      };

      // Map CSV/Excel columns to our schema with flexible matching
      const mappedTasks = data.map((row: any, index: number) => {
        // Generate unique ID from store + barcode + week ending
        const storeVal = getValue(row, 'cleaned store name', 'STORE NAME', 'Store Name', 'StoreName', 'store_name', 'Store');
        const barcodeVal = sanitizeBarcode(getValue(row, 'barcode', 'Barcode', 'BARCODE', 'SKU', 'sku'));
        const weekEndingVal = getValue(row, 'week ending', 'Week Ending', 'WeekEnding', 'week_ending', 'Date');
        const weekEndingISO = parseToISODate(weekEndingVal);
        
        const task = {
          uniqueId: `${storeVal}-${barcodeVal}-${weekEndingISO}`.replace(/[^a-zA-Z0-9-]/g, '') || `task-${Date.now()}-${index}`,
          key: `${storeVal}-${barcodeVal}`.substring(0, 100) || `key-${index}`,
          client: getValue(row, 'client', 'Client', 'CLIENT') || 'Unknown',
          banner: getValue(row, 'BANNER.1', 'BANNER', 'Banner', 'banner') || '',
          region: getValue(row, 'REGION.1', 'REGION', 'Region', 'region') || '',
          storeName: storeVal || 'Unknown Store',
          repName: getValue(row, 'REP NAME', 'Rep Name', 'RepName', 'rep_name', 'Rep') || '',
          lineManager: getValue(row, 'LINE MANAGER', 'Line Manager', 'LineManager', 'line_manager') || '',
          category: getValue(row, 'Category', 'CATEGORY', 'category') || '',
          barcode: barcodeVal || '',
          articleDescription: getValue(row, 'article description', 'Article Description', 'ArticleDescription', 'Description', 'Product', 'Product Name') || 'No Description',
          dcSoh: sanitizeNumeric(getValue(row, 'Supplying dc soh', 'DC SOH', 'DC_SOH', 'DCSOH', 'dc_soh', 'Supplying DC SOH')),
          storeSoh: sanitizeNumeric(getValue(row, 'Store SOH', 'STORE_SOH', 'StoreSoh', 'store_soh', 'store soh')),
          p4WeekSales: sanitizeNumeric(getValue(row, 'Sell out p4 weeks', 'P4 week Sales', 'P4WeekSales', 'p4_week_sales', 'P4 Sales', 'Sell out P4 weeks', 'sell out p4 weeks')),
          missedSales: sanitizeNumeric(getValue(row, 'Missed Sales (This Week)', 'Missed Sales', 'MissedSales', 'missed_sales')),
          storeWfc: sanitizeNumeric(getValue(row, 'WFC', ' WFC', 'Store WFC (This Week)', 'Store WFC', 'StoreWfc', 'store_wfc')),
          stockClassification: getValue(row, 'Stock Classification (This Week)', 'Stock Classification', 'StockClassification', 'stock_classification') || '',
          weekEnding: weekEndingVal || new Date().toISOString().split('T')[0],
          weekEndingDate: weekEndingISO,
          action: getValue(row, 'Action Column', 'Action', 'ACTION', 'action', 'Task', 'Required Action') || 'Review stock',
          actionDate: null,
          actionStatus: getValue(row, 'Action Status', 'ActionStatus', 'action_status', 'Status') || 'Pending',
          systemImage: getValue(row, 'System Image', 'SystemImage', 'system_image', 'Image') || '',
        };
        return task;
      });

      console.log("Excel import - Mapped tasks:", mappedTasks.length);
      if (mappedTasks.length > 0) {
        console.log("Excel import - Sample task lineManager:", mappedTasks[0].lineManager);
        console.log("Excel import - Sample task repName:", mappedTasks[0].repName);
        // Count how many have lineManager populated
        const withManager = mappedTasks.filter((t: any) => t.lineManager && t.lineManager.trim() !== '').length;
        console.log("Excel import - Tasks with LINE MANAGER populated:", withManager, "out of", mappedTasks.length);
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
      
      // DRY RUN: Return parsed data summary without saving to database
      if (isDryRun) {
        fs.unlinkSync(req.file.path);
        
        const actionCounts: Record<string, number> = {};
        const regionCounts: Record<string, number> = {};
        const storeCounts: Record<string, number> = {};
        const clientCounts: Record<string, number> = {};
        const repCounts: Record<string, number> = {};
        
        validatedTasks.forEach((task: any) => {
          actionCounts[task.action] = (actionCounts[task.action] || 0) + 1;
          if (task.region) regionCounts[task.region] = (regionCounts[task.region] || 0) + 1;
          if (task.storeName) storeCounts[task.storeName] = (storeCounts[task.storeName] || 0) + 1;
          if (task.client) clientCounts[task.client] = (clientCounts[task.client] || 0) + 1;
          if (task.repName) repCounts[task.repName] = (repCounts[task.repName] || 0) + 1;
        });
        
        const sampleTasks = validatedTasks.slice(0, 5).map((t: any) => ({
          uniqueId: t.uniqueId,
          storeName: t.storeName,
          barcode: t.barcode,
          articleDescription: t.articleDescription,
          action: t.action,
          repName: t.repName,
          region: t.region,
          weekEndingDate: t.weekEndingDate,
          storeSoh: t.storeSoh,
          stockClassification: t.stockClassification,
        }));
        
        return res.json({
          success: true,
          dryRun: true,
          message: `DRY RUN: ${validatedTasks.length} tasks parsed and validated (nothing saved)`,
          summary: {
            totalRowsInFile: data.length,
            validTasksWithBarcode: validTasks.length,
            skippedNoBarcode: mappedTasks.length - validTasks.length,
            uniqueStores: Object.keys(storeCounts).length,
            uniqueReps: Object.keys(repCounts).length,
            uniqueRegions: Object.keys(regionCounts).length,
            actionBreakdown: actionCounts,
            regionBreakdown: regionCounts,
            clientBreakdown: clientCounts,
            weekEndingDates: [...new Set(validatedTasks.map((t: any) => t.weekEndingDate))],
          },
          sampleTasks,
          detectedHeaders: data.length > 0 ? Object.keys(data[0] as object) : [],
        });
      }
      
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

      // Invalidate gamification cache after import
      invalidateGamificationCache();

      // Clean up uploaded file
      fs.unlinkSync(req.file.path);

      // Get headers for diagnostics
      const detectedHeaders = data.length > 0 ? Object.keys(data[0] as object) : [];
      const lineManagerHeader = detectedHeaders.find(h => 
        h.toLowerCase().includes('line') && h.toLowerCase().includes('manager') ||
        h.toLowerCase() === 'linemanager' ||
        h.toLowerCase() === 'line_manager'
      );
      const sampleLineManager = lineManagerHeader && data.length > 0 ? (data[0] as any)[lineManagerHeader] : null;
      const mappedSampleLineManager = mappedTasks.length > 0 ? mappedTasks[0].lineManager : 'N/A';
      const tasksWithManager = mappedTasks.filter((t: any) => t.lineManager && t.lineManager.trim() !== '').length;
      
      res.json({ 
        success: true, 
        count: totalCreated,
        message: `Successfully imported ${totalCreated} tasks`,
        diagnostics: {
          totalRows: data.length,
          headers: detectedHeaders,
          lineManagerColumn: lineManagerHeader || 'NOT FOUND',
          sampleLineManager: sampleLineManager || 'N/A',
          mappedLineManager: mappedSampleLineManager,
          tasksWithManager: tasksWithManager
        }
      });
    } catch (error) {
      console.error("Error importing tasks:", error);
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({ error: "Failed to import tasks: " + (error instanceof Error ? error.message : 'Unknown error') });
    }
  });

  // GET Rep Task Progress - shows progress for a specific rep across all stores (this week only)
  app.get("/api/task-progress/rep", async (req, res) => {
    try {
      const repName = req.query.repName as string;
      const store = req.query.store as string | undefined;
      const client = req.query.client as string | undefined;
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;

      if (!repName) {
        return res.status(400).json({ error: "repName is required" });
      }

      // Get latest week and use SQL-level filtering (MUCH faster than getAllTasks)
      const latestWeek = await storage.getLatestWeekEndingDate();
      
      // Get tasks filtered at SQL level
      const repTasks = await storage.getTasksFiltered({
        weekEndingDate: latestWeek || undefined,
        repName,
        store,
        client,
      });

      const openTasks = repTasks.filter(t => t.actionStatus !== 'Completed');
      let completedTasks = repTasks.filter(t => t.actionStatus === 'Completed');

      // Apply date range filter for completed tasks
      if (dateFrom || dateTo) {
        completedTasks = completedTasks.filter(t => {
          if (!t.captureDate) return false;
          const captureDate = new Date(t.captureDate);
          if (dateFrom && captureDate < new Date(dateFrom)) return false;
          if (dateTo && captureDate > new Date(dateTo + 'T23:59:59')) return false;
          return true;
        });
      }

      // Calculate KPIs
      const openCount = openTasks.length;
      const completedCount = completedTasks.length;
      const total = openCount + completedCount;
      const completionRate = total > 0 ? Math.round((completedCount / total) * 100) : 0;

      // Calculate oldest open task days
      let oldestOpenDays = 0;
      if (openTasks.length > 0) {
        const today = new Date();
        const oldestTask = openTasks.reduce((oldest, task) => {
          const taskDate = new Date(task.createdAt);
          return taskDate < new Date(oldest.createdAt) ? task : oldest;
        });
        const diffTime = today.getTime() - new Date(oldestTask.createdAt).getTime();
        oldestOpenDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      }

      // Chart data: Tasks by week
      const weeklyData: Record<string, { week: string; open: number; completed: number }> = {};
      repTasks.forEach(task => {
        const week = task.weekEndingDate || 'Unknown';
        if (!weeklyData[week]) {
          weeklyData[week] = { week, open: 0, completed: 0 };
        }
        if (task.actionStatus === 'Completed') {
          weeklyData[week].completed++;
        } else {
          weeklyData[week].open++;
        }
      });
      const tasksOverTime = Object.values(weeklyData).sort((a, b) => a.week.localeCompare(b.week));

      // Chart data: Open tasks by store
      const storeData: Record<string, number> = {};
      openTasks.forEach(task => {
        storeData[task.storeName] = (storeData[task.storeName] || 0) + 1;
      });
      const openByStore = Object.entries(storeData)
        .map(([store, count]) => ({ store, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Get unique stores and clients for filters
      const stores = [...new Set(repTasks.map(t => t.storeName))].sort();
      const clients = [...new Set(repTasks.map(t => t.client))].sort();

      // Priority task metrics (what reps should focus on)
      const priorityOpenTasks = openTasks.filter(t => isPriorityTask(t.action));
      const priorityCompletedTasks = completedTasks.filter(t => isPriorityTask(t.action));
      const priorityTotal = priorityOpenTasks.length + priorityCompletedTasks.length;
      const priorityCompletionRate = priorityTotal > 0 
        ? Math.round((priorityCompletedTasks.length / priorityTotal) * 100) 
        : 0;

      // Sort tasks by priority (priority tasks first)
      const sortedOpenTasks = sortByPriority(openTasks);
      const sortedCompletedTasks = sortByPriority(completedTasks);

      // Pagination for task lists - limit to 50 per page for mobile performance
      const taskLimit = parseInt(req.query.limit as string) || 50;
      const openPage = parseInt(req.query.openPage as string) || 1;
      const completedPage = parseInt(req.query.completedPage as string) || 1;

      const paginatedOpenTasks = sortedOpenTasks.slice((openPage - 1) * taskLimit, openPage * taskLimit);
      const paginatedCompletedTasks = sortedCompletedTasks.slice((completedPage - 1) * taskLimit, completedPage * taskLimit);

      res.json({
        kpis: {
          openCount,
          completedCount,
          completionRate,
          oldestOpenDays,
          // Priority task metrics
          priorityOpenCount: priorityOpenTasks.length,
          priorityCompletedCount: priorityCompletedTasks.length,
          priorityCompletionRate,
        },
        charts: {
          tasksOverTime,
          openByStore
        },
        tasks: {
          open: paginatedOpenTasks.map(t => ({
            uniqueId: t.uniqueId,
            articleDescription: t.articleDescription,
            storeName: t.storeName,
            client: t.client,
            storeWfc: t.storeWfc,
            createdAt: t.createdAt,
            age: Math.floor((new Date().getTime() - new Date(t.createdAt).getTime()) / (1000 * 60 * 60 * 24)),
            actionStatus: t.actionStatus,
            stockClassification: t.stockClassification,
            action: t.action,
            isPriority: isPriorityTask(t.action),
            priority: getTaskPriority(t.action),
          })),
          completed: paginatedCompletedTasks.map(t => ({
            uniqueId: t.uniqueId,
            articleDescription: t.articleDescription,
            storeName: t.storeName,
            client: t.client,
            storeWfc: t.storeWfc,
            createdAt: t.createdAt,
            captureDate: t.captureDate,
            actionStatus: t.actionStatus,
            stockClassification: t.stockClassification,
            action: t.action,
            isPriority: isPriorityTask(t.action),
            priority: getTaskPriority(t.action),
          })),
          openTotalPages: Math.ceil(openCount / taskLimit),
          completedTotalPages: Math.ceil(completedCount / taskLimit),
          openPage,
          completedPage,
          limit: taskLimit
        },
        filters: {
          stores,
          clients
        }
      });
    } catch (error) {
      console.error("Error fetching rep task progress:", error);
      res.status(500).json({ error: "Failed to fetch rep task progress" });
    }
  });

  // GET list of managers (line managers)
  app.get("/api/managers", async (req, res) => {
    try {
      // Use SQL-level filtering for current week only
      const latestWeek = await storage.getLatestWeekEndingDate();
      const allTasks = await storage.getTasksFiltered({
        weekEndingDate: latestWeek || undefined,
      });
      const managers = [...new Set(allTasks.map(t => t.lineManager).filter(Boolean))].sort();
      res.json({ managers });
    } catch (error) {
      console.error("Error fetching managers:", error);
      res.status(500).json({ error: "Failed to fetch managers" });
    }
  });

  // GET Clients list
  app.get("/api/clients", async (req, res) => {
    try {
      const filters = await storage.getDistinctFilters();
      res.json(filters.clients);
    } catch (error) {
      console.error("Error fetching clients:", error);
      res.status(500).json({ error: "Failed to fetch clients" });
    }
  });

  app.get("/api/stores-for-manager", async (req, res) => {
    try {
      const manager = req.query.manager as string | undefined;
      if (!manager) {
        return res.json([]);
      }
      const cacheKey = `stores_for_manager_${manager}`;
      const cached = dashboardStatsCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < DASHBOARD_CACHE_TTL_MS) {
        return res.json(cached.data);
      }
      const latestWeek = await storage.getLatestWeekEndingDate();
      const teamTasks = await storage.getTasksFiltered({
        weekEndingDate: latestWeek || undefined,
        lineManager: manager,
      });
      const storeSet = new Set<string>();
      teamTasks.forEach(t => {
        if (t.storeName) storeSet.add(t.storeName);
      });
      const stores = Array.from(storeSet).sort();
      dashboardStatsCache.set(cacheKey, { data: stores, timestamp: Date.now(), key: cacheKey });
      res.json(stores);
    } catch (error) {
      console.error("Error fetching stores for manager:", error);
      res.status(500).json({ error: "Failed to fetch stores" });
    }
  });

  // GET Gamification Leaderboard (this week only) - with caching
  app.get("/api/gamification/leaderboard", async (req, res) => {
    try {
      const manager = req.query.manager as string | undefined;
      const limit = parseInt(req.query.limit as string) || 10;
      const cacheKey = `leaderboard_${manager || 'all'}`;
      
      let cachedData = getCachedGamificationStats(cacheKey);
      let allStats: RepGamificationStats[];
      let latestWeek: string | null;
      
      if (cachedData) {
        allStats = cachedData.stats;
        latestWeek = cachedData.weekEndingDate;
      } else {
        latestWeek = await storage.getLatestWeekEndingDate();
        if (!latestWeek) {
          return res.json({ leaderboard: [], teamStats: {}, totalReps: 0, weekEndingDate: null });
        }
        
        const [repStatsRaw, streaks] = await Promise.all([
          storage.getLeaderboardAggregated(latestWeek),
          storage.getRepStreaks(),
        ]);
        
        let filteredStats = repStatsRaw;
        if (manager) {
          filteredStats = repStatsRaw.filter(r => r.lineManager === manager);
        }
        
        allStats = filteredStats.map(rep => {
          const completionRate = rep.totalTasks > 0 ? Math.round((rep.completedTasks / rep.totalTasks) * 100) : 0;
          const priorityCompletionRate = rep.priorityTotalTasks > 0 ? Math.round((rep.priorityCompletedTasks / rep.priorityTotalTasks) * 100) : 0;
          return {
            repName: rep.repName,
            lineManager: rep.lineManager,
            region: rep.region,
            totalTasks: rep.totalTasks,
            completedTasks: rep.completedTasks,
            openTasks: rep.totalTasks - rep.completedTasks,
            completionRate,
            priorityTotalTasks: rep.priorityTotalTasks,
            priorityCompletedTasks: rep.priorityCompletedTasks,
            priorityOpenTasks: rep.priorityTotalTasks - rep.priorityCompletedTasks,
            priorityCompletionRate,
            badge: calculateBadge(priorityCompletionRate),
            streak: streaks[rep.repName] || 0,
            storesMastered: rep.storesMastered,
            rank: 0,
            rankChange: 'same' as const,
            isTopPerformer: false,
          };
        }).sort((a, b) => b.priorityCompletionRate - a.priorityCompletionRate);
        
        allStats.forEach((rep, index) => {
          rep.rank = index + 1;
          rep.isTopPerformer = index < 3;
        });
        
        setCachedGamificationStats(cacheKey, { stats: allStats, weekEndingDate: latestWeek });
      }
      
      const leaderboard = getLeaderboard(allStats, limit);
      const teamStats = getTeamStats(allStats);
      
      res.json({
        leaderboard,
        teamStats,
        totalReps: allStats.length,
        weekEndingDate: latestWeek,
      });
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
      res.status(500).json({ error: "Failed to fetch leaderboard" });
    }
  });

  // GET Individual Rep Gamification Stats (this week only) - with caching
  app.get("/api/gamification/rep/:repName", async (req, res) => {
    try {
      const repName = decodeURIComponent(req.params.repName);
      const cacheKey = 'leaderboard_all';
      
      let cachedData = getCachedGamificationStats(cacheKey);
      let allStats: RepGamificationStats[];
      let latestWeek: string | null;
      
      if (cachedData) {
        allStats = cachedData.stats;
        latestWeek = cachedData.weekEndingDate;
      } else {
        latestWeek = await storage.getLatestWeekEndingDate();
        if (!latestWeek) {
          return res.json({ found: false, repName, weekEndingDate: null });
        }
        const [repStatsRaw, streaksData] = await Promise.all([
          storage.getLeaderboardAggregated(latestWeek),
          storage.getRepStreaks(),
        ]);
        allStats = repStatsRaw.map(rep => {
          const completionRate = rep.totalTasks > 0 ? Math.round((rep.completedTasks / rep.totalTasks) * 100) : 0;
          const priorityCompletionRate = rep.priorityTotalTasks > 0 ? Math.round((rep.priorityCompletedTasks / rep.priorityTotalTasks) * 100) : 0;
          return {
            repName: rep.repName, lineManager: rep.lineManager, region: rep.region,
            totalTasks: rep.totalTasks, completedTasks: rep.completedTasks, openTasks: rep.totalTasks - rep.completedTasks,
            completionRate, priorityTotalTasks: rep.priorityTotalTasks, priorityCompletedTasks: rep.priorityCompletedTasks,
            priorityOpenTasks: rep.priorityTotalTasks - rep.priorityCompletedTasks, priorityCompletionRate,
            badge: calculateBadge(priorityCompletionRate), streak: streaksData[rep.repName] || 0, storesMastered: rep.storesMastered,
            rank: 0, rankChange: 'same' as const, isTopPerformer: false,
          };
        }).sort((a, b) => b.priorityCompletionRate - a.priorityCompletionRate);
        allStats.forEach((rep, index) => { rep.rank = index + 1; rep.isTopPerformer = index < 3; });
        setCachedGamificationStats(cacheKey, { stats: allStats, weekEndingDate: latestWeek });
      }
      
      const repStats = allStats.find(s => s.repName === repName);
      
      if (!repStats) {
        return res.json({ 
          found: false,
          repName,
          weekEndingDate: latestWeek,
        });
      }
      
      // Find rep's rank
      const sortedByCompletion = [...allStats].sort((a, b) => b.completionRate - a.completionRate);
      const rank = sortedByCompletion.findIndex(s => s.repName === repName) + 1;
      
      // Team averages for comparison
      const teamAvgCompletion = allStats.length > 0 
        ? Math.round(allStats.reduce((sum, s) => sum + s.completionRate, 0) / allStats.length)
        : 0;
      
      res.json({
        found: true,
        repName,
        weekEndingDate: latestWeek,
        stats: {
          ...repStats,
          rank,
          totalReps: allStats.length,
          teamAvgCompletion,
          aheadOfTeamBy: repStats.completionRate - teamAvgCompletion,
        }
      });
    } catch (error) {
      console.error("Error fetching rep gamification stats:", error);
      res.status(500).json({ error: "Failed to fetch rep stats" });
    }
  });

  // GET Admin Leaderboard - comprehensive stats by region, rep, manager (hidden admin page)
  app.get("/api/admin/leaderboard", async (req, res) => {
    try {
      const period = req.query.period as string || 'week';
      const clientFilter = req.query.client as string || '';
      
      const latestWeek = await storage.getLatestWeekEndingDate();
      if (!latestWeek) {
        return res.json({ weekEndingDate: null, period, overall: {}, regionLeaderboard: [], managerLeaderboard: [], repLeaderboard: [], clientLeaderboard: [] });
      }
      
      console.log(`[Admin Leaderboard] period=${period}, latestWeek=${latestWeek}, clientFilter=${clientFilter}`);
      
      const [repStatsRaw, clientStatsRawAll, adminStreaks, actionBreakdownRaw] = await Promise.all([
        storage.getLeaderboardAggregated(latestWeek, clientFilter || undefined),
        storage.getClientStatsAggregated(latestWeek),
        storage.getRepStreaks(),
        storage.getActionTypeBreakdown(latestWeek, clientFilter || undefined),
      ]);
      
      const clientStatsRaw = clientFilter 
        ? clientStatsRawAll.filter(c => c.client === clientFilter)
        : clientStatsRawAll;
      
      console.log(`[Admin Leaderboard] Got ${repStatsRaw.length} rep stats via SQL aggregation`);
      
      const repLeaderboard = repStatsRaw.map((rep, _idx) => {
        const completionRate = rep.totalTasks > 0 ? Math.round((rep.completedTasks / rep.totalTasks) * 100) : 0;
        const priorityCompletionRate = rep.priorityTotalTasks > 0 ? Math.round((rep.priorityCompletedTasks / rep.priorityTotalTasks) * 100) : 0;
        const badge = priorityCompletionRate >= 100 ? { type: 'gold' as const, label: 'Gold', color: '#FFD700', emoji: '🥇' }
          : priorityCompletionRate >= 90 ? { type: 'silver' as const, label: 'Silver', color: '#C0C0C0', emoji: '🥈' }
          : priorityCompletionRate >= 80 ? { type: 'bronze' as const, label: 'Bronze', color: '#CD7F32', emoji: '🥉' }
          : { type: 'none' as const, label: '', color: '', emoji: '' };
        return {
          repName: rep.repName,
          lineManager: rep.lineManager,
          region: rep.region,
          totalTasks: rep.totalTasks,
          completedTasks: rep.completedTasks,
          openTasks: rep.totalTasks - rep.completedTasks,
          completionRate,
          priorityTotalTasks: rep.priorityTotalTasks,
          priorityCompletedTasks: rep.priorityCompletedTasks,
          priorityOpenTasks: rep.priorityTotalTasks - rep.priorityCompletedTasks,
          priorityCompletionRate,
          badge,
          streak: adminStreaks[rep.repName] || 0,
          storesMastered: rep.storesMastered,
          rank: 0,
          rankChange: 'same' as const,
          isTopPerformer: false,
        };
      }).sort((a, b) => b.priorityCompletionRate - a.priorityCompletionRate);
      
      repLeaderboard.forEach((rep, index) => {
        rep.rank = index + 1;
        rep.isTopPerformer = index < 3;
      });
      
      const regionStats: Record<string, { region: string; totalTasks: number; completedTasks: number; completionRate: number; priorityTasks: number; priorityCompleted: number; priorityRate: number; repCount: number }> = {};
      const managerStats: Record<string, { manager: string; region: string; totalTasks: number; completedTasks: number; completionRate: number; priorityTasks: number; priorityCompleted: number; priorityRate: number; repCount: number; goldBadges: number; silverBadges: number; bronzeBadges: number }> = {};
      
      repLeaderboard.forEach(rep => {
        const region = rep.region || 'Unknown';
        if (!regionStats[region]) regionStats[region] = { region, totalTasks: 0, completedTasks: 0, completionRate: 0, priorityTasks: 0, priorityCompleted: 0, priorityRate: 0, repCount: 0 };
        regionStats[region].totalTasks += rep.totalTasks;
        regionStats[region].completedTasks += rep.completedTasks;
        regionStats[region].priorityTasks += rep.priorityTotalTasks;
        regionStats[region].priorityCompleted += rep.priorityCompletedTasks;
        regionStats[region].repCount++;
        
        const manager = rep.lineManager || 'Unknown';
        if (!managerStats[manager]) managerStats[manager] = { manager, region: rep.region || '', totalTasks: 0, completedTasks: 0, completionRate: 0, priorityTasks: 0, priorityCompleted: 0, priorityRate: 0, repCount: 0, goldBadges: 0, silverBadges: 0, bronzeBadges: 0 };
        managerStats[manager].totalTasks += rep.totalTasks;
        managerStats[manager].completedTasks += rep.completedTasks;
        managerStats[manager].priorityTasks += rep.priorityTotalTasks;
        managerStats[manager].priorityCompleted += rep.priorityCompletedTasks;
        managerStats[manager].repCount++;
        if (rep.badge.type === 'gold') managerStats[manager].goldBadges++;
        else if (rep.badge.type === 'silver') managerStats[manager].silverBadges++;
        else if (rep.badge.type === 'bronze') managerStats[manager].bronzeBadges++;
      });
      
      Object.values(regionStats).forEach(r => {
        r.completionRate = r.totalTasks > 0 ? Math.round((r.completedTasks / r.totalTasks) * 100) : 0;
        r.priorityRate = r.priorityTasks > 0 ? Math.round((r.priorityCompleted / r.priorityTasks) * 100) : 0;
      });
      Object.values(managerStats).forEach(m => {
        m.completionRate = m.totalTasks > 0 ? Math.round((m.completedTasks / m.totalTasks) * 100) : 0;
        m.priorityRate = m.priorityTasks > 0 ? Math.round((m.priorityCompleted / m.priorityTasks) * 100) : 0;
      });
      
      const managerLeaderboard = Object.values(managerStats).sort((a, b) => b.priorityRate - a.priorityRate);
      const regionLeaderboard = Object.values(regionStats).sort((a, b) => b.priorityRate - a.priorityRate);
      
      const clientLeaderboard = clientStatsRaw.map(c => ({
        client: c.client,
        totalTasks: c.totalTasks,
        completedTasks: c.completedTasks,
        completionRate: c.totalTasks > 0 ? Math.round((c.completedTasks / c.totalTasks) * 100) : 0,
      })).sort((a, b) => b.completionRate - a.completionRate);
      
      const totalTasks = repLeaderboard.reduce((sum, r) => sum + r.totalTasks, 0);
      const totalCompleted = repLeaderboard.reduce((sum, r) => sum + r.completedTasks, 0);
      const priorityTotal = repLeaderboard.reduce((sum, r) => sum + r.priorityTotalTasks, 0);
      const priorityCompleted = repLeaderboard.reduce((sum, r) => sum + r.priorityCompletedTasks, 0);
      
      res.json({
        weekEndingDate: latestWeek,
        period,
        overall: {
          totalTasks,
          totalCompleted,
          completionRate: totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0,
          priorityTotal,
          priorityCompleted,
          priorityRate: priorityTotal > 0 ? Math.round((priorityCompleted / priorityTotal) * 100) : 0,
          totalReps: repLeaderboard.length,
          totalManagers: Object.keys(managerStats).length,
          totalRegions: Object.keys(regionStats).length,
        },
        regionLeaderboard,
        managerLeaderboard,
        repLeaderboard,
        clientLeaderboard,
        actionBreakdown: actionBreakdownRaw,
      });
    } catch (error) {
      console.error("Error fetching admin leaderboard:", error);
      res.status(500).json({ error: "Failed to fetch admin leaderboard" });
    }
  });

  // GET Admin diagnostic - check task distribution by week/client
  app.get("/api/admin/task-distribution", async (req, res) => {
    try {
      const client = req.query.client as string || '';
      
      // Get task count by week for specified client (or all clients)
      let query;
      if (client) {
        query = sql`
          SELECT week_ending_date, client, COUNT(*) as task_count
          FROM tasks
          WHERE client = ${client}
          GROUP BY week_ending_date, client
          ORDER BY week_ending_date DESC
        `;
      } else {
        query = sql`
          SELECT week_ending_date, client, COUNT(*) as task_count
          FROM tasks
          GROUP BY week_ending_date, client
          ORDER BY week_ending_date DESC, task_count DESC
        `;
      }
      
      const result = await db.execute(query);
      const mostPopulatedWeek = await storage.getMostPopulatedWeekEndingDate();
      
      res.json({
        mostPopulatedWeek,
        distribution: result.rows
      });
    } catch (error) {
      console.error("Error fetching task distribution:", error);
      res.status(500).json({ error: "Failed to fetch task distribution" });
    }
  });

  // GET Manager Task Progress - shows team-wide progress across all reps (this week only)
  app.get("/api/task-progress/manager", async (req, res) => {
    try {
      const region = req.query.region as string | undefined;
      const client = req.query.client as string | undefined;
      const store = req.query.store as string | undefined;
      const manager = req.query.manager as string | undefined;
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;

      // Check cache first (only if no date filters)
      const cacheKey = `manager_progress_${manager || 'all'}_${region || 'all'}_${client || 'all'}_${store || 'all'}`;
      if (!dateFrom && !dateTo) {
        const cached = dashboardStatsCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < DASHBOARD_CACHE_TTL_MS) {
          return res.json(cached.data);
        }
      }

      // Use SQL-level filtering instead of loading all 30k+ tasks
      const latestWeek = await storage.getLatestWeekEndingDate();
      
      // Get tasks filtered at SQL level (MUCH faster)
      const teamTasks = await storage.getTasksFiltered({
        weekEndingDate: latestWeek || undefined,
        lineManager: manager,
        region,
        client,
        store,
      });

      const openTasks = teamTasks.filter(t => t.actionStatus !== 'Completed');
      let completedTasks = teamTasks.filter(t => t.actionStatus === 'Completed');

      // Apply date range filter for completed tasks
      if (dateFrom || dateTo) {
        completedTasks = completedTasks.filter(t => {
          if (!t.captureDate) return false;
          const captureDate = new Date(t.captureDate);
          if (dateFrom && captureDate < new Date(dateFrom)) return false;
          if (dateTo && captureDate > new Date(dateTo + 'T23:59:59')) return false;
          return true;
        });
      }

      // Team KPIs
      const totalOpen = openTasks.length;
      const totalCompleted = completedTasks.length;
      const total = totalOpen + totalCompleted;
      const completionRate = total > 0 ? Math.round((totalCompleted / total) * 100) : 0;

      // Priority task metrics (what reps are measured on)
      const priorityOpenTasks = openTasks.filter(t => isPriorityTask(t.action));
      const priorityCompletedTasks = completedTasks.filter(t => isPriorityTask(t.action));
      const priorityTotal = priorityOpenTasks.length + priorityCompletedTasks.length;
      const priorityCompletionRate = priorityTotal > 0 
        ? Math.round((priorityCompletedTasks.length / priorityTotal) * 100) 
        : 0;

      // Oldest open task (team)
      let oldestOpenDays = 0;
      if (openTasks.length > 0) {
        const today = new Date();
        const oldestTask = openTasks.reduce((oldest, task) => {
          const taskDate = new Date(task.createdAt);
          return taskDate < new Date(oldest.createdAt) ? task : oldest;
        });
        const diffTime = today.getTime() - new Date(oldestTask.createdAt).getTime();
        oldestOpenDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      }

      // Rep leaderboard with priority task tracking
      const repStats: Record<string, { 
        repName: string; 
        open: number; 
        completed: number; 
        priorityOpen: number;
        priorityCompleted: number;
        oldestOpenDays: number;
      }> = {};
      
      teamTasks.forEach(task => {
        const rep = task.repName || 'Unknown';
        const isPriority = isPriorityTask(task.action);
        
        if (!repStats[rep]) {
          repStats[rep] = { repName: rep, open: 0, completed: 0, priorityOpen: 0, priorityCompleted: 0, oldestOpenDays: 0 };
        }
        if (task.actionStatus === 'Completed') {
          // Only count if within date range
          if (dateFrom || dateTo) {
            if (task.captureDate) {
              const captureDate = new Date(task.captureDate);
              if ((!dateFrom || captureDate >= new Date(dateFrom)) && 
                  (!dateTo || captureDate <= new Date(dateTo + 'T23:59:59'))) {
                repStats[rep].completed++;
                if (isPriority) repStats[rep].priorityCompleted++;
              }
            }
          } else {
            repStats[rep].completed++;
            if (isPriority) repStats[rep].priorityCompleted++;
          }
        } else {
          repStats[rep].open++;
          if (isPriority) repStats[rep].priorityOpen++;
          // Calculate oldest open for this rep
          const taskAge = Math.floor((new Date().getTime() - new Date(task.createdAt).getTime()) / (1000 * 60 * 60 * 24));
          if (taskAge > repStats[rep].oldestOpenDays) {
            repStats[rep].oldestOpenDays = taskAge;
          }
        }
      });

      const repLeaderboard = Object.values(repStats)
        .map(rep => {
          const priorityTotal = rep.priorityOpen + rep.priorityCompleted;
          return {
            ...rep,
            completionRate: (rep.open + rep.completed) > 0 
              ? Math.round((rep.completed / (rep.open + rep.completed)) * 100) 
              : 0,
            priorityCompletionRate: priorityTotal > 0
              ? Math.round((rep.priorityCompleted / priorityTotal) * 100)
              : 0,
          };
        })
        .sort((a, b) => b.priorityOpen - a.priorityOpen); // Sort by priority open tasks descending

      // Risk/attention section - identify reps and stores needing attention
      const highOpenThreshold = 10;
      const oldTaskThreshold = 14; // days

      const repsAtRisk = repLeaderboard.filter(r => r.open >= highOpenThreshold || r.oldestOpenDays >= oldTaskThreshold);

      // Stores with most open tasks
      const storeOpenCounts: Record<string, number> = {};
      openTasks.forEach(task => {
        storeOpenCounts[task.storeName] = (storeOpenCounts[task.storeName] || 0) + 1;
      });
      const storesAtRisk = Object.entries(storeOpenCounts)
        .map(([store, count]) => ({ store, openCount: count }))
        .sort((a, b) => b.openCount - a.openCount)
        .slice(0, 5);

      // Get unique regions and clients for filters
      const regions = [...new Set(teamTasks.map(t => t.region))].filter(Boolean).sort();
      const clients = [...new Set(teamTasks.map(t => t.client))].filter(Boolean).sort();

      const response = {
        kpis: {
          totalOpen,
          totalCompleted,
          completionRate,
          oldestOpenDays,
          // Priority task metrics (what reps are measured on)
          priorityOpenCount: priorityOpenTasks.length,
          priorityCompletedCount: priorityCompletedTasks.length,
          priorityCompletionRate,
        },
        repLeaderboard,
        riskAttention: {
          repsAtRisk,
          storesAtRisk
        },
        filters: {
          regions,
          clients
        }
      };
      
      // Cache response if no date filters
      if (!dateFrom && !dateTo) {
        dashboardStatsCache.set(cacheKey, { data: response, timestamp: Date.now(), key: cacheKey });
      }
      
      res.json(response);
    } catch (error) {
      console.error("Error fetching manager task progress:", error);
      res.status(500).json({ error: "Failed to fetch manager task progress" });
    }
  });

  // GET all contacts
  app.get("/api/contacts", async (req, res) => {
    try {
      const allContacts = await storage.getAllContacts();
      res.json({ contacts: allContacts, count: allContacts.length });
    } catch (error) {
      console.error("Error fetching contacts:", error);
      res.status(500).json({ error: "Failed to fetch contacts" });
    }
  });

  // POST import contacts from Excel/CSV (uses memory storage for small files)
  app.post("/api/contacts/import", uploadMemory.single('file'), handleMulterError, async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }

      console.log('[Contacts Import] File received:', req.file.originalname, req.file.size, 'bytes');
      
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      
      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        return res.status(400).json({ error: "File contains no sheets. Please upload a valid Excel or CSV file." });
      }
      
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      if (!worksheet) {
        return res.status(400).json({ error: "Could not read worksheet. Please check the file format." });
      }
      
      const jsonData = XLSX.utils.sheet_to_json(worksheet);
      console.log('[Contacts Import] Rows found:', jsonData.length);
      
      if (jsonData.length > 0) {
        console.log('[Contacts Import] First row keys:', Object.keys(jsonData[0] as object));
      }

      if (jsonData.length === 0) {
        return res.status(400).json({ error: "File contains no data" });
      }

      // Helper to get value from row with flexible column matching
      const getValue = (row: any, ...possibleKeys: string[]): string => {
        for (const key of possibleKeys) {
          if (row[key] !== undefined && row[key] !== null) {
            return String(row[key]).trim();
          }
          const lowerKey = key.toLowerCase();
          for (const rowKey of Object.keys(row)) {
            if (rowKey.toLowerCase() === lowerKey || rowKey.toLowerCase().replace(/[^a-z0-9]/g, '') === lowerKey.replace(/[^a-z0-9]/g, '')) {
              return String(row[rowKey]).trim();
            }
          }
        }
        return '';
      };

      const contactsToImport = jsonData.map((row: any) => ({
        repName: getValue(row, 'Rep Name', 'REP NAME', 'RepName', 'rep_name', 'rep'),
        repEmail: getValue(row, 'Rep Email', 'REP EMAIL', 'RepEmail', 'rep_email', 'email') || null,
        managerName: getValue(row, 'Manager Name', 'MANAGER NAME', 'ManagerName', 'manager_name', 'manager', 'Line Manager', 'LINE MANAGER') || null,
        managerEmail: getValue(row, 'Manager Email', 'MANAGER EMAIL', 'ManagerEmail', 'manager_email', 'Line Manager Email', 'LINE MANAGER EMAIL') || null,
      })).filter((c: any) => c.repName);

      if (contactsToImport.length === 0) {
        return res.status(400).json({ error: "No valid contacts found. Make sure you have a 'Rep Name' column." });
      }

      const count = await storage.bulkUpsertContacts(contactsToImport);
      
      res.json({ 
        success: true, 
        imported: count,
        message: `Successfully imported ${count} contacts` 
      });
    } catch (error: any) {
      console.error("Error importing contacts:", error);
      res.status(500).json({ error: error.message || "Failed to import contacts" });
    }
  });

  // DELETE all contacts
  app.delete("/api/contacts", async (req, res) => {
    try {
      await storage.deleteAllContacts();
      res.json({ success: true, message: "All contacts deleted" });
    } catch (error) {
      console.error("Error deleting contacts:", error);
      res.status(500).json({ error: "Failed to delete contacts" });
    }
  });

  // GET contact emails for a specific rep (used by email service)
  app.get("/api/contacts/emails/:repName", async (req, res) => {
    try {
      const repName = decodeURIComponent(req.params.repName);
      const contact = await storage.getContactByRepName(repName);
      
      if (!contact) {
        return res.json({ found: false, emails: [] });
      }
      
      const emails: string[] = [];
      if (contact.repEmail) emails.push(contact.repEmail);
      if (contact.managerEmail) emails.push(contact.managerEmail);
      
      res.json({ 
        found: true, 
        emails,
        repEmail: contact.repEmail,
        managerEmail: contact.managerEmail,
        managerName: contact.managerName
      });
    } catch (error) {
      console.error("Error fetching contact emails:", error);
      res.status(500).json({ error: "Failed to fetch contact emails" });
    }
  });

  app.post("/api/client-auth/verify", async (req, res) => {
    try {
      const { clientName, password } = req.body;
      if (!clientName || !password) {
        return res.status(400).json({ error: "Client name and password required" });
      }
      const valid = await storage.verifyClientPassword(clientName, password);
      res.json({ valid });
    } catch (error) {
      console.error("Error verifying client password:", error);
      res.status(500).json({ error: "Failed to verify password" });
    }
  });

  app.get("/api/client-auth/has-password/:clientName", async (req, res) => {
    try {
      const { clientName } = req.params;
      const clientPwd = await storage.getClientPassword(decodeURIComponent(clientName));
      res.json({ hasPassword: !!clientPwd });
    } catch (error) {
      console.error("Error checking client password:", error);
      res.status(500).json({ error: "Failed to check password" });
    }
  });

  app.post("/api/client-auth/set-password", async (req, res) => {
    try {
      const { clientName, password } = req.body;
      if (!clientName || !password) {
        return res.status(400).json({ error: "Client name and password required" });
      }
      await storage.setClientPassword(clientName, password);
      res.json({ success: true });
    } catch (error) {
      console.error("Error setting client password:", error);
      res.status(500).json({ error: "Failed to set password" });
    }
  });

  app.get("/api/client-auth/all", async (req, res) => {
    try {
      const passwords = await storage.getAllClientPasswords();
      res.json(passwords.map(p => ({ clientName: p.clientName, hasPassword: true })));
    } catch (error) {
      console.error("Error fetching client passwords:", error);
      res.status(500).json({ error: "Failed to fetch passwords" });
    }
  });

  // Test endpoint to trigger executive weekly email manually
  app.post("/api/admin/send-executive-email", async (req, res) => {
    try {
      const { sendExecutiveWeeklyEmail } = await import("./scheduled-emails");
      await sendExecutiveWeeklyEmail();
      res.json({ success: true, message: "Executive email sent successfully" });
    } catch (error: any) {
      console.error("Error sending executive email:", error);
      res.status(500).json({ error: error.message || "Failed to send email" });
    }
  });

  // Admin endpoint to update line manager names
  app.post("/api/admin/update-line-manager", async (req, res) => {
    try {
      const { oldName, newName } = req.body;
      if (!oldName || !newName) {
        return res.status(400).json({ error: "oldName and newName are required" });
      }
      const result = await db.execute(
        sql`UPDATE tasks SET line_manager = ${newName} WHERE line_manager = ${oldName}`
      );
      res.json({ success: true, message: `Updated line manager from "${oldName}" to "${newName}"`, rowsAffected: result.rowCount });
    } catch (error: any) {
      console.error("Error updating line manager:", error);
      res.status(500).json({ error: error.message || "Failed to update" });
    }
  });

  // Admin endpoint to clean up tasks with invalid dates
  app.post("/api/admin/cleanup-bad-dates", async (req, res) => {
    try {
      const result = await db.execute(
        sql`DELETE FROM tasks WHERE week_ending_date < '2020-01-01' OR week_ending_date > '2030-01-01'`
      );
      res.json({ success: true, message: `Deleted ${result.rowCount} tasks with invalid dates` });
    } catch (error: any) {
      console.error("Error cleaning up bad dates:", error);
      res.status(500).json({ error: error.message || "Failed to cleanup" });
    }
  });

  // Admin endpoint to clear all caches
  app.post("/api/admin/clear-cache", async (_req, res) => {
    try {
      clearAllCaches();
      res.json({ success: true, message: "All caches cleared" });
    } catch (error: any) {
      console.error("Error clearing cache:", error);
      res.status(500).json({ error: error.message || "Failed to clear cache" });
    }
  });

  // Admin endpoint to delete tasks by client and week
  app.post("/api/admin/delete-tasks", async (req, res) => {
    try {
      const client = req.query.client as string;
      const weekEndingDate = req.query.weekEndingDate as string;
      
      if (!client || !weekEndingDate) {
        return res.status(400).json({ error: "client and weekEndingDate are required" });
      }
      
      const result = await db.delete(tasks)
        .where(and(
          eq(tasks.client, client),
          eq(tasks.weekEndingDate, weekEndingDate)
        ));
      
      clearAllCaches();
      res.json({ success: true, message: `Deleted tasks for ${client} week ${weekEndingDate}` });
    } catch (error: any) {
      console.error("Error deleting tasks:", error);
      res.status(500).json({ error: error.message || "Failed to delete tasks" });
    }
  });

  return httpServer;
}
