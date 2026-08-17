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
import { sql, eq, and, desc, type SQL } from "drizzle-orm";
import { uploadToSharePoint } from "./sharepoint-appauth";
import {
  fetchNexusJson,
  nexusClientSlug,
  fetchNexusLatestWeek,
  fetchLiveIssueCounts,
  fetchStoreOverviewFast,
  fetchIssueDetailList,
  fetchStoreSkuListFast,
  computeAtRiskRows,
  fetchDistributionGapsForStoreFast,
  fetchSkuHistory,
  fetchSkuHistoryFast,
  TARGET_COVER_WEEKS,
  type NexusStoreCurrentRecord,
  type NexusOosDetailRecord,
  type NexusLowStockDetailRecord,
  type NexusOverstockDetailRecord,
  type NexusStoreSkuCurrentRecord,
} from "./nexus";
import { invStoreSummary, invSkuMetrics, invSyncLog, pilotCaptures, resourceRoster, storeAssignments } from "@shared/schema";
import pilotRepsSeed from "./pilot-reps-seed.json" with { type: "json" };
import { requireIdentity, scopeToClient, findRosterMatch, issueIdentityToken, importRosterRows, importStoreAssignments, IDENTITY_COOKIE_NAME, IDENTITY_TOKEN_TTL_MS } from "./identity";
import { runWeeklySummarySync, fetchNexusWeeks, runDistributionGapsOnlySync } from "./nexus-sync";
import { claimTask, generateTasksForWeek } from "./nexus-task-generation";
import { storeWeeklySummary, storeSkuWeekly, nexusTasks } from "@shared/schema";

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
    repName: (getValue(row, 'REP NAME', 'Rep Name', 'RepName', 'rep_name', 'Rep') || '').trim().toUpperCase(),
    lineManager: (getValue(row, 'LINE MANAGER', 'Line Manager', 'LineManager', 'line_manager') || '').trim().toUpperCase(),
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
        const utcMs = Date.UTC(1899, 11, 30) + num * 86400000;
        const y = new Date(utcMs).getUTCFullYear();
        const m = String(new Date(utcMs).getUTCMonth() + 1).padStart(2, '0');
        const d = String(new Date(utcMs).getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    }
    const strVal = String(dateVal).trim();
    const slashMatch = strVal.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (slashMatch) {
      const [, y, m, d] = slashMatch;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    const ddmmMatch = strVal.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (ddmmMatch) {
      const [, d, m, y] = ddmmMatch;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    const parsed = new Date(strVal);
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
      // Snapshot pilot rep tasks to history BEFORE wiping
      console.log(`Async import [${jobId}] - Snapshotting pilot tasks to history...`);
      try {
        await db.execute(sql`
          INSERT INTO pilot_tasks_history (
            unique_id, key, client, banner, region, store_name, rep_name, line_manager,
            category, barcode, article_description, dc_soh, store_soh, p4_week_sales,
            missed_sales, store_wfc, stock_classification, week_ending, week_ending_date,
            action, action_date, action_status, physical_count, variance, system_adjusted,
            reason_code, action_taken_comment, feedback, capture_date,
            image1, image2, image3, image4, saved_at
          )
          SELECT
            unique_id, key, client, banner, region, store_name, rep_name, line_manager,
            category, barcode, article_description, dc_soh, store_soh, p4_week_sales,
            missed_sales, store_wfc, stock_classification, week_ending, week_ending_date,
            action, action_date, action_status, physical_count, variance, system_adjusted,
            reason_code, action_taken_comment, feedback, capture_date,
            image1, image2, image3, image4, NOW()
          FROM tasks
          WHERE UPPER(TRIM(rep_name)) IN (SELECT UPPER(TRIM(rep_name)) FROM pilot_reps)
          ON CONFLICT (unique_id) DO UPDATE SET
            action_status        = EXCLUDED.action_status,
            action_date          = EXCLUDED.action_date,
            physical_count       = EXCLUDED.physical_count,
            variance             = EXCLUDED.variance,
            system_adjusted      = EXCLUDED.system_adjusted,
            reason_code          = EXCLUDED.reason_code,
            action_taken_comment = EXCLUDED.action_taken_comment,
            feedback             = EXCLUDED.feedback,
            capture_date         = EXCLUDED.capture_date,
            image1               = EXCLUDED.image1,
            image2               = EXCLUDED.image2,
            image3               = EXCLUDED.image3,
            image4               = EXCLUDED.image4,
            saved_at             = EXCLUDED.saved_at
        `);
        console.log(`Async import [${jobId}] - Pilot task history snapshot complete.`);
      } catch (snapErr) {
        console.error(`Async import [${jobId}] - Pilot snapshot error (non-fatal):`, snapErr);
      }
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
  { pattern: 'check count: no sales in 14', priority: 6 },
  { pattern: 'check count: no sales in 7', priority: 7 },
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
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
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

// Real combined view across every client a syndicated rep covers at this
// store - the dropdown's default state (Carin, 2026-08-13: "it must say
// all and then the filter must drop down to the client" - stop
// auto-picking one arbitrary "loudest" client as the default).
// Counts are summed across clients (genuinely additive - real numbers, not
// invented). dcAvailabilityPct/avgWeeksOfCover are percentages/averages, so
// a plain sum would be wrong - weighted by the same denominator each was
// originally computed over (oosCount / lowStockCount) so the combined
// figure stays a real weighted average, not a fabricated blend.
async function buildAllClientsOverview(store: string, summaryRows: any[]) {
  const latestWeek = summaryRows[0]?.weekEnding;
  const latestRows = summaryRows.filter((r) => r.weekEnding === latestWeek);
  const realClients = Array.from(new Set(latestRows.map((r) => r.client)));

  const sumBy = (rows: any[], field: string) => rows.reduce((s, r) => s + (r[field] || 0), 0);
  const weightedAvg = (rows: any[], valueField: string, weightField: string, fallback: number) => {
    let num = 0;
    let den = 0;
    for (const r of rows) {
      if (r[valueField] == null || !r[weightField]) continue;
      num += r[valueField] * r[weightField];
      den += r[weightField];
    }
    return den > 0 ? num / den : fallback;
  };

  const totalSkus = sumBy(latestRows, "totalSkus");
  const oosCount = sumBy(latestRows, "oosCount");
  const lowStockCount = sumBy(latestRows, "lowStockCount");
  const overstockCount = sumBy(latestRows, "overstockCount");
  const salesAtRiskSkuCount = sumBy(latestRows, "salesAtRiskSkuCount");
  const dcAvailabilityPct = weightedAvg(latestRows, "dcAvailabilityPct", "oosCount", 100);
  const avgWeeksOfCover = weightedAvg(latestRows, "avgWeeksOfCover", "lowStockCount", 0);
  const inStockPct = totalSkus > 0 ? ((totalSkus - oosCount) / totalSkus) * 100 : 100;

  // Real per-week aggregate across every client, for the trend charts.
  const weeks = Array.from(new Set(summaryRows.map((r) => r.weekEnding))).sort();
  const trend = weeks.map((w) => {
    const rows = summaryRows.filter((r) => r.weekEnding === w);
    return {
      weekEnding: w,
      oosCount: sumBy(rows, "oosCount"),
      lowStockCount: sumBy(rows, "lowStockCount"),
      atRiskCount: sumBy(rows, "atRiskCount"),
      storeSoh: sumBy(rows, "storeSoh"),
    };
  });
  const salesTrend = weeks.map((w) => ({
    weekEnding: w,
    salesP4: sumBy(summaryRows.filter((r) => r.weekEnding === w), "salesP4"),
  }));

  let deltas: Record<string, number> | null = null;
  const previousWeek = weeks.length > 1 ? weeks[weeks.length - 2] : undefined;
  if (previousWeek) {
    const prevRows = summaryRows.filter((r) => r.weekEnding === previousWeek);
    const prevTotalSkus = sumBy(prevRows, "totalSkus");
    const prevOos = sumBy(prevRows, "oosCount");
    const prevInStockPct = prevTotalSkus > 0 ? ((prevTotalSkus - prevOos) / prevTotalSkus) * 100 : null;
    const currInStockPct = totalSkus > 0 ? ((totalSkus - oosCount) / totalSkus) * 100 : null;
    deltas = {
      oosCount: oosCount - prevOos,
      lowStockCount: lowStockCount - sumBy(prevRows, "lowStockCount"),
      overstockCount: overstockCount - sumBy(prevRows, "overstockCount"),
      atRiskCount: sumBy(latestRows, "atRiskCount") - sumBy(prevRows, "atRiskCount"),
      distributionGapsCount: sumBy(latestRows, "distributionGapsCount") - sumBy(prevRows, "distributionGapsCount"),
      ...(prevInStockPct !== null && currInStockPct !== null
        ? { inStockPct: Math.round((currInStockPct - prevInStockPct) * 10) / 10 }
        : {}),
      ...(prevRows.some((r) => r.dcAvailabilityPct != null) && latestRows.some((r) => r.dcAvailabilityPct != null)
        ? { dcAvailabilityPct: Math.round((dcAvailabilityPct - weightedAvg(prevRows, "dcAvailabilityPct", "oosCount", 100)) * 10) / 10 }
        : {}),
      ...(prevRows.some((r) => r.avgWeeksOfCover != null) && latestRows.some((r) => r.avgWeeksOfCover != null)
        ? { avgWeeksOfCover: Math.round((avgWeeksOfCover - weightedAvg(prevRows, "avgWeeksOfCover", "lowStockCount", 0)) * 10) / 10 }
        : {}),
      salesAtRiskSkuCount: salesAtRiskSkuCount - sumBy(prevRows, "salesAtRiskSkuCount"),
      ...(prevRows.some((r) => r.negSohCount != null) && latestRows.some((r) => r.negSohCount != null)
        ? { negSOHCount: sumBy(latestRows, "negSohCount") - sumBy(prevRows, "negSohCount") }
        : {}),
    };
  }

  // Live-only fields (not persisted per-week) need a real per-client fetch,
  // summed across exactly the clients that operate at this store - not a
  // full 25-client scan, since realClients already came from our own
  // synced data for this store.
  const perClient = await Promise.all(
    realClients.map(async (client) => {
      try {
        const [overview, gaps] = await Promise.all([
          fetchStoreOverviewFast(client, store, client),
          fetchDistributionGapsForStoreFast(client, store, client),
        ]);
        if (!overview) return null;
        return { overview, atRisk: overview.atRiskCount, gaps: gaps.missingSkus };
      } catch {
        return null;
      }
    })
  );
  const ok = perClient.filter((c): c is NonNullable<typeof c> => c !== null);

  const sumOk = (fn: (o: any) => number) => ok.reduce((s, c) => s + fn(c.overview), 0);
  const first = ok[0]?.overview;

  return {
    storeName: store,
    resolvedClient: "All Clients",
    siteCode: first?.siteCode || "—",
    banner: first?.banner || "",
    totalSkus,
    oosCount,
    lowStockCount,
    overstockCount,
    negSOHCount: sumOk((o) => o.negSOHCount || 0),
    optimalCount: sumOk((o) => o.optimalCount || 0),
    chronicUnderstockCount: sumOk((o) => o.chronicUnderstockCount || 0),
    inStockPct,
    missedUnits: sumOk((o) => o.missedUnits || 0),
    dcAvailabilityPct,
    avgWeeksOfCover,
    dcAvailableCount: sumOk((o) => o.dcAvailableCount || 0),
    noDcStockCount: sumOk((o) => o.noDcStockCount || 0),
    suggestedOrderSkuCount: sumOk((o) => o.suggestedOrderSkuCount || 0),
    suggestedOrderUnitsTotal: sumOk((o) => o.suggestedOrderUnitsTotal || 0),
    suggestedOrderDcSupportedCount: sumOk((o) => o.suggestedOrderDcSupportedCount || 0),
    immediateActionCount: sumOk((o) => o.immediateActionCount || 0),
    salesAtRiskSkuCount,
    topIssues: ok
      .flatMap((c) => c.overview.topIssues || [])
      .sort((a: any, b: any) => (b.estimatedMissedUnits || 0) - (a.estimatedMissedUnits || 0))
      .slice(0, 20),
    trend,
    salesTrend,
    deltas,
    atRiskCount: ok.length > 0 ? ok.reduce((s, c) => s + c.atRisk, 0) : sumBy(latestRows, "atRiskCount"),
    distributionGapsCount: ok.length > 0 ? ok.reduce((s, c) => s + c.gaps, 0) : sumBy(latestRows, "distributionGapsCount"),
  };
}

// Real merged SKU list across every client at this store - the "All
// Clients" dropdown mode has no single client to scope a SKU list to, so
// each real client's own list (same logic as the single-client path) is
// fetched and concatenated, tagged with which client each row belongs to.
// Not a fabricated blend - every row is a real row from a real client's
// real Nexus data, just shown together (Carin, 2026-08-13: "wire this up
// and fix it" - SKU drill-in was silently falling back to a single
// arbitrary client while in All mode).
async function fetchSkuListForClient(client: string, store: string, classification: string) {
  if (classification === "risk") {
    const skuList = await fetchStoreSkuListFast(client, store, client);
    const rows = computeAtRiskRows(skuList.rows).map((r) => ({
      barcode: r.barcode,
      articleDescription: r.articleDescription,
      storeSoh: r.storeSoh,
      dcSoh: r.dcSoh,
      sellOutP4: r.sellOutP4,
      cover: r.cover,
      estimatedMissedUnits: r.estimatedMissedUnits,
      action: "Monitor cover — replenish before it becomes Out of Stock",
      classification: "At Risk",
      issueDriver: null as string | null,
      suggestedOrderUnits: typeof r.avgWeeklySales === "number"
        ? Math.max(0, Math.round(TARGET_COVER_WEEKS * r.avgWeeklySales - r.storeSoh))
        : null,
      dcFulfillableUnits: null as number | null,
      client,
    }));
    return { resolvedClient: client, rows, missingSkus: undefined, rangedSkus: skuList.rows.length, avgCoveragePct: undefined };
  }

  if (classification === "cover") {
    const skuList = await fetchStoreSkuListFast(client, store, client);
    const rows = skuList.rows
      .filter((r) => r.storeSoh > 0 && r.cover !== null)
      .map((r) => ({
        barcode: r.barcode,
        articleDescription: r.articleDescription,
        storeSoh: r.storeSoh,
        dcSoh: r.dcSoh,
        sellOutP4: r.sellOutP4,
        cover: r.cover,
        estimatedMissedUnits: r.estimatedMissedUnits,
        action: "Review cover levels",
        classification: r.classification,
        issueDriver: null as string | null,
        suggestedOrderUnits: null as number | null,
        dcFulfillableUnits: null as number | null,
        sourceStem: r.sourceStem ?? null,
        client,
      }));
    return { resolvedClient: client, rows, missingSkus: undefined, rangedSkus: skuList.rows.length, avgCoveragePct: undefined };
  }

  if (classification === "negsoh") {
    const skuList = await fetchStoreSkuListFast(client, store, client);
    const rows = skuList.rows
      .filter((r) => r.storeSoh < 0)
      .map((r) => ({
        barcode: r.barcode,
        articleDescription: r.articleDescription,
        storeSoh: r.storeSoh,
        dcSoh: r.dcSoh,
        sellOutP4: r.sellOutP4,
        cover: r.cover,
        estimatedMissedUnits: r.estimatedMissedUnits,
        action: "Investigate stock count discrepancy",
        classification: "Negative SOH",
        issueDriver: null as string | null,
        suggestedOrderUnits: null as number | null,
        dcFulfillableUnits: null as number | null,
        client,
      }));
    return { resolvedClient: client, rows, missingSkus: undefined, rangedSkus: skuList.rows.length, avgCoveragePct: undefined };
  }

  if (classification === "distribution") {
    const [gaps, skuList] = await Promise.all([
      fetchDistributionGapsForStoreFast(client, store, client),
      fetchStoreSkuListFast(client, store, client),
    ]);
    const rows = gaps.rows.map((r) => ({
      barcode: r.barcode,
      articleDescription: r.articleDescription,
      storeSoh: 0,
      dcSoh: null as number | null,
      sellOutP4: null as number | null,
      cover: null as number | null,
      estimatedMissedUnits: 0,
      action: r.suggestedAction,
      classification: r.gapType || "Distribution Gap",
      issueDriver: null as string | null,
      suggestedOrderUnits: null as number | null,
      dcFulfillableUnits: null as number | null,
      client,
    }));
    return { resolvedClient: client, rows, missingSkus: gaps.missingSkus, rangedSkus: skuList.rows.length, avgCoveragePct: gaps.avgCoverage };
  }

  const result = await fetchIssueDetailList(client, store, classification as "oos" | "low" | "overstock", client);
  return {
    resolvedClient: client,
    rows: result.rows.map((r: any) => ({ ...r, client })),
    missingSkus: undefined,
    rangedSkus: undefined,
    avgCoveragePct: undefined,
  };
}

async function buildAllClientsSkuList(store: string, classification: string, realClients: string[]) {
  const perClient = await Promise.all(
    realClients.map(async (client) => {
      try {
        return await fetchSkuListForClient(client, store, classification);
      } catch {
        return null;
      }
    })
  );
  const ok = perClient.filter((c): c is NonNullable<typeof c> => c !== null);
  const rows = ok.flatMap((c) => c.rows);

  if (classification === "distribution") {
    const totalRanged = ok.reduce((s, c) => s + (c.rangedSkus || 0), 0);
    const weightedCoverage = ok.reduce((s, c) => s + (c.avgCoveragePct != null ? c.avgCoveragePct * (c.rangedSkus || 0) : 0), 0);
    return {
      storeName: store,
      resolvedClient: "All Clients",
      rows,
      missingSkus: ok.reduce((s, c) => s + (c.missingSkus || 0), 0),
      rangedSkus: totalRanged,
      avgCoveragePct: totalRanged > 0 ? weightedCoverage / totalRanged : null,
    };
  }

  const sorted = classification === "cover"
    ? rows.sort((a: any, b: any) => (a.cover ?? 0) - (b.cover ?? 0))
    : rows.sort((a: any, b: any) => (b.estimatedMissedUnits || 0) - (a.estimatedMissedUnits || 0));

  return { storeName: store, resolvedClient: "All Clients", rows: sorted };
}

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

  // Read a verified identity token if present (does not block unauthenticated
  // requests - the existing Rep/Manager/Client access screens keep working
  // exactly as before). See server/identity.ts for the full explanation.
  app.use('/api', requireIdentity);

  // POST identify - "who are you" via Name + Employee ID against this week's
  // Call Cycle Master roster. No password, no lockouts: if the combination
  // isn't on this week's list, the fix is getting added to the roster.
  app.post("/api/auth/identify", async (req, res) => {
    try {
      const resourceEmpId = String(req.body?.resourceEmpId ?? "").trim();
      const resourceName = String(req.body?.resourceName ?? "").trim();
      if (!resourceEmpId || !resourceName) {
        return res.status(400).json({ error: "Please provide both your name and employee ID." });
      }

      const match = await findRosterMatch(resourceEmpId, resourceName);
      if (!match) {
        return res.status(401).json({
          error: "We couldn't find that name and ID on this week's list - check with your manager that you're on the roster.",
        });
      }

      const token = issueIdentityToken(match);
      res.cookie(IDENTITY_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: IDENTITY_TOKEN_TTL_MS,
      });
      res.json({
        resourceEmpId: match.resourceEmpId,
        resourceName: match.resourceName,
        resourceType: match.resourceType,
        clientScope: match.clientScope,
        token,
      });
    } catch (error) {
      console.error("Error identifying user:", error);
      res.status(500).json({ error: "Something went wrong checking the roster. Please try again." });
    }
  });

  // POST admin roster import - accepts the same JSON array shape
  // store_coverage.json already produces (Call Cycle Master + P&G tabs,
  // dedicated-overrides-syndicated resolved). Upserts by resourceEmpId, so a
  // weekly re-run just refreshes everyone's current scope. Excel parsing
  // itself stays in the separate Python pipeline - this is just the consumer.
  app.post("/api/admin/roster/import", async (req, res) => {
    try {
      const rows = Array.isArray(req.body) ? req.body : req.body?.rows;
      if (!Array.isArray(rows)) {
        return res.status(400).json({ error: "Expected a JSON array of roster rows (or { rows: [...] })." });
      }
      const result = await importRosterRows(rows);
      res.json(result);
    } catch (error) {
      console.error("Error importing roster:", error);
      res.status(500).json({ error: "Failed to import roster" });
    }
  });

  // Real Rep vs Merchandiser split, sourced from resource_roster's actual
  // RESOURCE TYPE (Call Cycle Master) - "REP" -> anyone whose type contains
  // "REP" but not "MERCHANDISER" (e.g. SYNDICATED REP, P&G DEDICATED REP);
  // "MERCHANDISER" -> the inverse. Confirmed 2026-08-08 against real data:
  // 135 SYNDICATED REP + 34 P&G DEDICATED REP + 6 SEMI DEDICATED REP + 5
  // SODASTREAM DEDICATED REP + 3 DURACELL DEDICATED REP = reps; the
  // MERCHANDISER-labeled types are the mirror set.
  app.get("/api/roster/names", async (req, res) => {
    try {
      const role = String(req.query.role || "").toUpperCase();
      if (role !== "REP" && role !== "MERCHANDISER") {
        return res.status(400).json({ error: "role query param must be 'rep' or 'merchandiser'" });
      }
      const condition = role === "MERCHANDISER"
        ? sql`upper(${resourceRoster.resourceType}) like '%MERCHANDISER%'`
        : sql`upper(${resourceRoster.resourceType}) like '%REP%' and upper(${resourceRoster.resourceType}) not like '%MERCHANDISER%'`;
      const rows = await db
        .select({ resourceName: resourceRoster.resourceName })
        .from(resourceRoster)
        .where(condition)
        .orderBy(resourceRoster.resourceName);
      const names = Array.from(new Set(rows.map((r) => r.resourceName)));
      res.json({ names });
    } catch (error) {
      console.error("Error fetching roster names:", error);
      res.status(500).json({ error: "Failed to fetch roster names" });
    }
  });

  app.post("/api/admin/store-assignments/import", async (req, res) => {
    try {
      const rows = Array.isArray(req.body) ? req.body : req.body?.rows;
      if (!Array.isArray(rows)) {
        return res.status(400).json({ error: "Expected a JSON array of rows (or { rows: [...] })." });
      }
      const result = await importStoreAssignments(rows);
      res.json(result);
    } catch (error) {
      console.error("Error importing store assignments:", error);
      res.status(500).json({ error: "Failed to import store assignments" });
    }
  });

  // Real "which stores does this person cover" - sourced from Call Cycle
  // Master coverage, not from task history (confirmed broken 2026-08-08:
  // a real merchandiser with no task history showed zero stores here).
  app.get("/api/roster/stores-for-name", async (req, res) => {
    try {
      const name = String(req.query.name || "").trim();
      if (!name) {
        return res.status(400).json({ error: "name query param is required" });
      }
      const rows = await db
        .select({ cleanedStoreName: storeAssignments.cleanedStoreName, banner: storeAssignments.banner })
        .from(storeAssignments)
        .where(sql`upper(trim(${storeAssignments.resourceName})) = ${name.toUpperCase().trim()}`)
        .orderBy(storeAssignments.cleanedStoreName);
      const seen = new Set<string>();
      const stores: string[] = [];
      const bannerByStore: Record<string, string> = {};
      for (const r of rows) {
        if (!seen.has(r.cleanedStoreName)) {
          seen.add(r.cleanedStoreName);
          stores.push(r.cleanedStoreName);
        }
        if (r.banner) bannerByStore[r.cleanedStoreName] = r.banner;
      }
      res.json({ stores, bannerByStore });
    } catch (error) {
      console.error("Error fetching stores for name:", error);
      res.status(500).json({ error: "Failed to fetch stores for name" });
    }
  });

  // Store-first flow: search real stores by name (for "select store first,
  // then see who's linked to it" per direct request 2026-08-12).
  // Real list of clients that actually have synced Nexus data for a given
  // store - powers the Client filter dropdown on Store Overview (a
  // syndicated rep's store can have real data for several clients at once).
  app.get("/api/roster/clients-for-store", async (req, res) => {
    try {
      const store = String(req.query.store || "").trim();
      const repName = String(req.query.rep || "").trim();
      if (!store) {
        return res.status(400).json({ error: "store query param is required" });
      }

      // Scope to what this rep is actually assigned to - a dedicated rep
      // only ever sees their one real client (no dropdown needed); a
      // syndicated rep sees every real client with data at this store.
      let clientScope = "SYNDICATED";
      if (repName) {
        const [rosterRow] = await db
          .select({ clientScope: resourceRoster.clientScope })
          .from(resourceRoster)
          .where(sql`upper(trim(${resourceRoster.resourceName})) = ${repName.toUpperCase().trim()}`)
          .limit(1);
        if (rosterRow?.clientScope) clientScope = rosterRow.clientScope;
      }

      if (clientScope !== "SYNDICATED") {
        return res.json({ clients: [clientScope] });
      }

      const rows = await db
        .selectDistinct({ client: storeWeeklySummary.client })
        .from(storeWeeklySummary)
        .where(sql`upper(trim(${storeWeeklySummary.cleanedStoreName})) = ${store.toUpperCase().trim()}`)
        .orderBy(storeWeeklySummary.client);
      res.json({ clients: rows.map((r) => r.client) });
    } catch (error) {
      console.error("Error fetching clients for store:", error);
      res.status(500).json({ error: "Failed to fetch clients for store" });
    }
  });

  // In-memory cache for the full deduped store list - added 2026-08-16.
  // This join has to touch nearly all of store_assignments (18k rows) and
  // store_weekly_summary (140k+ rows) to compute, so no index helps (a
  // selective-lookup index doesn't speed up a "give me almost everything"
  // query) - confirmed via EXPLAIN, still 1.8s of real seq scan + sort work.
  // The underlying data only changes on a roster import or a weekly sync,
  // not per-request, so caching it is the right fix, same pattern as
  // dashboardStatsCache elsewhere in this file.
  let storeSearchCache: { stores: Array<{ name: string; banner: string | null }>; expiresAt: number } | null = null;
  const STORE_SEARCH_CACHE_MS = 10 * 60 * 1000;

  app.get("/api/roster/store-search", async (req, res) => {
    try {
      const q = String(req.query.q || "").trim();

      if (!storeSearchCache || storeSearchCache.expiresAt < Date.now()) {
        // Only return stores that actually have real synced Nexus inventory
        // data (storeWeeklySummary) - a store can be in the Call Cycle Master
        // roster but genuinely have zero Nexus data for any client (confirmed
        // real gap, e.g. Checkers Constantia for P&G), so listing it here
        // would just lead to a dead-end "no live data" screen.
        const rows = await db
          .selectDistinct({ cleanedStoreName: storeAssignments.cleanedStoreName, banner: storeAssignments.banner })
          .from(storeAssignments)
          .innerJoin(
            storeWeeklySummary,
            sql`upper(trim(${storeWeeklySummary.cleanedStoreName})) = upper(trim(${storeAssignments.cleanedStoreName}))`
          )
          .orderBy(storeAssignments.cleanedStoreName)
          .limit(10000);
        // The same physical store can appear multiple times with a
        // differently-cased banner (e.g. "Checkers" vs "CHECKERS" on separate
        // roster rows) - dedupe by store name only, keeping the first banner
        // seen, so the picker doesn't show the same store twice.
        const seen = new Set<string>();
        const deduped: Array<{ name: string; banner: string | null }> = [];
        for (const r of rows) {
          const key = r.cleanedStoreName.toUpperCase().trim();
          if (!seen.has(key)) {
            seen.add(key);
            deduped.push({ name: r.cleanedStoreName, banner: r.banner });
          }
        }
        storeSearchCache = { stores: deduped, expiresAt: Date.now() + STORE_SEARCH_CACHE_MS };
      }

      const stores = q
        ? storeSearchCache.stores.filter((s) => s.name.toUpperCase().includes(q.toUpperCase()))
        : storeSearchCache.stores;
      res.json({ stores });
    } catch (error) {
      console.error("Error searching stores:", error);
      res.status(500).json({ error: "Failed to search stores" });
    }
  });

  // Reverse lookup: given a store, who's actually assigned to it. Prefers a
  // dedicated (non-SYNDICATED) assignment over a syndicated one, matching
  // the same dedicated-over-syndicated rule used everywhere else.
  app.get("/api/roster/rep-for-store", async (req, res) => {
    try {
      const store = String(req.query.store || "").trim();
      const role = String(req.query.role || "").trim();
      if (!store) {
        return res.status(400).json({ error: "store query param is required" });
      }

      // store_assignments has no resourceType of its own - look it up from
      // resource_roster (which does) so a Merchandiser never shows up in
      // the Rep flow or vice versa (real bug found 2026-08-12: a
      // SYNDICATED MERCHANDISER was being suggested under "Rep").
      //
      // Deliberately filter store_assignments by store name FIRST, then
      // resolve roster info only for those few resourceEmpIds - joining
      // store_assignments+resource_roster directly with the role LIKE
      // filter in the same WHERE let Postgres pick resource_roster (2596
      // MERCHANDISER matches) as the driving table and re-scan all 18k
      // store_assignments rows per match (~48M upper/trim evals, 30s+
      // hang) - confirmed via EXPLAIN ANALYZE 2026-08-12.
      const assignmentRows = await db
        .select({ resourceEmpId: storeAssignments.resourceEmpId, resourceName: storeAssignments.resourceName, clientScope: storeAssignments.clientScope })
        .from(storeAssignments)
        .where(sql`upper(trim(${storeAssignments.cleanedStoreName})) = ${store.toUpperCase().trim()}`);

      const empIds = Array.from(new Set(assignmentRows.map((r) => r.resourceEmpId).filter((id): id is string => !!id)));
      const rosterRows = empIds.length
        ? await db
            .select({ resourceEmpId: resourceRoster.resourceEmpId, resourceType: resourceRoster.resourceType })
            .from(resourceRoster)
            .where(sql`${resourceRoster.resourceEmpId} in ${empIds}`)
        : [];
      const roleByEmpId = new Map(rosterRows.map((r) => [r.resourceEmpId, (r.resourceType || "").toUpperCase()]));

      const matchesRole = (empId: string | null) => {
        const rt = roleByEmpId.get(empId || "") || "";
        if (role.toUpperCase() === "MERCHANDISER") return rt.includes("MERCHANDISER");
        if (role.toUpperCase() === "REP") return rt.includes("REP") && !rt.includes("MERCHANDISER");
        return true;
      };

      const rows = assignmentRows.filter((r) => matchesRole(r.resourceEmpId));
      const dedicated = rows.find((r) => r.clientScope !== "SYNDICATED");
      const chosen = dedicated || rows[0];
      const allNames = Array.from(new Set(rows.map((r) => r.resourceName)));
      res.json({ rep: chosen?.resourceName || null, allReps: allNames });
    } catch (error) {
      console.error("Error resolving rep for store:", error);
      res.status(500).json({ error: "Failed to resolve rep for store" });
    }
  });

  // Real, LIVE issue counts straight from Nexus's own classified data - no
  // generated task rows involved. Confirmed 2026-08-08: this is the correct
  // source for "how many issues does this store have," since Nexus already
  // computes that; StockFix's own tasks table is only needed at the point
  // someone actually captures/completes something.
  app.get("/api/roster/live-issue-counts", async (req, res) => {
    try {
      const name = String(req.query.name || "").trim();
      if (!name) {
        return res.status(400).json({ error: "name query param is required" });
      }
      const [rosterRow] = await db
        .select({ clientScope: resourceRoster.clientScope })
        .from(resourceRoster)
        .where(sql`upper(trim(${resourceRoster.resourceName})) = ${name.toUpperCase().trim()}`)
        .limit(1);
      const clientScope = rosterRow?.clientScope || "SYNDICATED";

      const storeRows = await db
        .select({ cleanedStoreName: storeAssignments.cleanedStoreName })
        .from(storeAssignments)
        .where(sql`upper(trim(${storeAssignments.resourceName})) = ${name.toUpperCase().trim()}`);
      const stores = Array.from(new Set(storeRows.map((r) => r.cleanedStoreName)));

      const week = await fetchNexusLatestWeek();
      const counts = await fetchLiveIssueCounts(week, clientScope, stores);
      res.json({ week, clientScope, counts });
    } catch (error) {
      console.error("Error fetching live issue counts:", error);
      res.status(500).json({ error: "Failed to fetch live issue counts" });
    }
  });

  // Manual trigger for the weekly summary sync - on the real app this runs
  // automatically on the same scheduler pattern as the existing weekly
  // email, not via a manually-called endpoint. Exposed here for testing.
  app.post("/api/admin/nexus-summary-sync", async (req, res) => {
    try {
      const week = req.query.week ? String(req.query.week) : undefined;
      const onlyClients = req.query.clients ? String(req.query.clients).split(",").map((c) => c.trim().toUpperCase()) : undefined;
      const result = await runWeeklySummarySync(week, onlyClients);
      res.json(result);
    } catch (error: any) {
      console.error("Error running weekly summary sync:", error);
      res.status(500).json({ error: error?.message || "Failed to run summary sync" });
    }
  });

  // Plain-text tail of the sync heartbeat log, viewable straight in a
  // browser - added 2026-08-14 so a stall is visible without a terminal.
  // Optional ?week=2026-07-29 and/or ?client=TACOMA narrow the tail to just
  // the lines mentioning that week/client (case-insensitive substring match).
  app.get("/api/admin/sync-log", async (req, res) => {
    try {
      const logPath = path.join(process.cwd(), "sync-progress.log");
      if (!fs.existsSync(logPath)) {
        res.type("text/plain").send("(no sync log yet - nothing has run since this feature was added)");
        return;
      }
      let lines = fs.readFileSync(logPath, "utf-8").split("\n").filter(Boolean);
      const week = req.query.week ? String(req.query.week).toLowerCase() : undefined;
      const client = req.query.client ? String(req.query.client).toLowerCase() : undefined;
      if (week) lines = lines.filter((l) => l.toLowerCase().includes(week));
      if (client) lines = lines.filter((l) => l.toLowerCase().includes(client));
      const tail = lines.slice(-150).join("\n");
      res.type("text/plain").send(tail || "(no matching log lines)");
    } catch (error: any) {
      res.status(500).type("text/plain").send(`Error reading sync log: ${error?.message || error}`);
    }
  });

  // One-time backfill so trend charts/deltas have real history immediately,
  // instead of waiting for real weeks to pass one at a time.
  app.post("/api/admin/nexus-summary-backfill", async (req, res) => {
    try {
      const weeksBack = parseInt(String(req.query.weeks || "4"), 10);
      const allWeeks = await fetchNexusWeeks();
      const targetWeeks = allWeeks.slice(0, weeksBack);
      const results = [];
      // One week's failure (e.g. a transient DB/network blip) must never
      // abandon the rest of a multi-week backfill - added 2026-08-14 after
      // exactly that happened (a DNS blip during retention pruning killed
      // the whole 13-week request after only the first week ran).
      for (const week of targetWeeks) {
        try {
          const result = await runWeeklySummarySync(week);
          results.push(result);
        } catch (err: any) {
          console.error(`Backfill: week ${week} failed, continuing to next week:`, err);
          results.push({ week, clientsSynced: 0, rowsWritten: 0, weeksPruned: 0, errors: [String(err?.message || err)] });
        }
      }
      res.json({ weeksBackfilled: results.length, results });
    } catch (error: any) {
      console.error("Error running summary backfill:", error);
      res.status(500).json({ error: error?.message || "Failed to run backfill" });
    }
  });

  // Lightweight, gaps-only backfill - added 2026-08-17 after a real mistake
  // (see runDistributionGapsOnlySync's own comment): re-running the full
  // backfill just to pick up new Distribution Gaps support wastefully
  // re-fetched the entire already-synced SKU dataset too. This fetches only
  // the small Distribution Gaps file per client per week - minutes, not hours.
  app.post("/api/admin/nexus-distribution-gaps-backfill", async (req, res) => {
    try {
      const weeksBack = parseInt(String(req.query.weeks || "13"), 10);
      const allWeeks = await fetchNexusWeeks();
      const targetWeeks = allWeeks.slice(0, weeksBack);
      const result = await runDistributionGapsOnlySync(targetWeeks);
      res.json(result);
    } catch (error: any) {
      console.error("Error running distribution gaps backfill:", error);
      res.status(500).json({ error: error?.message || "Failed to run distribution gaps backfill" });
    }
  });

  // Manual trigger for generateTasksForWeek - normally runs automatically
  // as part of the weekly cycle (nexus-weekly-scheduler.ts), added here so
  // it can be run on-demand against a week that's already synced without
  // waiting for the next real weekly cutover.
  app.post("/api/admin/nexus-generate-tasks", async (req, res) => {
    try {
      const week = req.query.week
        ? String(req.query.week)
        : (await db.selectDistinct({ weekEnding: storeSkuWeekly.weekEnding }).from(storeSkuWeekly).orderBy(sql`week_ending DESC`).limit(1))[0]?.weekEnding;
      if (!week) {
        return res.status(400).json({ error: "No synced week found - pass ?week= explicitly" });
      }
      const result = await generateTasksForWeek(week);
      res.json({ week, ...result });
    } catch (error: any) {
      console.error("Error generating Nexus tasks:", error);
      res.status(500).json({ error: error?.message || "Failed to generate tasks" });
    }
  });

  // Real store-level detail view, no fabricated categories/rand values.
  // Client scope is looked up from the roster by the person's real name -
  // confirmed bug 2026-08-08: an empty/never-populated ?client= param
  // silently defaulted to "check every client," so a dedicated P&G rep's
  // store page could show another client's (Butterfly's) data winning as
  // the "loudest" match. Always resolve the person's real scope instead.
  app.get("/api/roster/store-overview", async (req, res) => {
    try {
      const store = String(req.query.store || "").trim();
      const repName = String(req.query.rep || "").trim();
      if (!store) {
        return res.status(400).json({ error: "store query param is required" });
      }
      let clientScope = "SYNDICATED";
      if (repName) {
        const [rosterRow] = await db
          .select({ clientScope: resourceRoster.clientScope })
          .from(resourceRoster)
          .where(sql`upper(trim(${resourceRoster.resourceName})) = ${repName.toUpperCase().trim()}`)
          .limit(1);
        if (rosterRow?.clientScope) clientScope = rosterRow.clientScope;
      }

      // Explicit client override from the Client filter on Store Overview -
      // lets a syndicated rep switch which real client's data they're
      // viewing for this store, instead of always auto-picking whichever
      // client has the most issues. Reuses the exact same filtering path
      // already used for dedicated reps below. "ALL" is a distinct sentinel
      // (not just "no override") - the dropdown's default state, meaning
      // "show every real client's data combined," per Carin's 2026-08-13
      // instruction: default to All, only filter down once a client is
      // explicitly picked.
      const explicitClient = String(req.query.client || "").trim();
      if (explicitClient && explicitClient !== "ALL") clientScope = explicitClient;

      // Fast path: resolve the real client and pull trend/deltas from our
      // own synced summary table first (local, instant) - only fall back to
      // the slow multi-client live scan if this store was never synced.
      const summaryRows = await db
        .select()
        .from(storeWeeklySummary)
        .where(sql`upper(trim(${storeWeeklySummary.cleanedStoreName})) = ${store.toUpperCase().trim()}`)
        .orderBy(sql`${storeWeeklySummary.weekEnding} DESC`);

      if (explicitClient === "ALL" && clientScope === "SYNDICATED" && summaryRows.length > 0) {
        return res.json(await buildAllClientsOverview(store, summaryRows));
      }

      let knownClient: string | undefined;
      let trend: Array<{ weekEnding: string; oosCount: number; lowStockCount: number; atRiskCount: number; storeSoh: number }> = [];
      let salesTrend: Array<{ weekEnding: string; salesP4: number }> = [];
      let deltas: Record<string, number> | null = null;
      let atRiskCount = 0;
      let distributionGapsCount = 0;

      if (summaryRows.length > 0) {
        const relevantRows = clientScope === "SYNDICATED"
          ? summaryRows
          : summaryRows.filter((r) => r.client === clientScope);
        const rowsToUse = relevantRows.length > 0 ? relevantRows : summaryRows;

        const latestWeek = rowsToUse[0]?.weekEnding;
        const latestForEachClient = rowsToUse.filter((r) => r.weekEnding === latestWeek);
        const bestRow = latestForEachClient.sort((a, b) => (b.oosCount + b.lowStockCount) - (a.oosCount + a.lowStockCount))[0];

        if (bestRow) {
          knownClient = bestRow.client;
          atRiskCount = bestRow.atRiskCount || 0;
          distributionGapsCount = bestRow.distributionGapsCount || 0;
          // Full retained history (up to 13 real weeks, matching the
          // storage design's retention window) - not hardcoded to 4.
          const thisClientHistory = rowsToUse.filter((r) => r.client === bestRow.client).reverse();
          trend = thisClientHistory.map((r) => ({ weekEnding: r.weekEnding, oosCount: r.oosCount, lowStockCount: r.lowStockCount, atRiskCount: r.atRiskCount || 0, storeSoh: r.storeSoh || 0 }));
          salesTrend = thisClientHistory.map((r) => ({ weekEnding: r.weekEnding, salesP4: r.salesP4 || 0 }));

          const previousWeekRow = rowsToUse.find((r) => r.client === bestRow.client && r.weekEnding !== latestWeek);
          if (previousWeekRow) {
            // inStockPct delta is real - totalSkus/oosCount are both stored
            // per week in store_weekly_summary, so this is a genuine WoW
            // comparison, same formula fetchStoreOverview uses (nexus.ts:192).
            // dcAvailabilityPct / avgWeeksOfCover / salesAtRiskSkuCount have
            // no persisted weekly history in this table, so no delta is
            // computed for them - showing one would be fabricated.
            const prevInStockPct = previousWeekRow.totalSkus > 0
              ? ((previousWeekRow.totalSkus - previousWeekRow.oosCount) / previousWeekRow.totalSkus) * 100
              : null;
            const currInStockPct = bestRow.totalSkus > 0
              ? ((bestRow.totalSkus - bestRow.oosCount) / bestRow.totalSkus) * 100
              : null;
            deltas = {
              oosCount: bestRow.oosCount - previousWeekRow.oosCount,
              lowStockCount: bestRow.lowStockCount - previousWeekRow.lowStockCount,
              overstockCount: bestRow.overstockCount - previousWeekRow.overstockCount,
              atRiskCount: atRiskCount - (previousWeekRow.atRiskCount || 0),
              distributionGapsCount: distributionGapsCount - (previousWeekRow.distributionGapsCount || 0),
              ...(prevInStockPct !== null && currInStockPct !== null
                ? { inStockPct: Math.round((currInStockPct - prevInStockPct) * 10) / 10 }
                : {}),
              // Real - only present once both weeks were synced after
              // 2026-08-12 (when these columns were added). Absent
              // entirely on weeks before that, never fabricated as 0.
              ...(bestRow.dcAvailabilityPct != null && previousWeekRow.dcAvailabilityPct != null
                ? { dcAvailabilityPct: Math.round((bestRow.dcAvailabilityPct - previousWeekRow.dcAvailabilityPct) * 10) / 10 }
                : {}),
              ...(bestRow.avgWeeksOfCover != null && previousWeekRow.avgWeeksOfCover != null
                ? { avgWeeksOfCover: Math.round((bestRow.avgWeeksOfCover - previousWeekRow.avgWeeksOfCover) * 10) / 10 }
                : {}),
              ...(bestRow.salesAtRiskSkuCount != null && previousWeekRow.salesAtRiskSkuCount != null
                ? { salesAtRiskSkuCount: bestRow.salesAtRiskSkuCount - previousWeekRow.salesAtRiskSkuCount }
                : {}),
              ...(bestRow.negSohCount != null && previousWeekRow.negSohCount != null
                ? { negSOHCount: bestRow.negSohCount - previousWeekRow.negSohCount }
                : {}),
            };
          }
        }
      }

      const overview = await fetchStoreOverviewFast(clientScope, store, knownClient);
      if (!overview) {
        return res.status(404).json({ error: "No live Nexus data found for this store" });
      }

      // At Risk now comes straight off overview (computed there from the
      // same skuRows already loaded - no second DB round-trip). Distribution
      // Gaps still needs its own call (that data isn't synced yet, per the
      // 2026-08-13 audit's item #3), but distributionGapsFileCache makes
      // every call after the first one on this server process near-instant
      // (real bug found 2026-08-14: two separate SKU-list fetches for the
      // same data, not the live call itself, was most of the remaining
      // latency once fetchStoreOverviewFast landed).
      atRiskCount = overview.atRiskCount;
      try {
        const gaps = await fetchDistributionGapsForStoreFast(clientScope, store, overview.resolvedClient);
        distributionGapsCount = gaps.missingSkus;
      } catch (err) {
        console.error("Live Distribution Gaps calc failed, using synced placeholder:", err);
      }

      res.json({ ...overview, trend, salesTrend, deltas, atRiskCount, distributionGapsCount });
    } catch (error) {
      console.error("Error fetching store overview:", error);
      res.status(500).json({ error: "Failed to fetch store overview" });
    }
  });

  // Real SKU-level drill-down list for one store's OOS or Low Stock tile -
  // shares the same client-resolution fast path (storeWeeklySummary lookup
  // first) as /api/roster/store-overview, so it's just as fast on repeat
  // views of a store the rep already opened.
  app.get("/api/roster/sku-list", async (req, res) => {
    try {
      const store = String(req.query.store || "").trim();
      const repName = String(req.query.rep || "").trim();
      const classification = String(req.query.classification || "oos").trim();
      if (!store) {
        return res.status(400).json({ error: "store query param is required" });
      }
      if (!["oos", "low", "overstock", "risk", "distribution", "cover", "negsoh"].includes(classification)) {
        return res.status(400).json({ error: "classification must be 'oos', 'low', 'overstock', 'risk', 'distribution', 'cover', or 'negsoh'" });
      }

      let clientScope = "SYNDICATED";
      if (repName) {
        const [rosterRow] = await db
          .select({ clientScope: resourceRoster.clientScope })
          .from(resourceRoster)
          .where(sql`upper(trim(${resourceRoster.resourceName})) = ${repName.toUpperCase().trim()}`)
          .limit(1);
        if (rosterRow?.clientScope) clientScope = rosterRow.clientScope;
      }

      // Explicit client override from the Client filter on Store Overview -
      // without this, a syndicated rep who switches client on the overview
      // page had that choice silently dropped on drill-in: this endpoint
      // picked whichever client's row happened to sort first out of
      // storeWeeklySummary, with no relation to the overview's own pick or
      // the user's selection (real bug found 2026-08-13: overview showed
      // 11 OOS for one client, drilling in showed 0 for a different one).
      const explicitClient = String(req.query.client || "").trim();
      if (explicitClient && explicitClient !== "ALL") clientScope = explicitClient;

      // Security fix 2026-08-16: "All Clients" must only fan out across
      // every client for a SYNDICATED (non-dedicated) rep. Without the
      // clientScope check, a P&G-dedicated rep selecting "All Clients"
      // would see every other client's data too (confirmed real - a P&G
      // dedicated rep saw Aquelle's SKU here). Matches the same guard
      // already correctly used in /api/roster/store-overview above.
      if (explicitClient === "ALL" && clientScope === "SYNDICATED") {
        const allSummaryRows = await db
          .select({ client: storeWeeklySummary.client, weekEnding: storeWeeklySummary.weekEnding })
          .from(storeWeeklySummary)
          .where(sql`upper(trim(${storeWeeklySummary.cleanedStoreName})) = ${store.toUpperCase().trim()}`)
          .orderBy(sql`${storeWeeklySummary.weekEnding} DESC`);
        const latestWeek = allSummaryRows[0]?.weekEnding;
        const realClients = Array.from(new Set(allSummaryRows.filter((r) => r.weekEnding === latestWeek).map((r) => r.client)));
        if (realClients.length > 0) {
          return res.json(await buildAllClientsSkuList(store, classification, realClients));
        }
      }

      const summaryRows = await db
        .select()
        .from(storeWeeklySummary)
        .where(sql`upper(trim(${storeWeeklySummary.cleanedStoreName})) = ${store.toUpperCase().trim()}`)
        .orderBy(sql`${storeWeeklySummary.weekEnding} DESC`)
        .limit(1);
      const knownClient = clientScope === "SYNDICATED" ? summaryRows[0]?.client : undefined;

      if (classification === "risk") {
        const skuList = await fetchStoreSkuListFast(clientScope, store, knownClient);
        const atRiskRows = computeAtRiskRows(skuList.rows).map((r) => ({
          barcode: r.barcode,
          articleDescription: r.articleDescription,
          storeSoh: r.storeSoh,
          dcSoh: r.dcSoh,
          sellOutP4: r.sellOutP4,
          cover: r.cover,
          estimatedMissedUnits: r.estimatedMissedUnits,
          action: "Monitor cover — replenish before it becomes Out of Stock",
          classification: "At Risk",
          issueDriver: null,
          // Same real 4-week target-cover formula as Low Stock/OOS
          // (confirmed 2026-08-13: At Risk stays on the one confirmed
          // target - no separate 3-week/pack-rounding rule was verified).
          suggestedOrderUnits: typeof r.avgWeeklySales === "number"
            ? Math.max(0, Math.round(TARGET_COVER_WEEKS * r.avgWeeklySales - r.storeSoh))
            : null,
          dcFulfillableUnits: null,
        }));
        return res.json({ storeName: store, resolvedClient: skuList.resolvedClient, rows: atRiskRows });
      }

      if (classification === "cover") {
        const skuList = await fetchStoreSkuListFast(clientScope, store, knownClient);
        // Cover Analysis needs every in-stock SKU's WFC, not just the
        // at-risk-threshold subset - real Nexus classification tiers
        // (confirmed in aggregate_duckdb.py) are reused as band labels:
        // <1 Critical, 1-2 Low, 2-6 Optimal, >6 Overstock.
        const coverRows = skuList.rows
          .filter((r) => r.storeSoh > 0 && r.cover !== null)
          .sort((a, b) => (a.cover ?? 0) - (b.cover ?? 0))
          .map((r) => ({
            barcode: r.barcode,
            articleDescription: r.articleDescription,
            storeSoh: r.storeSoh,
            dcSoh: r.dcSoh,
            sellOutP4: r.sellOutP4,
            cover: r.cover,
            estimatedMissedUnits: r.estimatedMissedUnits,
            action: "Review cover levels",
            classification: r.classification,
            issueDriver: null,
            suggestedOrderUnits: null,
            dcFulfillableUnits: null,
            sourceStem: r.sourceStem ?? null,
          }));
        return res.json({ storeName: store, resolvedClient: skuList.resolvedClient, rows: coverRows });
      }

      if (classification === "negsoh") {
        const skuList = await fetchStoreSkuListFast(clientScope, store, knownClient);
        // Real Nexus field (negSOHCount on store_current) - a store shrinkage/
        // data-integrity signal, not a normal stock-level classification.
        const negRows = skuList.rows
          .filter((r) => r.storeSoh < 0)
          .sort((a, b) => a.storeSoh - b.storeSoh)
          .map((r) => ({
            barcode: r.barcode,
            articleDescription: r.articleDescription,
            storeSoh: r.storeSoh,
            dcSoh: r.dcSoh,
            sellOutP4: r.sellOutP4,
            cover: r.cover,
            estimatedMissedUnits: r.estimatedMissedUnits,
            action: "Investigate stock count discrepancy",
            classification: "Negative SOH",
            issueDriver: null,
            suggestedOrderUnits: null,
            dcFulfillableUnits: null,
          }));
        return res.json({ storeName: store, resolvedClient: skuList.resolvedClient, rows: negRows });
      }

      if (classification === "distribution") {
        const [gaps, skuList] = await Promise.all([
          fetchDistributionGapsForStoreFast(clientScope, store, knownClient),
          fetchStoreSkuListFast(clientScope, store, knownClient),
        ]);
        const gapRows = gaps.rows.map((r) => ({
          barcode: r.barcode,
          articleDescription: r.articleDescription,
          storeSoh: 0,
          dcSoh: null,
          sellOutP4: null,
          cover: null,
          estimatedMissedUnits: 0,
          action: r.suggestedAction,
          classification: r.gapType || "Distribution Gap",
          issueDriver: null,
          suggestedOrderUnits: null,
          dcFulfillableUnits: null,
        }));
        // Info-only stats (Carin, 2026-08-13: distribution gaps are a
        // ranging/supply-chain decision, not something a rep/merchandiser
        // can action in-store) - rangedSkus is the store's own real ranged
        // count from store_sku_current; avgCoveragePct is Nexus's own real
        // per-store coverage figure, not something we compute ourselves.
        return res.json({
          storeName: store,
          resolvedClient: knownClient || clientScope,
          rows: gapRows,
          missingSkus: gaps.missingSkus,
          rangedSkus: skuList.rows.length,
          avgCoveragePct: gaps.avgCoverage,
        });
      }

      // Fast local path 2026-08-16 for the main OOS/Low/Overstock lists -
      // was still calling live Nexus (fetchIssueDetailList) on every
      // request, the one classification list that hadn't been migrated yet.
      // Optional ?priority=P1 filters to just that priority tier (e.g. the
      // Fix screen's "Out of Stock - Critical" / "Low Stock - Critical"
      // buckets, split out 2026-08-16 instead of one combined P1 count).
      const sourceStemFilter = classification === "oos" ? "oos" : classification === "low" ? "low" : "overstock";
      const priorityFilter = String(req.query.priority || "").trim();
      const skuList = await fetchStoreSkuListFast(clientScope, store, knownClient);
      let filteredRows = skuList.rows.filter((r) => r.sourceStem === sourceStemFilter);
      if (priorityFilter) {
        filteredRows = filteredRows.filter((r) => String(r.priority || "").startsWith(priorityFilter));
      }
      const listRows = filteredRows.map((r) => ({
        barcode: r.barcode,
        articleDescription: r.articleDescription,
        client: r.client,
        storeSoh: r.storeSoh,
        dcSoh: r.dcSoh,
        sellOutP4: r.sellOutP4,
        cover: r.cover,
        estimatedMissedUnits: r.estimatedMissedUnits,
        action: r.issueDriver === "DC Constraint"
          ? "DC has no stock (supply constraint) - escalate the order, not fixable on-shelf"
          : "Review stock levels",
        classification: r.classification,
        issueDriver: r.issueDriver ?? null,
        suggestedOrderUnits: r.suggestedOrderUnits ?? null,
        dcFulfillableUnits: r.dcFulfillableUnits ?? null,
      }));
      res.json({ storeName: store, resolvedClient: skuList.resolvedClient, rows: listRows });
    } catch (error) {
      console.error("Error fetching SKU list:", error);
      res.status(500).json({ error: "Failed to fetch SKU list" });
    }
  });

  // Real per-SKU history across the real weeks Nexus has ranged this SKU
  // at this store - see fetchSkuHistory's comment for why this is slower
  // (13 live calls) than everything else and only called on-demand.
  app.get("/api/roster/sku-history", scopeToClient, async (req, res) => {
    try {
      const store = String(req.query.store || "").trim();
      const repName = String(req.query.rep || "").trim();
      const barcode = String(req.query.barcode || "").trim();
      if (!store || !barcode) {
        return res.status(400).json({ error: "store and barcode query params are required" });
      }

      let clientScope = "SYNDICATED";
      if (repName) {
        const [rosterRow] = await db
          .select({ clientScope: resourceRoster.clientScope })
          .from(resourceRoster)
          .where(sql`upper(trim(${resourceRoster.resourceName})) = ${repName.toUpperCase().trim()}`)
          .limit(1);
        if (rosterRow?.clientScope) clientScope = rosterRow.clientScope;
      }

      // Same explicit override as sku-list/store-overview - see comment there.
      // Bug fixed 2026-08-16: missing the "!== ALL" guard meant a SKU opened
      // from the "All Clients" merged list got clientScope literally set to
      // the string "ALL" - not a real client, so the history query matched
      // zero rows and the trend stayed stuck on "Building history..." forever.
      const explicitClient = String(req.query.client || "").trim();
      if (explicitClient && explicitClient !== "ALL") clientScope = explicitClient;

      const summaryRows = await db
        .select()
        .from(storeWeeklySummary)
        .where(sql`upper(trim(${storeWeeklySummary.cleanedStoreName})) = ${store.toUpperCase().trim()}`)
        .orderBy(sql`${storeWeeklySummary.weekEnding} DESC`)
        .limit(1);
      const knownClient = clientScope === "SYNDICATED" ? summaryRows[0]?.client : undefined;

      const result = await fetchSkuHistoryFast(clientScope, store, barcode, knownClient);
      res.json(result);
    } catch (error) {
      console.error("Error fetching SKU history:", error);
      res.status(500).json({ error: "Failed to fetch SKU history" });
    }
  });

  const STOCKFIX_QR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 33 33" shape-rendering="crispEdges"><path fill="#FFFFFF" d="M0 0h33v33H0z"/><path stroke="#003B71" d="M2 2.5h7m2 0h1m1 0h1m2 0h1m4 0h1m2 0h7M2 3.5h1m5 0h1m1 0h1m3 0h2m3 0h4m1 0h1m5 0h1M2 4.5h1m1 0h3m1 0h1m4 0h2m2 0h1m2 0h1m1 0h1m1 0h1m1 0h3m1 0h1M2 5.5h1m1 0h3m1 0h1m3 0h1m1 0h2m2 0h1m5 0h1m1 0h3m1 0h1M2 6.5h1m1 0h3m1 0h1m1 0h1m1 0h4m2 0h4m2 0h1m1 0h3m1 0h1M2 7.5h1m5 0h1m2 0h1m4 0h3m1 0h2m2 0h1m5 0h1M2 8.5h7m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h7M12 9.5h2m3 0h1m1 0h1m1 0h2M2 10.5h1m1 0h1m1 0h1m1 0h1m5 0h1m3 0h2m1 0h2m3 0h1m2 0h1M3 11.5h5m4 0h2m1 0h1m1 0h3m2 0h3m2 0h1m2 0h1M2 12.5h1m2 0h1m2 0h1m5 0h1m1 0h3m1 0h1m1 0h1m2 0h1m2 0h3M2 13.5h4m5 0h1m3 0h2m1 0h4m2 0h2m3 0h1M4 14.5h1m1 0h3m2 0h2m3 0h2m1 0h1m3 0h2m2 0h1m1 0h2M2 15.5h2m3 0h1m5 0h1m2 0h2m1 0h2m1 0h3m2 0h1m2 0h1M8 16.5h1m2 0h1m1 0h1m1 0h1m4 0h1m2 0h3m1 0h1m1 0h2M2 17.5h2m1 0h1m3 0h1m4 0h1m2 0h1m1 0h1m1 0h4m1 0h2m1 0h1M3 18.5h1m1 0h1m1 0h2m4 0h2m3 0h2m2 0h3m2 0h1m1 0h2M3 19.5h1m3 0h1m1 0h1m5 0h1m1 0h4m1 0h3m2 0h2m1 0h1M2 20.5h1m2 0h1m1 0h3m2 0h1m1 0h1m1 0h3m1 0h1m1 0h1m3 0h1m2 0h2M3 21.5h1m2 0h2m2 0h1m2 0h1m1 0h2m1 0h2m7 0h1m1 0h1M2 22.5h1m1 0h7m1 0h1m1 0h1m1 0h2m2 0h1m1 0h5M10 23.5h2m4 0h2m4 0h1m3 0h1m1 0h3M2 24.5h7m3 0h1m2 0h1m3 0h1m1 0h2m1 0h1m1 0h2m1 0h2M2 25.5h1m5 0h1m3 0h2m3 0h1m4 0h1m3 0h2m2 0h1M2 26.5h1m1 0h3m1 0h1m1 0h3m1 0h1m3 0h1m3 0h5M2 27.5h1m1 0h3m1 0h1m2 0h1m2 0h2m1 0h3m1 0h2m3 0h1m1 0h1M2 28.5h1m1 0h3m1 0h1m1 0h1m3 0h1m1 0h3m1 0h2m1 0h1m1 0h3m2 0h1M2 29.5h1m5 0h1m2 0h1m3 0h1m2 0h7m1 0h1m2 0h1M2 30.5h7m1 0h1m1 0h2m1 0h1m1 0h1m2 0h1m1 0h1m1 0h1m1 0h2m1 0h2"/></svg>`;

  app.get('/api/qrcode', (_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>StockFix QR Code</title><style>body{margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#fff;font-family:Arial,sans-serif;flex-direction:column}h1{color:#003B71;margin-bottom:20px;font-size:24px}</style></head><body><h1>StockFix</h1>${STOCKFIX_QR_SVG.replace('crispEdges">', 'crispEdges" width="400" height="400">')}<p style="margin-top:20px;color:#666">Scan to open StockFix</p></body></html>`);
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
  app.get("/api/dashboard/stats", scopeToClient, async (req, res) => {
    try {
      const regionFilter = req.query.region as string | undefined;
      const clientFilter = req.query.client as string | undefined;
      
      // Check cache first
      const cacheKey = `dashboard_${regionFilter || 'all'}_${clientFilter || 'all'}`;
      const cached = dashboardStatsCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < DASHBOARD_CACHE_TTL_MS) {
        return res.json(cached.data);
      }
      
      // Get latest week for filtering - use most populated week to avoid partial import issues
      const latestWeek = await storage.getMostPopulatedWeekEndingDate();
      
      // Use optimized SQL-based method instead of loading all tasks
      const result = await storage.getDashboardStatsOptimized({
        region: regionFilter,
        client: clientFilter,
        weekEndingDate: latestWeek || undefined,
      });
      
      const response = {
        totalTasks: result.totalTasks,
        totalStores: result.filters.stores.length,
        totalP4WeekSales: result.totalP4WeekSales,
        pendingCount: result.statusCounts['Pending'] || 0,
        completedCount: result.statusCounts['Completed'] || 0,
        statusCounts: result.statusCounts,
        actionBreakdown: result.actionBreakdown,
        topStores: result.topStores,
        topReps: result.topReps,
        clients: result.clients,
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
  app.get("/api/top-attention-skus", scopeToClient, async (req, res) => {
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

      // Only show outstanding (non-completed) tasks as critical SKUs
      latestWeekTasks = latestWeekTasks.filter(t => t.actionStatus !== "Completed");

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

      // Final fallback — fill any remaining slots with all pending tasks by score
      if (topSkus.length < 5) {
        const remaining = [...scoredTasks].sort((a, b) => b.attentionScore - a.attentionScore);
        for (const task of remaining) {
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
  app.get("/api/store-overview", scopeToClient, async (req, res) => {
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
      const latestWeek = includeAll ? undefined : await storage.getLatestWeekEndingDateForStore(storeName);
      
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
      const latestWeek = await storage.getMostPopulatedWeekEndingDate();
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
        : await storage.getMostPopulatedWeekEndingDate();
      
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
  app.get("/api/tasks", scopeToClient, async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const search = (req.query.search as string) || '';
      const status = (req.query.status as string) || '';
      const includeAll = req.query.includeAll === 'true';
      
      const storeVal = (req.query.store as string) || '';
      const repVal = (req.query.rep as string) || '';
      
      // Get latest week ending date unless includeAll is true
      // Use store-specific latest week when store/rep filters are set to avoid week mismatch
      let weekEndingDate = '';
      if (!includeAll) {
        const latestWeek = storeVal
          ? await storage.getLatestWeekEndingDateForStore(storeVal, repVal || undefined)
          : await storage.getMostPopulatedWeekEndingDate();
        weekEndingDate = latestWeek || '';
      }
      
      const clientVal = (req.query.client as string) || '';
      const articleVal = (req.query.article as string) || '';
      
      const filters = {
        region: (req.query.region as string) || '',
        rep: repVal,
        store: storeVal,
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
      const latestWeek = await storage.getMostPopulatedWeekEndingDate();
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
      const latestWeek = await storage.getMostPopulatedWeekEndingDate();
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

  // POST /api/tasks/save-to-sharepoint — build this week's CSV and upload to SharePoint
  app.post("/api/tasks/save-to-sharepoint", async (req, res) => {
    try {
      const latestWeek = await storage.getMostPopulatedWeekEndingDate();
      if (!latestWeek) {
        return res.status(404).json({ ok: false, error: "No tasks found" });
      }
      const totalCount = await storage.getTaskCountByWeek(latestWeek);
      console.log(`SharePoint export: building CSV for week ${latestWeek} (${totalCount} rows)...`);

      const escapeCSV = (val: string | number | null | undefined): string => {
        if (val === null || val === undefined) return '';
        const str = String(val).replace(/[\r\n]+/g, ' ').trim();
        if (str.includes(',') || str.includes('"') || str.includes('\t')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const csvHeaders = [
        'Unique Id', 'Key', 'client', 'BANNER.1', 'REGION.1', 'cleaned store name',
        'REP NAME', 'LINE MANAGER', 'Category', 'barcode', 'article description',
        'Supplying dc soh', 'Store SOH', 'Sell out p4 weeks', 'Missed Sales (This Week)',
        'WFC', 'Stock Classification (This Week)', 'week ending', 'Action Column',
        'Action Date', 'Action Status', 'physicalCount', 'variance', 'systemAdjusted',
        'reasonCode', 'actionTakenComment', 'feedback', 'captureDate', 'image1', 'image2', 'image3', 'image4'
      ];

      const lines: string[] = ['\ufeff' + csvHeaders.join(',')];
      const BATCH_SIZE = 2000;
      let offset = 0;

      while (offset < totalCount) {
        const batch = await storage.getTasksBatchByWeek(latestWeek, offset, BATCH_SIZE);
        if (batch.length === 0) break;
        for (const task of batch) {
          lines.push([
            escapeCSV(task.uniqueId), escapeCSV(task.key), escapeCSV(task.client),
            escapeCSV(task.banner), escapeCSV(task.region), escapeCSV(task.storeName),
            escapeCSV(task.repName), escapeCSV(task.lineManager), escapeCSV(task.category),
            escapeCSV(task.barcode), escapeCSV(task.articleDescription),
            escapeCSV(task.dcSoh), escapeCSV(task.storeSoh), escapeCSV(task.p4WeekSales),
            escapeCSV(task.missedSales), escapeCSV(task.storeWfc), escapeCSV(task.stockClassification),
            escapeCSV(task.weekEndingDate), escapeCSV(task.action), escapeCSV(task.actionDate),
            escapeCSV(task.actionStatus), escapeCSV(task.physicalCount), escapeCSV(task.variance),
            escapeCSV(task.systemAdjusted), escapeCSV(task.reasonCode), escapeCSV(task.actionTakenComment),
            escapeCSV(task.feedback), escapeCSV(task.captureDate),
            escapeCSV(task.image1), escapeCSV(task.image2), escapeCSV(task.image3), escapeCSV(task.image4),
          ].join(','));
        }
        offset += batch.length;
      }

      const csv = lines.join('\n');
      const filename = `stockfix-weekly-export-${latestWeek}.csv`;

      const { webUrl } = await uploadToSharePoint('Stock Fix/Reporting/Historical feedback', filename, csv);

      console.log(`SharePoint export complete: ${offset} rows → ${filename}`);
      res.json({ ok: true, filename, rows: offset, week: latestWeek, webUrl });
    } catch (error: any) {
      console.error('SharePoint weekly export error:', error);
      res.status(500).json({ ok: false, error: error.message || 'Upload failed' });
    }
  });

  // POST /api/tasks/save-to-sharepoint/completed — completed tasks only
  app.post("/api/tasks/save-to-sharepoint/completed", async (req, res) => {
    try {
      const latestWeek = await storage.getMostPopulatedWeekEndingDate();
      if (!latestWeek) {
        return res.status(404).json({ ok: false, error: "No tasks found" });
      }
      const totalCount = await storage.getTaskCountByWeek(latestWeek);

      const escapeCSV = (val: string | number | null | undefined): string => {
        if (val === null || val === undefined) return '';
        const str = String(val).replace(/[\r\n]+/g, ' ').trim();
        if (str.includes(',') || str.includes('"') || str.includes('\t')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const csvHeaders = [
        'Unique Id', 'Key', 'client', 'BANNER.1', 'REGION.1', 'cleaned store name',
        'REP NAME', 'LINE MANAGER', 'Category', 'barcode', 'article description',
        'Supplying dc soh', 'Store SOH', 'Sell out p4 weeks', 'Missed Sales (This Week)',
        'WFC', 'Stock Classification (This Week)', 'week ending', 'Action Column',
        'Action Date', 'Action Status', 'physicalCount', 'variance', 'systemAdjusted',
        'reasonCode', 'actionTakenComment', 'feedback', 'captureDate', 'image1', 'image2', 'image3', 'image4'
      ];

      const lines: string[] = ['\ufeff' + csvHeaders.join(',')];
      const BATCH_SIZE = 2000;
      let offset = 0;
      let completedRows = 0;

      while (offset < totalCount) {
        const batch = await storage.getTasksBatchByWeek(latestWeek, offset, BATCH_SIZE);
        if (batch.length === 0) break;
        for (const task of batch) {
          if ((task.actionStatus || '').toLowerCase() !== 'completed') continue;
          lines.push([
            escapeCSV(task.uniqueId), escapeCSV(task.key), escapeCSV(task.client),
            escapeCSV(task.banner), escapeCSV(task.region), escapeCSV(task.storeName),
            escapeCSV(task.repName), escapeCSV(task.lineManager), escapeCSV(task.category),
            escapeCSV(task.barcode), escapeCSV(task.articleDescription),
            escapeCSV(task.dcSoh), escapeCSV(task.storeSoh), escapeCSV(task.p4WeekSales),
            escapeCSV(task.missedSales), escapeCSV(task.storeWfc), escapeCSV(task.stockClassification),
            escapeCSV(task.weekEndingDate), escapeCSV(task.action), escapeCSV(task.actionDate),
            escapeCSV(task.actionStatus), escapeCSV(task.physicalCount), escapeCSV(task.variance),
            escapeCSV(task.systemAdjusted), escapeCSV(task.reasonCode), escapeCSV(task.actionTakenComment),
            escapeCSV(task.feedback), escapeCSV(task.captureDate),
            escapeCSV(task.image1), escapeCSV(task.image2), escapeCSV(task.image3), escapeCSV(task.image4),
          ].join(','));
          completedRows++;
        }
        offset += batch.length;
      }

      const csv = lines.join('\n');
      const filename = `stockfix_all_tasks (5).csv`;

      const { webUrl } = await uploadToSharePoint('Stock Fix/Stock Fix App Output Data/This weeks feedback file', filename, csv);

      console.log(`SharePoint completed export: ${completedRows} rows → ${filename}`);
      res.json({ ok: true, filename, rows: completedRows, week: latestWeek, webUrl });
    } catch (error: any) {
      console.error('SharePoint completed export error:', error);
      res.status(500).json({ ok: false, error: error.message || 'Upload failed' });
    }
  });

  // GET export this week's tasks as Excel - limited to 50k tasks for stability
  app.get("/api/tasks/export", async (req, res) => {
    try {
      console.log("Starting Excel export (this week only)...");
      
      // Get latest week
      const latestWeek = await storage.getMostPopulatedWeekEndingDate();
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
      const latestWeek = await storage.getMostPopulatedWeekEndingDate();
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
      const latestWeek = await storage.getMostPopulatedWeekEndingDate();
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

  // GET /api/tasks/all-json — full task export for external apps / Power BI
  // Default: latest week only. Pass ?week=all for all history, ?week=YYYY-MM-DD for a specific week.
  app.get('/api/tasks/all-json', async (req, res) => {
    try {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'application/json');

      const weekParam = (req.query.week as string) || 'latest';
      const clientParam = (req.query.client as string) || '';

      let weekFilter: string | null = null;
      if (weekParam === 'latest' || !weekParam) {
        weekFilter = await storage.getMostPopulatedWeekEndingDate();
      } else if (weekParam !== 'all') {
        weekFilter = weekParam;
      }

      const whereParts: string[] = [];
      if (weekFilter) {
        whereParts.push(`week_ending_date = '${weekFilter.replace(/'/g, "''")}'`);
      }
      if (clientParam) {
        whereParts.push(`client = '${clientParam.replace(/'/g, "''")}'`);
      }
      const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

      const result = await db.execute(sql`
        SELECT
          unique_id            AS "uniqueId",
          key,
          client,
          banner,
          region,
          store_name           AS "storeName",
          rep_name             AS "repName",
          line_manager         AS "lineManager",
          category,
          barcode,
          article_description  AS "articleDescription",
          dc_soh               AS "dcSoh",
          store_soh            AS "storeSoh",
          p4_week_sales        AS "p4WeekSales",
          missed_sales         AS "missedSales",
          store_wfc            AS "storeWfc",
          stock_classification AS "stockClassification",
          week_ending_date     AS "weekEndingDate",
          action,
          action_date          AS "actionDate",
          action_status        AS "actionStatus",
          physical_count       AS "physicalCount",
          variance,
          system_adjusted      AS "systemAdjusted",
          reason_code          AS "reasonCode",
          action_taken_comment AS "actionTakenComment",
          feedback,
          capture_date         AS "captureDate"
        FROM tasks
        ${sql.raw(whereClause)}
        ORDER BY week_ending_date DESC, rep_name, store_name
      `);

      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
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

      // Also purge dashboardStatsCache entries for this store so Critical SKUs
      // refresh immediately after a rep completes a task (don't serve stale list)
      for (const key of dashboardStatsCache.keys()) {
        if (key.startsWith(`top_attention_skus_${task.storeName}`)) {
          dashboardStatsCache.delete(key);
        }
      }
      
      // Send email notification only when task transitions from Pending to completed for the first time.
      // Check previous status to avoid duplicate emails on subsequent edits (e.g. adding photos/comments).
      // Only an explicit actionStatus change (Pending → non-Pending) triggers an email — not feedback or
      // reasonCode alone, which can arrive in follow-up PATCHes (photo uploads, comment edits) and would
      // otherwise cause duplicates if two requests race on a still-Pending task.
      const wasAlreadyActioned = task.actionStatus && task.actionStatus !== 'Pending';
      const isTaskCompletion = !wasAlreadyActioned &&
        !!(validated.actionStatus && validated.actionStatus !== 'Pending');
      
      console.log('[Task Update] isTaskCompletion:', isTaskCompletion, 'validated:', JSON.stringify(validated));
      
      const isCriticalSku = isPriorityTask(updated?.action);
      
      if (isTaskCompletion && updated && isCriticalSku) {
        console.log('[Task Update] Triggering email notification for critical SKU (action:', updated.action, ')...');
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

  // GET /api/nexus-tasks/resolve — added 2026-08-17 so action-capture.tsx
  // (opened from a specific SKU on the Insights/Fix flow: store+client+
  // classification+barcode) can find the real task row without having to
  // reconstruct the deterministic uniqueId string client-side (fragile -
  // store/client casing and whitespace would need to exactly match how
  // nexus-task-generation.ts built it). Matches on barcode + normalized
  // store/client + the classification's sourceStem suffix on uniqueId,
  // for the most recent week that SKU/issue has a task.
  app.get("/api/nexus-tasks/resolve", async (req, res) => {
    try {
      const store = (req.query.store as string) || "";
      const client = (req.query.client as string) || "";
      const classification = (req.query.classification as string) || "";
      const barcode = (req.query.barcode as string) || "";
      if (!store || !barcode || !classification) {
        return res.status(400).json({ error: "store, client, classification and barcode are required" });
      }
      const sourceStem = classification === "cover" ? "risk" : classification;

      const result = await db.execute(sql`
        select unique_id, rep_name, action_status
        from nexus_tasks
        where barcode = ${barcode}
          and upper(trim(store_name)) = upper(trim(${store}))
          and unique_id like ${'%\\_' + sourceStem + '\\_' + barcode}
        order by week_ending_date desc
        limit 1
      `);
      const rows = (result.rows || result) as any[];
      if (rows.length === 0) {
        return res.status(404).json({ error: "No task found for this SKU/issue" });
      }
      res.json({ uniqueId: rows[0].unique_id, repName: rows[0].rep_name, actionStatus: rows[0].action_status });
    } catch (error) {
      console.error("Error resolving Nexus task:", error);
      res.status(500).json({ error: "Failed to resolve task" });
    }
  });

  // POST /api/nexus-tasks/:uniqueId/claim — added 2026-08-16, separate from
  // the PATCH above on purpose (that one is the existing rep-facing endpoint
  // the live app already depends on - not touched). Auto-generated Nexus
  // tasks start with repName="Unassigned" when more than one person covers
  // a store; whoever captures it first calls this to claim credit. Identity
  // comes from the authenticated session (req.identity), never trusted from
  // the request body, so credit can't be spoofed.
  app.post("/api/nexus-tasks/:uniqueId/claim", requireIdentity, async (req, res) => {
    try {
      if (!req.identity?.resourceEmpId) {
        return res.status(401).json({ error: "Not identified - please log in again" });
      }
      const result = await claimTask(req.params.uniqueId, req.identity.resourceEmpId);
      if (!result.ok) {
        return res.status(400).json({ error: result.error });
      }
      res.json({ ok: true });
    } catch (error) {
      console.error("Error claiming Nexus task:", error);
      res.status(500).json({ error: "Failed to claim task" });
    }
  });

  // PATCH /api/nexus-tasks/:uniqueId — action-capture.tsx's completion
  // endpoint, mirroring PATCH /api/tasks/:uniqueId's field set exactly but
  // writing to nexus_tasks instead - keeps the real `tasks` table's existing
  // rep-facing PATCH (and everything that depends on it: gamification,
  // completion emails, dashboardStatsCache invalidation) completely
  // untouched by this newer, still-being-tested capture flow.
  app.patch("/api/nexus-tasks/:uniqueId", async (req, res) => {
    try {
      const updateSchema = z.object({
        actionStatus: z.string().optional(),
        reasonCode: z.string().nullable().optional(),
        actionTakenComment: z.string().nullable().optional(),
        feedback: z.string().nullable().optional(),
        physicalCount: z.string().nullable().optional(),
        variance: z.string().nullable().optional(),
        systemAdjusted: z.string().nullable().optional(),
        image1: z.string().nullable().optional(),
        image2: z.string().nullable().optional(),
        image3: z.string().nullable().optional(),
        image4: z.string().nullable().optional(),
      });
      const validated = updateSchema.parse(req.body);

      const [existing] = await db.select().from(nexusTasks).where(eq(nexusTasks.uniqueId, req.params.uniqueId)).limit(1);
      if (!existing) {
        return res.status(404).json({ error: "Task not found" });
      }

      const updates: any = { ...validated, updatedAt: new Date() };
      if ((validated.actionStatus && validated.actionStatus !== "Pending") || validated.feedback || validated.reasonCode) {
        if (!existing.actionDate) {
          updates.actionDate = new Date().toISOString().split("T")[0];
        }
        if (!existing.captureDate) {
          updates.captureDate = new Date().toISOString().split("T")[0];
        }
      }

      const [updated] = await db.update(nexusTasks).set(updates).where(eq(nexusTasks.uniqueId, req.params.uniqueId)).returning();
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating Nexus task:", error);
      res.status(500).json({ error: "Failed to update task" });
    }
  });

  // POST /api/external/capture — called by Perfect Store Pro when a rep submits
  // Requires X-API-Key header matching EXTERNAL_API_KEY env var
  app.post("/api/external/capture", async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    const expectedKey = process.env.EXTERNAL_API_KEY;
    if (!expectedKey || apiKey !== expectedKey) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const captureSchema = z.object({
        uniqueId: z.string(),
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
        image3: z.string().nullable().optional(),
        image4: z.string().nullable().optional(),
      });

      const validated = captureSchema.parse(req.body);
      const { uniqueId, ...updates } = validated;

      const task = await storage.getTaskByUniqueId(uniqueId);
      if (!task) {
        return res.status(404).json({ error: `Task not found: ${uniqueId}` });
      }

      const updatePayload: any = { ...updates };
      if ((updates.actionStatus && updates.actionStatus !== 'Pending') || updates.feedback || updates.reasonCode) {
        if (!task.actionDate) {
          updatePayload.actionDate = new Date().toISOString().split('T')[0];
        }
      }

      const updated = await storage.updateTask(task.id, updatePayload);
      invalidateGamificationCache();

      console.log(`[External Capture] Task ${uniqueId} updated by Perfect Store Pro`);
      res.json({ success: true, task: updated });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("[External Capture] Error:", error);
      res.status(500).json({ error: "Failed to record capture" });
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

      const parseToISODate = parseToISODateHelper;

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

      // Get latest week - use most populated to avoid partial import issues
      const latestWeek = await storage.getMostPopulatedWeekEndingDate();
      
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
      const latestWeek = await storage.getMostPopulatedWeekEndingDate();
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
      const latestWeek = await storage.getMostPopulatedWeekEndingDate();
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
      const client = req.query.client as string | undefined;
      const limit = parseInt(req.query.limit as string) || 10;
      const cacheKey = `leaderboard_${manager || 'all'}_${client || 'all'}`;
      
      let cachedData = getCachedGamificationStats(cacheKey);
      let allStats: RepGamificationStats[];
      let latestWeek: string | null;
      
      if (cachedData) {
        allStats = cachedData.stats;
        latestWeek = cachedData.weekEndingDate;
      } else {
        latestWeek = await storage.getMostPopulatedWeekEndingDate();
        if (!latestWeek) {
          return res.json({ leaderboard: [], teamStats: {}, totalReps: 0, weekEndingDate: null });
        }
        
        const [repStatsRaw, streaks] = await Promise.all([
          storage.getLeaderboardAggregated(latestWeek, client || undefined),
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
        latestWeek = await storage.getMostPopulatedWeekEndingDate();
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
      
      const latestWeek = await storage.getMostPopulatedWeekEndingDate();
      if (!latestWeek) {
        return res.json({ weekEndingDate: null, period, overall: {}, regionLeaderboard: [], managerLeaderboard: [], repLeaderboard: [], clientLeaderboard: [] });
      }
      
      console.log(`[Admin Leaderboard] period=${period}, latestWeek=${latestWeek}, clientFilter=${clientFilter}`);
      
      const [repStatsRaw, clientStatsRawAll, adminStreaks, actionBreakdownRaw, actionByClientRaw] = await Promise.all([
        storage.getLeaderboardAggregated(latestWeek, clientFilter || undefined),
        storage.getClientStatsAggregated(latestWeek),
        storage.getRepStreaks(),
        storage.getActionTypeBreakdown(latestWeek, clientFilter || undefined),
        storage.getActionBreakdownByClient(latestWeek),
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
        actionByClient: clientFilter ? actionByClientRaw.filter(c => c.client === clientFilter) : actionByClientRaw,
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

      const latestWeek = await storage.getMostPopulatedWeekEndingDate();
      
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

  app.post("/api/admin/restore-completions-from-history", async (_req, res) => {
    try {
      const result = await db.execute(sql`
        UPDATE tasks t
        SET
          action_status        = h.action_status,
          action_date          = h.action_date,
          physical_count       = h.physical_count,
          variance             = h.variance,
          system_adjusted      = h.system_adjusted,
          reason_code          = h.reason_code,
          action_taken_comment = h.action_taken_comment,
          feedback             = h.feedback,
          capture_date         = h.capture_date,
          image1               = h.image1,
          image2               = h.image2,
          image3               = h.image3,
          image4               = h.image4
        FROM pilot_tasks_history h
        WHERE t.unique_id = h.unique_id
          AND h.action_status = 'Completed'
          AND t.action_status != 'Completed'
      `);
      clearAllCaches();
      res.json({ success: true, restored: result.rowCount, message: `Restored ${result.rowCount} completed tasks from history.` });
    } catch (err: any) {
      console.error("Restore completions error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Restore captured task data — accepts pre-parsed JSON rows from client (avoids proxy file size limits)
  app.post("/api/import/restore-captures", async (req, res) => {
    const rows: any[] = req.body?.rows;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "No rows provided" });
    }
    console.log(`[restore-captures] received ${rows.length} rows as JSON`);
    try {
      const getValue = (row: any, ...keys: string[]) => {
        for (const key of keys) {
          for (const k of Object.keys(row)) {
            if (k.toLowerCase().replace(/[^a-z0-9]/g, '') === key.toLowerCase().replace(/[^a-z0-9]/g, '')) {
              const v = row[k];
              if (v !== null && v !== undefined && v !== '') return String(v).trim();
            }
          }
        }
        return '';
      };

      const backupDate = new Date();
      const insertRows: (typeof pilotCaptures.$inferInsert)[] = [];

      for (const row of rows) {
        const uniqueId = getValue(row, 'Unique Id', 'UniqueId', 'unique_id', 'uniqueid', 'ID');
        if (!uniqueId) continue;
        insertRows.push({
          backupDate,
          weekEndingDate:     getValue(row, 'Week Ending Date', 'WeekEndingDate', 'week_ending_date', 'Week Ending', 'week ending') || null,
          uniqueId,
          repName:            getValue(row, 'Rep Name', 'RepName', 'rep_name', 'REP NAME') || null,
          storeName:          getValue(row, 'Store Name', 'StoreName', 'store_name', 'cleaned store name') || null,
          client:             getValue(row, 'Client', 'client') || null,
          lineManager:        getValue(row, 'Line Manager', 'LineManager', 'line_manager', 'LINE MANAGER') || null,
          region:             getValue(row, 'Region', 'region', 'REGION.1') || null,
          banner:             getValue(row, 'Banner', 'banner', 'BANNER.1') || null,
          barcode:            getValue(row, 'Barcode', 'barcode') || null,
          articleDescription: getValue(row, 'Article Description', 'ArticleDescription', 'article_description', 'article description') || null,
          action:             getValue(row, 'Action', 'action', 'Action Column') || null,
          actionStatus:       getValue(row, 'Action Status', 'ActionStatus', 'action_status', 'Status', 'actionstatus') || 'Pending',
          reasonCode:         getValue(row, 'Reason Code', 'ReasonCode', 'reason_code', 'reasonCode') || null,
          feedback:           getValue(row, 'Feedback', 'feedback', 'Comments') || null,
          image1:             getValue(row, 'Image1', 'image1', 'Image 1', 'Photo 1') || null,
          image2:             getValue(row, 'Image2', 'image2', 'Image 2') || null,
          captureDate:        getValue(row, 'Capture Date', 'CaptureDate', 'capture_date', 'captureDate') || null,
          storeSoh:           getValue(row, 'Store SOH', 'StoreSoh', 'store_soh', 'Store SOH') || null,
          storeWfc:           getValue(row, 'WFC', 'StoreWfc', 'store_wfc') || null,
        });
      }

      if (insertRows.length > 0) {
        await db.insert(pilotCaptures).values(insertRows);
      }
      const backedUp = insertRows.length;

      clearAllCaches();
      res.json({ success: true, backedUp, message: `Saved ${backedUp} rows to pilot_captures. Live tasks were not affected.` });
    } catch (err: any) {
      console.error("Restore captures error:", err);
      res.status(500).json({ error: err.message || "Failed to restore captures" });
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

  app.get("/api/admin/dynamic-brands-regions", async (req, res) => {
    try {
      const result = await db.select({
        region: tasks.region,
        count: sql<number>`count(*)::int`
      })
      .from(tasks)
      .where(eq(tasks.client, 'DYNAMIC BRANDS'))
      .groupBy(tasks.region);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/delete-dynamic-brands-non-wc", async (req, res) => {
    try {
      const countBefore = await db.select({ count: sql<number>`count(*)::int` })
        .from(tasks)
        .where(and(
          eq(tasks.client, 'DYNAMIC BRANDS'),
          sql`${tasks.region} != 'WESTERN CAPE'`
        ));

      const deleted = await db.delete(tasks)
        .where(and(
          eq(tasks.client, 'DYNAMIC BRANDS'),
          sql`${tasks.region} != 'WESTERN CAPE'`
        ));

      clearAllCaches();
      res.json({
        success: true,
        message: `Deleted ${countBefore[0]?.count || 0} Dynamic Brands tasks where region is not Western Cape`
      });
    } catch (error: any) {
      console.error("Error deleting Dynamic Brands non-WC tasks:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Merchandiser Pilot Report (StockFix data only)
  // Pilot officially started 2026-07-01 — any task weeks before this are pre-pilot history
  // (reps existed in the system earlier but weren't yet using StockFix) and must be excluded.
  const PILOT_START_DATE = '2026-07-01';
  // Normalise region strings so "KwaZulu-Natal" / "KwaZulu Natal" / "KWAZULU NATAL" all map to one key
  const normalizeRegion = (r: string) => r.trim().toUpperCase().replace(/-/g, ' ');

  // ── Server-side cache for pilot base data (avoids hammering DB on every filter change) ──
  interface PilotBaseCache {
    ts: number;
    allPilotNames: string[];
    allWeeks: string[];
    allManagers: string[];
    allRegions: string[];
    allStores: string[];
    allBanners: string[];
    allReps: string[];
    allClients: string[];
    dataRows: any[];
    repRegionMap: Map<string, string>;
    repManagerMap: Map<string, string>;
  }
  const pilotBaseCache = new Map<string, PilotBaseCache>();
  const PILOT_CACHE_TTL_MS = 60_000; // 60 seconds

  async function getPilotBaseData(effectiveWeek: string | null): Promise<PilotBaseCache> {
    const cacheKey = effectiveWeek || '__none__';
    const cached = pilotBaseCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < PILOT_CACHE_TTL_MS) return cached;

    const pilotRepsResult = await db.execute(sql`SELECT rep_name, joined_date, active FROM pilot_reps`);
    const allPilotNames = (pilotRepsResult.rows as any[]).map(r => String(r.rep_name).trim().toUpperCase());

    const [weeksResult, managersResult, regionsResult, storesResult, bannersResult, repsResult, clientsResult, taskRows, repLookupRows] = await Promise.all([
      db.execute(sql`
        SELECT DISTINCT week_ending_date FROM (
          SELECT t.week_ending_date FROM tasks t
          JOIN pilot_reps pr ON UPPER(TRIM(pr.rep_name)) = UPPER(TRIM(t.rep_name))
          WHERE t.week_ending_date >= pr.joined_date
          UNION
          SELECT h.week_ending_date FROM pilot_tasks_history h
          JOIN pilot_reps pr ON UPPER(TRIM(pr.rep_name)) = UPPER(TRIM(h.rep_name))
          WHERE h.week_ending_date >= pr.joined_date
        ) w ORDER BY week_ending_date DESC`),
      db.execute(sql`SELECT DISTINCT UPPER(TRIM(t.line_manager)) as val FROM tasks t JOIN pilot_reps pr ON UPPER(TRIM(pr.rep_name)) = UPPER(TRIM(t.rep_name)) WHERE t.week_ending_date >= pr.joined_date AND t.line_manager IS NOT NULL AND t.line_manager != ''`),
      db.execute(sql`SELECT DISTINCT UPPER(TRIM(t.region)) as val FROM tasks t JOIN pilot_reps pr ON UPPER(TRIM(pr.rep_name)) = UPPER(TRIM(t.rep_name)) WHERE t.week_ending_date >= pr.joined_date AND t.region IS NOT NULL AND t.region != ''`),
      db.execute(sql`SELECT DISTINCT UPPER(TRIM(t.store_name)) as val FROM tasks t JOIN pilot_reps pr ON UPPER(TRIM(pr.rep_name)) = UPPER(TRIM(t.rep_name)) WHERE t.week_ending_date >= pr.joined_date AND t.store_name IS NOT NULL AND t.store_name != ''`),
      db.execute(sql`SELECT DISTINCT UPPER(TRIM(t.banner)) as val FROM tasks t JOIN pilot_reps pr ON UPPER(TRIM(pr.rep_name)) = UPPER(TRIM(t.rep_name)) WHERE t.week_ending_date >= pr.joined_date AND t.banner IS NOT NULL AND t.banner != ''`),
      db.execute(sql`SELECT DISTINCT UPPER(TRIM(t.rep_name)) as val FROM tasks t JOIN pilot_reps pr ON UPPER(TRIM(pr.rep_name)) = UPPER(TRIM(t.rep_name)) WHERE t.week_ending_date >= pr.joined_date`),
      db.execute(sql`SELECT DISTINCT UPPER(TRIM(t.client)) as val FROM tasks t JOIN pilot_reps pr ON UPPER(TRIM(pr.rep_name)) = UPPER(TRIM(t.rep_name)) WHERE t.week_ending_date >= pr.joined_date AND t.client IS NOT NULL AND t.client != ''`),
      db.execute(sql`
        SELECT DISTINCT ON (unique_id)
               rep_name, store_name, client, line_manager, region, banner,
               action_status, week_ending_date, unique_id, article_description,
               barcode, store_soh, store_wfc, action, reason_code, feedback, image1
        FROM (
          SELECT h.rep_name, h.store_name, h.client, h.line_manager, h.region, h.banner,
                 h.action_status, h.week_ending_date, h.unique_id, h.article_description,
                 h.barcode, h.store_soh, h.store_wfc, h.action, h.reason_code, h.feedback, h.image1,
                 1 AS src_priority
          FROM pilot_tasks_history h
          JOIN pilot_reps pr ON UPPER(TRIM(pr.rep_name)) = UPPER(TRIM(h.rep_name))
          WHERE h.week_ending_date >= pr.joined_date
            ${effectiveWeek ? sql`AND h.week_ending_date = ${effectiveWeek}` : sql``}

          UNION ALL

          SELECT t.rep_name, t.store_name, t.client, t.line_manager, t.region, t.banner,
                 t.action_status, t.week_ending_date, t.unique_id, t.article_description,
                 t.barcode, t.store_soh, t.store_wfc, t.action, t.reason_code, t.feedback, t.image1,
                 2 AS src_priority
          FROM tasks t
          JOIN pilot_reps pr ON UPPER(TRIM(pr.rep_name)) = UPPER(TRIM(t.rep_name))
          WHERE t.week_ending_date >= pr.joined_date
            ${effectiveWeek ? sql`AND t.week_ending_date = ${effectiveWeek}` : sql``}
        ) both_sources
        ORDER BY unique_id, src_priority
      `),
      db.execute(sql`
        SELECT UPPER(TRIM(rep_name)) AS rep_name, region, line_manager
        FROM (
          SELECT rep_name, region, line_manager, week_ending_date,
                 ROW_NUMBER() OVER (PARTITION BY UPPER(TRIM(rep_name)) ORDER BY week_ending_date DESC) AS rn
          FROM (
            SELECT rep_name, region, line_manager, week_ending_date FROM tasks
              WHERE region IS NOT NULL AND region != ''
            UNION ALL
            SELECT rep_name, region, line_manager, week_ending_date FROM pilot_tasks_history
              WHERE region IS NOT NULL AND region != ''
          ) all_rows
        ) ranked WHERE rn = 1
      `),
    ]);

    const repRegionMap  = new Map<string, string>();
    const repManagerMap = new Map<string, string>();
    for (const r of (repLookupRows.rows as any[])) {
      const key = String(r.rep_name).trim().toUpperCase();
      if (r.region)       repRegionMap.set(key,  normalizeRegion(String(r.region)));
      if (r.line_manager) repManagerMap.set(key, String(r.line_manager).trim().toUpperCase());
    }

    const allWeeks    = (weeksResult.rows as any[]).map(r => String(r.week_ending_date)).filter(d => d.match(/\d{4}-\d{2}-\d{2}/)).sort().reverse();
    const result: PilotBaseCache = {
      ts: Date.now(),
      allPilotNames,
      allWeeks,
      allManagers: (managersResult.rows as any[]).map(r => String(r.val)).filter(Boolean).sort(),
      allRegions:  [...new Set((regionsResult.rows as any[]).map(r => normalizeRegion(String(r.val))).filter(Boolean))].sort(),
      allStores:   (storesResult.rows   as any[]).map(r => String(r.val)).filter(Boolean).sort(),
      allBanners:  (bannersResult.rows  as any[]).map(r => String(r.val)).filter(Boolean).sort(),
      allReps:     (repsResult.rows     as any[]).map(r => String(r.val)).filter(Boolean).sort(),
      allClients:  (clientsResult.rows  as any[]).map(r => String(r.val)).filter(Boolean).sort(),
      dataRows:    (taskRows.rows as any[]).filter(r => r.rep_name),
      repRegionMap,
      repManagerMap,
    };
    pilotBaseCache.set(cacheKey, result);
    return result;
  }

  app.get('/api/pilot-report', async (req, res) => {
    try {
      const filterManager = (req.query.manager as string | undefined)?.toUpperCase();
      const filterRegion  = (req.query.region  as string | undefined) ? normalizeRegion(req.query.region as string) : undefined;
      const filterStore   = (req.query.store   as string | undefined)?.toUpperCase();
      const filterBanner  = (req.query.banner  as string | undefined)?.toUpperCase();
      const filterRep     = (req.query.rep     as string | undefined)?.toUpperCase();
      const filterWeek    = (req.query.week    as string | undefined)?.trim();
      const filterClient  = (req.query.client  as string | undefined)?.toUpperCase();
      const hasFilter = !!(filterManager || filterRegion || filterStore || filterBanner || filterRep || filterWeek || filterClient);

      // First pass: get weeks to know effectiveWeek before fetching task rows
      const weekProbe = await db.execute(sql`
        SELECT DISTINCT week_ending_date FROM (
          SELECT week_ending_date FROM tasks WHERE UPPER(TRIM(rep_name)) IN (SELECT UPPER(TRIM(rep_name)) FROM pilot_reps) AND week_ending_date >= ${PILOT_START_DATE}
          UNION
          SELECT week_ending_date FROM pilot_tasks_history WHERE UPPER(TRIM(rep_name)) IN (SELECT UPPER(TRIM(rep_name)) FROM pilot_reps) AND week_ending_date >= ${PILOT_START_DATE}
        ) w ORDER BY week_ending_date DESC LIMIT 1`);
      const latestWeekProbe = (weekProbe.rows as any[])[0]?.week_ending_date || null;
      const effectiveWeek = filterWeek || (latestWeekProbe ? String(latestWeekProbe) : null);

      const base = await getPilotBaseData(effectiveWeek);
      const { allPilotNames, allWeeks, allManagers, allRegions, allStores, allBanners, allReps, allClients, dataRows } = base;
      const latestWeek = allWeeks[0] || null;

      const filteredRows = dataRows.filter(r => {
        if (filterManager && String(r.line_manager || '').toUpperCase() !== filterManager) return false;
        if (filterRegion  && normalizeRegion(String(r.region || '')) !== filterRegion)  return false;
        if (filterStore   && String(r.store_name || '').toUpperCase() !== filterStore)   return false;
        if (filterBanner  && String(r.banner || '').toUpperCase() !== filterBanner)  return false;
        if (filterRep     && String(r.rep_name || '').toUpperCase() !== filterRep)     return false;
        if (filterClient  && String(r.client || '').toUpperCase() !== filterClient)  return false;
        return true;
      });

      // --- Task-level detail rows (article-level, for the store detail table) ---
      const taskDetail = filteredRows.slice(0, 3000).map(r => ({
        uniqueId: r.unique_id,
        storeName: String(r.store_name || '').trim(),
        repName: String(r.rep_name || '').trim(),
        articleDescription: String(r.article_description || '').trim(),
        barcode: String(r.barcode || '').trim(),
        storeSoh: r.store_soh,
        storeWfc: r.store_wfc,
        action: String(r.action || '').trim(),
        actionStatus: String(r.action_status || '').trim(),
        reasonCode: String(r.reason_code || '').trim(),
        feedback: String(r.feedback || '').trim(),
        imageUrl: r.image1 || null,
      }));

      // --- Build StockFix hierarchy: rep → store → clients ---
      type SFStore = { tasks: number; completed: number; clients: Set<string> };
      type SFRep   = { lineManager: string; region: string; tasks: number; completed: number; storeMap: Map<string, SFStore> };
      const sfByRep = new Map<string, SFRep>();

      for (const row of filteredRows) {
        const name = String(row.rep_name || '').trim().toUpperCase();
        if (!name) continue;
        const store     = String(row.store_name || '').trim().toUpperCase();
        const client    = String(row.client || '').trim();
        const completed = String(row.action_status || '').toLowerCase() === 'completed';

        if (!sfByRep.has(name)) sfByRep.set(name, {
          lineManager: String(row.line_manager || '').trim().toUpperCase(), region: normalizeRegion(String(row.region || '')),
          tasks: 0, completed: 0, storeMap: new Map(),
        });
        const sfRep = sfByRep.get(name)!;
        sfRep.tasks++;
        if (completed) sfRep.completed++;
        if (row.line_manager) sfRep.lineManager = String(row.line_manager).trim().toUpperCase();
        if (row.region) sfRep.region = normalizeRegion(String(row.region));

        if (!sfRep.storeMap.has(store)) sfRep.storeMap.set(store, { tasks: 0, completed: 0, clients: new Set() });
        const sfStore = sfRep.storeMap.get(store)!;
        sfStore.tasks++;
        if (completed) sfStore.completed++;
        if (client) sfStore.clients.add(client);
      }

      // --- Build merchandiser list (restricted to pilot reps only) ---
      const allNames = new Set(allPilotNames);
      const merchandisers = [...allNames].map(name => {
        const sf = sfByRep.get(name) || null;

        const stockFix = sf ? {
          tasks: sf.tasks, completed: sf.completed,
          captureRate: sf.tasks > 0 ? parseFloat(((sf.completed / sf.tasks) * 100).toFixed(1)) : 0,
          stores: [...sf.storeMap.entries()].map(([sName, d]) => ({
            name: sName, tasks: d.tasks, completed: d.completed,
            captureRate: d.tasks > 0 ? parseFloat(((d.completed / d.tasks) * 100).toFixed(1)) : 0,
            clients: [...d.clients],
          })).sort((a, b) => b.tasks - a.tasks),
        } : null;

        const overallRate = sf && sf.tasks > 0 ? parseFloat(((sf.completed / sf.tasks) * 100).toFixed(1)) : 0;
        const region      = sf?.region      || base.repRegionMap.get(name)  || null;
        const lineManager = sf?.lineManager || base.repManagerMap.get(name) || null;
        return { name, lineManager, region, stockFix, overallRate };
      }).sort((a, b) => {
        const aHas = !!a.stockFix, bHas = !!b.stockFix;
        if (aHas && !bHas) return -1; if (!aHas && bHas) return 1;
        return b.overallRate - a.overallRate || a.name.localeCompare(b.name);
      });

      // --- Summary KPIs ---
      const sfTotal = [...sfByRep.values()].reduce((s, r) => s + r.tasks, 0);
      const sfDone  = [...sfByRep.values()].reduce((s, r) => s + r.completed, 0);
      const summary = {
        stockFix: { total: sfTotal, completed: sfDone, captureRate: sfTotal > 0 ? parseFloat(((sfDone / sfTotal) * 100).toFixed(1)) : 0 },
        activeReps: merchandisers.filter(m => m.stockFix).length,
        repsWithTasks: merchandisers.filter(m => m.stockFix).length,
      };

      // --- Client summary (StockFix) ---
      const clientMap = new Map<string, { total: number; completed: number }>();
      for (const row of filteredRows) {
        const client = String(row.client || '').trim();
        if (!client) continue;
        const completed = String(row.action_status || '').toLowerCase() === 'completed';
        if (!clientMap.has(client)) clientMap.set(client, { total: 0, completed: 0 });
        const c = clientMap.get(client)!;
        c.total++;
        if (completed) c.completed++;
      }
      const sfClientSummary = [...clientMap.entries()]
        .map(([client, d]) => ({
          client, tasks: d.total, completed: d.completed,
          captureRate: d.total > 0 ? parseFloat(((d.completed / d.total) * 100).toFixed(1)) : 0,
        })).sort((a, b) => b.tasks - a.tasks);

      // --- Banner breakdown (StockFix) ---
      const bannerMap = new Map<string, { total: number; completed: number }>();
      for (const row of filteredRows) {
        const banner = String(row.banner || '').trim();
        if (!banner) continue;
        const completed = String(row.action_status || '').toLowerCase() === 'completed';
        if (!bannerMap.has(banner)) bannerMap.set(banner, { total: 0, completed: 0 });
        const b = bannerMap.get(banner)!;
        b.total++;
        if (completed) b.completed++;
      }
      const bannerBreakdown = [...bannerMap.entries()]
        .map(([banner, d]) => ({
          banner, total: d.total, completed: d.completed,
          captureRate: d.total > 0 ? parseFloat(((d.completed / d.total) * 100).toFixed(1)) : 0,
        })).sort((a, b) => b.total - a.total);

      // --- Manager breakdown (% captured by manager) ---
      const managerMap = new Map<string, { total: number; completed: number }>();
      for (const row of filteredRows) {
        const manager = String(row.line_manager || '').trim().toUpperCase();
        if (!manager) continue;
        const completed = String(row.action_status || '').toLowerCase() === 'completed';
        if (!managerMap.has(manager)) managerMap.set(manager, { total: 0, completed: 0 });
        const m = managerMap.get(manager)!;
        m.total++;
        if (completed) m.completed++;
      }
      const managerBreakdown = [...managerMap.entries()]
        .map(([manager, d]) => ({
          manager, total: d.total, completed: d.completed,
          captureRate: d.total > 0 ? parseFloat(((d.completed / d.total) * 100).toFixed(1)) : 0,
        })).sort((a, b) => b.captureRate - a.captureRate);

      // --- Region breakdown (% captured by region) ---
      const regionMap = new Map<string, { total: number; completed: number }>();
      for (const row of filteredRows) {
        const region = normalizeRegion(String(row.region || ''));
        if (!region) continue;
        const completed = String(row.action_status || '').toLowerCase() === 'completed';
        if (!regionMap.has(region)) regionMap.set(region, { total: 0, completed: 0 });
        const r = regionMap.get(region)!;
        r.total++;
        if (completed) r.completed++;
      }
      const regionBreakdown = [...regionMap.entries()]
        .map(([region, d]) => ({
          region, total: d.total, completed: d.completed,
          captureRate: d.total > 0 ? parseFloat(((d.completed / d.total) * 100).toFixed(1)) : 0,
        })).sort((a, b) => b.captureRate - a.captureRate);

      // --- Top / Bottom 5 merchandisers by capture % (only merch with activity) ---
      const activeMerch = merchandisers
        .filter(m => m.stockFix && m.stockFix.tasks > 0)
        .map(m => {
          const totalStores = m.stockFix!.stores.length;
          const storesActioned = m.stockFix!.stores.filter(s => s.completed > 0).length;
          return {
            name: m.name, lineManager: m.lineManager, region: m.region,
            pctStoresActioned: totalStores > 0 ? Math.round((storesActioned / totalStores) * 100) : 0,
            pctItemsActioned: m.stockFix!.captureRate,
          };
        });
      const top5Merchandisers = [...activeMerch].sort((a, b) => b.pctItemsActioned - a.pctItemsActioned).slice(0, 5);
      const bottom5Merchandisers = [...activeMerch].sort((a, b) => a.pctItemsActioned - b.pctItemsActioned).slice(0, 5);

      // --- Snapshot saving (StockFix data, unfiltered) ---
      // Only re-save once per week: skip entirely if this week's snapshots already exist,
      // and always do it as a single bulk statement (never a per-rep loop) to avoid
      // hundreds of sequential round-trips on every dashboard load.
      if (latestWeek && !hasFilter && sfByRep.size > 0) {
        const values = [...sfByRep.entries()].map(([name, d]) => {
          const rate = d.tasks > 0 ? Math.round((d.completed / d.tasks) * 100) : 0;
          return sql`(${latestWeek}, ${name}, ${d.lineManager || null}, ${d.region || null},
                  ${String(d.tasks)}, ${String(d.completed)}, ${String(d.tasks - d.completed)}, ${String(rate)}, NOW())`;
        });
        await db.execute(sql`
          INSERT INTO pilot_snapshots (week_ending_date, rep_name, line_manager, region, total_tasks, completed, pending, capture_rate, saved_at)
          VALUES ${sql.join(values, sql`, `)}
          ON CONFLICT (week_ending_date, rep_name)
          DO UPDATE SET line_manager=EXCLUDED.line_manager, region=EXCLUDED.region,
            total_tasks=EXCLUDED.total_tasks, completed=EXCLUDED.completed,
            pending=EXCLUDED.pending, capture_rate=EXCLUDED.capture_rate, saved_at=NOW()
        `);
      }

      // --- Rolling history — merge pilot_tasks_history + tasks, dedup by unique_id so partial
      //     snapshots (like 15 Jul) are supplemented by whatever is still in the tasks table ---
      const historyResult = await db.execute(sql`
        SELECT week_ending_date,
               COUNT(DISTINCT CASE WHEN LOWER(action_status) = 'completed' THEN UPPER(TRIM(rep_name)) END) AS rep_count,
               COUNT(*)                                                             AS total_tasks,
               COUNT(*) FILTER (WHERE LOWER(action_status) = 'completed')          AS total_completed,
               CASE WHEN COUNT(*) > 0
                 THEN ROUND(COUNT(*) FILTER (WHERE LOWER(action_status) = 'completed') * 100.0 / COUNT(*), 1)
                 ELSE 0 END                                                         AS capture_rate
        FROM (
          SELECT DISTINCT ON (unique_id) unique_id, rep_name, week_ending_date, action_status
          FROM (
            SELECT h.unique_id, h.rep_name, h.week_ending_date, h.action_status, 1 AS src_priority
            FROM pilot_tasks_history h
            JOIN pilot_reps pr ON UPPER(TRIM(pr.rep_name)) = UPPER(TRIM(h.rep_name))
            WHERE h.week_ending_date >= ${PILOT_START_DATE}
              AND h.week_ending_date >= pr.joined_date

            UNION ALL

            SELECT t.unique_id, t.rep_name, t.week_ending_date, t.action_status, 2 AS src_priority
            FROM tasks t
            JOIN pilot_reps pr ON UPPER(TRIM(pr.rep_name)) = UPPER(TRIM(t.rep_name))
            WHERE t.week_ending_date >= ${PILOT_START_DATE}
              AND t.week_ending_date >= pr.joined_date
          ) both_sources
          ORDER BY unique_id, src_priority
        ) deduped
        GROUP BY week_ending_date
        ORDER BY week_ending_date DESC
        LIMIT 12
      `);
      const history = (historyResult.rows as any[]).map(r => ({
        weekEndingDate: r.week_ending_date, repCount: Number(r.rep_count),
        totalTasks: Number(r.total_tasks), totalCompleted: Number(r.total_completed), captureRate: Number(r.capture_rate),
      }));

      res.json({
        latestWeek,
        filters: {
          managers: allManagers, regions: allRegions, stores: allStores, banners: allBanners, reps: allReps, weeks: allWeeks, clients: allClients,
          active: { manager: filterManager || null, region: filterRegion || null, store: filterStore || null, banner: filterBanner || null, rep: filterRep || null, week: filterWeek || null, client: filterClient || null },
        },
        summary, merchandisers, sfClientSummary, bannerBreakdown, managerBreakdown, regionBreakdown,
        top5Merchandisers, bottom5Merchandisers, taskDetail, history,
      });
    } catch (error: any) {
      console.error('Pilot report error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ── Pilot report CSV export — hit this URL from any automation tool ──
  // GET /api/pilot-report/export
  // Optional query params: week, manager, region, store, banner, rep, client
  // Defaults to latest week. Returns a CSV file attachment.
  app.get('/api/pilot-report/export', async (req, res) => {
    try {
      const filterManager = (req.query.manager as string | undefined)?.toUpperCase() || undefined;
      const filterRegion  = (req.query.region  as string | undefined) ? normalizeRegion(req.query.region as string) : undefined;
      const filterStore   = (req.query.store   as string | undefined)?.toUpperCase() || undefined;
      const filterBanner  = (req.query.banner  as string | undefined)?.toUpperCase() || undefined;
      const filterRep     = (req.query.rep     as string | undefined)?.toUpperCase() || undefined;
      const filterWeek    = (req.query.week    as string | undefined)?.trim() || undefined;
      const filterClient  = (req.query.client  as string | undefined)?.toUpperCase() || undefined;
      const filterStatus  = (req.query.status  as string | undefined)?.toLowerCase() || undefined; // 'completed' to restrict

      // Resolve effective week
      const weekProbe = await db.execute(sql`
        SELECT DISTINCT week_ending_date FROM (
          SELECT week_ending_date FROM tasks WHERE UPPER(TRIM(rep_name)) IN (SELECT UPPER(TRIM(rep_name)) FROM pilot_reps) AND week_ending_date >= ${PILOT_START_DATE}
          UNION
          SELECT week_ending_date FROM pilot_tasks_history WHERE UPPER(TRIM(rep_name)) IN (SELECT UPPER(TRIM(rep_name)) FROM pilot_reps) AND week_ending_date >= ${PILOT_START_DATE}
        ) w ORDER BY week_ending_date DESC LIMIT 1`);
      const latestWeek = (weekProbe.rows as any[])[0]?.week_ending_date ? String((weekProbe.rows as any[])[0].week_ending_date) : null;
      const effectiveWeek = filterWeek || latestWeek;

      const base = await getPilotBaseData(effectiveWeek);
      const { dataRows } = base;

      // Apply filters
      const rows = dataRows.filter(r => {
        if (filterManager && String(r.line_manager || '').toUpperCase() !== filterManager) return false;
        if (filterRegion  && normalizeRegion(String(r.region || '')) !== filterRegion)    return false;
        if (filterStore   && String(r.store_name || '').toUpperCase() !== filterStore)    return false;
        if (filterBanner  && String(r.banner || '').toUpperCase() !== filterBanner)       return false;
        if (filterRep     && String(r.rep_name || '').toUpperCase() !== filterRep)        return false;
        if (filterClient  && String(r.client || '').toUpperCase() !== filterClient)       return false;
        if (filterStatus === 'completed' && String(r.action_status || '').toLowerCase() !== 'completed') return false;
        return true;
      });

      const esc = (v: unknown) => {
        const s = v === null || v === undefined ? '' : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };

      const headers = ['Store','Merchandiser','Line Manager','Region','Banner','Client','Article','Barcode','SOH','WFC','Action','Status','Reason Code','Feedback','Image URL','Week Ending'];
      const lines = rows.map(r => [
        esc(r.store_name), esc(r.rep_name), esc(r.line_manager), esc(r.region), esc(r.banner), esc(r.client),
        esc(r.article_description), esc(r.barcode), esc(r.store_soh), esc(r.store_wfc),
        esc(r.action), esc(r.action_status), esc(r.reason_code), esc(r.feedback), esc(r.image1), esc(r.week_ending_date),
      ].join(','));

      const csv = [headers.join(','), ...lines].join('\n');
      const filename = `pilot-capture-${effectiveWeek || 'latest'}.csv`;

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (error: any) {
      console.error('Pilot export error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ── Save pilot CSV to SharePoint ──────────────────────────────────
  // POST /api/pilot-report/save-to-sharepoint
  // Optional query params: week, status=completed
  // Saves to: Stock Fix/Stock Fix App Output Data/This weeks feedback file/
  app.post('/api/pilot-report/save-to-sharepoint', async (req, res) => {
    try {
      const filterWeek   = (req.query.week   as string | undefined)?.trim() || undefined;
      const filterStatus = (req.query.status as string | undefined)?.toLowerCase() || undefined;

      // Resolve week
      const weekProbe = await db.execute(sql`
        SELECT DISTINCT week_ending_date FROM (
          SELECT week_ending_date FROM tasks WHERE UPPER(TRIM(rep_name)) IN (SELECT UPPER(TRIM(rep_name)) FROM pilot_reps) AND week_ending_date >= ${PILOT_START_DATE}
          UNION
          SELECT week_ending_date FROM pilot_tasks_history WHERE UPPER(TRIM(rep_name)) IN (SELECT UPPER(TRIM(rep_name)) FROM pilot_reps) AND week_ending_date >= ${PILOT_START_DATE}
        ) w ORDER BY week_ending_date DESC LIMIT 1`);
      const latestWeek = (weekProbe.rows as any[])[0]?.week_ending_date ? String((weekProbe.rows as any[])[0].week_ending_date) : null;
      const effectiveWeek = filterWeek || latestWeek;

      const base = await getPilotBaseData(effectiveWeek);
      let rows = base.dataRows;
      if (filterStatus === 'completed') {
        rows = rows.filter(r => String(r.action_status || '').toLowerCase() === 'completed');
      }

      const esc = (v: unknown) => {
        const s = v === null || v === undefined ? '' : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const headers = ['Store','Merchandiser','Line Manager','Region','Banner','Client','Article','Barcode','SOH','WFC','Action','Status','Reason Code','Feedback','Image URL','Week Ending'];
      const lines = rows.map(r => [
        esc(r.store_name), esc(r.rep_name), esc(r.line_manager), esc(r.region), esc(r.banner), esc(r.client),
        esc(r.article_description), esc(r.barcode), esc(r.store_soh), esc(r.store_wfc),
        esc(r.action), esc(r.action_status), esc(r.reason_code), esc(r.feedback), esc(r.image1), esc(r.week_ending_date),
      ].join(','));
      const csv = [headers.join(','), ...lines].join('\n');

      const suffix = filterStatus === 'completed' ? '-completed' : '-full';
      const filename = `pilot-capture-${effectiveWeek || 'latest'}${suffix}.csv`;

      const { webUrl } = await uploadToSharePoint('Stock Fix/Stock Fix App Output Data/This weeks feedback file', filename, csv);

      res.json({ ok: true, filename, rows: rows.length, week: effectiveWeek, webUrl });
    } catch (error: any) {
      console.error('SharePoint save error:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // Merchandiser Pilot — task detail for a specific rep + store (StockFix)
  app.get('/api/pilot-tasks', async (req, res) => {
    try {
      const rep   = (req.query.rep   as string || '').toUpperCase();
      const store = (req.query.store as string || '').toUpperCase();
      if (!rep || !store) return res.status(400).json({ error: 'rep and store required' });
      const result = await db.execute(sql`
        SELECT unique_id, client, category, article_description, barcode,
               action, action_status, action_date, feedback, reason_code,
               dc_soh, store_soh, missed_sales, stock_classification, week_ending_date
        FROM tasks
        WHERE UPPER(rep_name) = ${rep} AND UPPER(store_name) = ${store}
        ORDER BY client, article_description
        LIMIT 500
      `);
      res.json({ tasks: result.rows });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Merchandiser Pilot — recent activity (last completed SF tasks)
  app.get('/api/pilot-recent', async (req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT UPPER(rep_name) as rep_name, store_name, client, article_description,
               action, action_status, action_date, week_ending_date
        FROM tasks
        WHERE action_status = 'Completed' AND action_date IS NOT NULL
        ORDER BY action_date DESC, unique_id DESC
        LIMIT 20
      `);
      res.json({ activity: result.rows });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Performance — create indexes needed for the pilot report query (run once, idempotent)
  app.post('/api/admin/create-perf-indexes', async (req, res) => {
    try {
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_tasks_rep_name_upper_trim ON tasks (UPPER(TRIM(rep_name)))`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_tasks_week_ending_date ON tasks (week_ending_date)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_pilot_reps_rep_name_upper_trim ON pilot_reps (UPPER(TRIM(rep_name)))`);
      res.json({ created: true });
    } catch (err: any) {
      console.error('[PerfIndexes] error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Merchandiser Pilot — update rep list (handles joins, departures, new starters)
  app.post('/api/pilot-reps-update', async (req, res) => {
    try {
      const { names } = req.body;
      if (!Array.isArray(names) || names.length === 0) {
        return res.status(400).json({ error: 'Provide a names array in the request body' });
      }
      const today = new Date().toISOString().split('T')[0];
      const newSet = new Set(names.map((n: string) => n.trim().toUpperCase()).filter(Boolean));

      // Get current list
      const current = await db.execute(sql`SELECT rep_name, active FROM pilot_reps`);
      const currentRows = current.rows as any[];
      const currentSet = new Set(currentRows.map(r => String(r.rep_name).trim().toUpperCase()));

      // 1. Deactivate reps no longer on the list
      const toDeactivate = currentRows
        .filter(r => !newSet.has(String(r.rep_name).trim().toUpperCase()) && r.active)
        .map(r => r.rep_name);

      // 2. New reps not yet in the table
      const toAdd = [...newSet].filter(n => !currentSet.has(n));

      // 3. Reactivate reps that were inactive but are back
      const toReactivate = currentRows
        .filter(r => newSet.has(String(r.rep_name).trim().toUpperCase()) && !r.active)
        .map(r => r.rep_name);

      if (toDeactivate.length > 0) {
        await db.execute(sql`
          UPDATE pilot_reps SET active = false, left_date = ${today}
          WHERE UPPER(TRIM(rep_name)) = ANY(${toDeactivate.map(n => n.trim().toUpperCase())}::text[])
        `);
      }

      if (toAdd.length > 0) {
        const values = sql.join(toAdd.map(n => sql`(${n}, ${today}, true)`), sql`, `);
        await db.execute(sql`
          INSERT INTO pilot_reps (rep_name, joined_date, active)
          VALUES ${values}
          ON CONFLICT (rep_name) DO NOTHING
        `);
      }

      if (toReactivate.length > 0) {
        await db.execute(sql`
          UPDATE pilot_reps SET active = true, left_date = NULL
          WHERE UPPER(TRIM(rep_name)) = ANY(${toReactivate.map(n => n.trim().toUpperCase())}::text[])
        `);
      }

      // Clear pilot cache
      pilotBaseCache.clear();

      const finalCount = await db.execute(sql`SELECT COUNT(*) as c, COUNT(CASE WHEN active THEN 1 END) as active_c FROM pilot_reps`);
      const row = (finalCount.rows[0] as any);
      res.json({
        success: true,
        deactivated: toDeactivate.length,
        added: toAdd.length,
        reactivated: toReactivate.length,
        totalReps: Number(row.c),
        activeReps: Number(row.active_c),
      });
    } catch (err: any) {
      console.error('[PilotRepsUpdate] error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Merchandiser Pilot — seed history from current tasks (run once after first deploy)
  app.post('/api/pilot-reps-seed', async (req, res) => {
    try {
      const names: string[] = Array.isArray(pilotRepsSeed) ? pilotRepsSeed : [];
      const trimmedNames = Array.from(new Set(names.map(n => (n || '').trim()).filter(Boolean)));
      if (trimmedNames.length === 0) {
        return res.status(400).json({ error: 'No pilot rep names found in seed file' });
      }
      const beforeResult = await db.execute(sql`SELECT COUNT(*)::int AS count FROM pilot_reps`);
      const before = (beforeResult.rows[0] as any)?.count ?? 0;

      const values = sql.join(trimmedNames.map(n => sql`(${n})`), sql`, `);
      await db.execute(sql`
        INSERT INTO pilot_reps (rep_name)
        VALUES ${values}
        ON CONFLICT (rep_name) DO NOTHING
      `);

      const afterResult = await db.execute(sql`SELECT COUNT(*)::int AS count FROM pilot_reps`);
      const total = (afterResult.rows[0] as any)?.count ?? 0;
      res.json({ seeded: true, namesInFile: trimmedNames.length, newlyInserted: total - before, totalPilotReps: total });
    } catch (err: any) {
      console.error('[PilotRepsSeed] error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/pilot-seed-history', async (req, res) => {
    try {
      const result = await db.execute(sql`
        INSERT INTO pilot_tasks_history (
          unique_id, key, client, banner, region, store_name, rep_name, line_manager,
          category, barcode, article_description, dc_soh, store_soh, p4_week_sales,
          missed_sales, store_wfc, stock_classification, week_ending, week_ending_date,
          action, action_date, action_status, physical_count, variance, system_adjusted,
          reason_code, action_taken_comment, feedback, capture_date,
          image1, image2, image3, image4, saved_at
        )
        SELECT
          unique_id, key, client, banner, region, store_name, rep_name, line_manager,
          category, barcode, article_description, dc_soh, store_soh, p4_week_sales,
          missed_sales, store_wfc, stock_classification, week_ending, week_ending_date,
          action, action_date, action_status, physical_count, variance, system_adjusted,
          reason_code, action_taken_comment, feedback, capture_date,
          image1, image2, image3, image4, NOW()
        FROM tasks
        WHERE UPPER(TRIM(rep_name)) IN (SELECT UPPER(TRIM(rep_name)) FROM pilot_reps)
        ON CONFLICT (unique_id) DO UPDATE SET
          action_status        = EXCLUDED.action_status,
          action_date          = EXCLUDED.action_date,
          physical_count       = EXCLUDED.physical_count,
          variance             = EXCLUDED.variance,
          system_adjusted      = EXCLUDED.system_adjusted,
          reason_code          = EXCLUDED.reason_code,
          action_taken_comment = EXCLUDED.action_taken_comment,
          feedback             = EXCLUDED.feedback,
          capture_date         = EXCLUDED.capture_date,
          image1               = EXCLUDED.image1,
          image2               = EXCLUDED.image2,
          image3               = EXCLUDED.image3,
          image4               = EXCLUDED.image4,
          saved_at             = EXCLUDED.saved_at
      `);
      res.json({ seeded: true, message: 'Pilot task history seeded from current tasks table.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Merchandiser Pilot — Excel download
  app.get('/api/pilot-export-xlsx', async (req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT
          unique_id          AS "Unique Id",
          key                AS "Key",
          client             AS "client",
          banner             AS "BANNER",
          region             AS "REGION",
          store_name         AS "cleaned ss",
          rep_name           AS "REP NAME",
          line_manager       AS "LINE MAN",
          category           AS "Category",
          barcode            AS "barcode",
          article_description AS "article des",
          dc_soh             AS "Supplying c",
          store_soh          AS "Store SOH",
          p4_week_sales      AS "Sell out pd",
          missed_sales       AS "Missed Sal",
          store_wfc          AS "WFC",
          stock_classification AS "Stock Clas",
          week_ending_date   AS "week endi",
          action             AS "Action Col",
          action_date        AS "Action Dat",
          action_status      AS "Action Stat",
          physical_count     AS "physical Ac",
          variance           AS "variance",
          system_adjusted    AS "systemAdj",
          reason_code        AS "reasonCoc",
          action_taken_comment AS "actionTake",
          feedback           AS "feedback",
          capture_date       AS "captureDa",
          image1             AS "image1",
          image2             AS "image2",
          image3             AS "image3",
          image4             AS "image4"
        FROM pilot_tasks_history
        WHERE UPPER(TRIM(rep_name)) IN (SELECT UPPER(TRIM(rep_name)) FROM pilot_reps)
        ORDER BY rep_name, store_name, client, article_description
      `);
      const XLSX = await import('xlsx');
      const ws = XLSX.utils.json_to_sheet(result.rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Pilot Tasks');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="pilot-tasks-history.xlsx"');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.send(buf);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/pilot-export', async (req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT DISTINCT ON ("Unique Id")
          "Unique Id", "Key", client, "BANNER", "REGION", "cleaned ss",
          "REP NAME", "LINE MAN", "Category", barcode, "article des",
          "Supplying c", "Store SOH", "Sell out pd", "Missed Sal", "WFC",
          "Stock Clas", "week endi", "Action Col", "Action Dat", "Action Stat",
          "physical Ac", variance, "systemAdj", "reasonCoc", "actionTake",
          feedback, "captureDa", image1, image2, image3, image4
        FROM (
          SELECT 1 AS _src,
            unique_id          AS "Unique Id",
            key                AS "Key",
            client,
            banner             AS "BANNER",
            region             AS "REGION",
            store_name         AS "cleaned ss",
            rep_name           AS "REP NAME",
            line_manager       AS "LINE MAN",
            category           AS "Category",
            barcode,
            article_description AS "article des",
            dc_soh             AS "Supplying c",
            store_soh          AS "Store SOH",
            p4_week_sales      AS "Sell out pd",
            missed_sales       AS "Missed Sal",
            store_wfc          AS "WFC",
            stock_classification AS "Stock Clas",
            week_ending_date   AS "week endi",
            action             AS "Action Col",
            action_date        AS "Action Dat",
            action_status      AS "Action Stat",
            physical_count     AS "physical Ac",
            variance,
            system_adjusted    AS "systemAdj",
            reason_code        AS "reasonCoc",
            action_taken_comment AS "actionTake",
            feedback,
            capture_date       AS "captureDa",
            image1, image2, image3, image4
          FROM tasks
          WHERE UPPER(TRIM(rep_name)) IN (SELECT UPPER(TRIM(rep_name)) FROM pilot_reps)
          UNION ALL
          SELECT 2 AS _src,
            unique_id          AS "Unique Id",
            key                AS "Key",
            client,
            banner             AS "BANNER",
            region             AS "REGION",
            store_name         AS "cleaned ss",
            rep_name           AS "REP NAME",
            line_manager       AS "LINE MAN",
            category           AS "Category",
            barcode,
            article_description AS "article des",
            dc_soh             AS "Supplying c",
            store_soh          AS "Store SOH",
            p4_week_sales      AS "Sell out pd",
            missed_sales       AS "Missed Sal",
            store_wfc          AS "WFC",
            stock_classification AS "Stock Clas",
            week_ending_date   AS "week endi",
            action             AS "Action Col",
            action_date        AS "Action Dat",
            action_status      AS "Action Stat",
            physical_count     AS "physical Ac",
            variance,
            system_adjusted    AS "systemAdj",
            reason_code        AS "reasonCoc",
            action_taken_comment AS "actionTake",
            feedback,
            capture_date       AS "captureDa",
            image1, image2, image3, image4
          FROM pilot_tasks_history
          WHERE UPPER(TRIM(rep_name)) IN (SELECT UPPER(TRIM(rep_name)) FROM pilot_reps)
        ) combined
        ORDER BY "Unique Id", _src ASC
      `);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Pilot Excel upload — parse both tabs, return preview + import into tasks
  app.post('/api/pilot-excel-upload', uploadMemory.single('file'), async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
      const sheets: Record<string, { headers: string[]; rows: any[][] }> = {};
      for (const sheetName of workbook.SheetNames) {
        const ws = workbook.Sheets[sheetName];
        const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        const headers = (raw[0] || []).map(String);
        const rows = raw.slice(1).filter((r: any[]) => r.some((c: any) => c !== '' && c !== null && c !== undefined));
        sheets[sheetName] = { headers, rows: rows.slice(0, 5) }; // preview only first 5 rows
      }
      res.json({ sheetNames: workbook.SheetNames, sheets });
    } catch (err: any) {
      console.error('[PilotUpload] error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // OneDrive: list worksheets in the pilot Excel file
  app.get('/api/onedrive/worksheets', async (req, res) => {
    try {
      const { findFileByName, listWorksheets } = await import('./onedrive.js');
      const file = await findFileByName('Geo Rep -Merch Pilot');
      if (!file) return res.status(404).json({ error: 'File not found on OneDrive' });
      const sheets = await listWorksheets(file.id);
      res.json({ fileId: file.id, fileName: file.name, sheets });
    } catch (err: any) {
      console.error('[OneDrive] worksheets error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // OneDrive: read a specific worksheet
  app.get('/api/onedrive/read', async (req, res) => {
    try {
      const { findFileByName, readWorksheetRows } = await import('./onedrive.js');
      const sheet = (req.query.sheet as string) || '';
      const file = await findFileByName('Geo Rep -Merch Pilot');
      if (!file) return res.status(404).json({ error: 'File not found on OneDrive' });
      const rows = await readWorksheetRows(file.id, sheet);
      res.json({ fileId: file.id, fileName: file.name, sheet, rows });
    } catch (err: any) {
      console.error('[OneDrive] read error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Inventory Dashboard Routes ───────────────────────────────────────────

  // Helper: parse an Excel serial date integer to a JS Date
  function excelSerialToDate(serial: number): Date {
    return new Date((serial - 25569) * 86400 * 1000);
  }

  // Helper: parse a SharePoint DispForm webUrl into { siteUrl, libraryRelUrl, listItemId }
  function parseSharePointWebUrl(webUrl: string): { siteUrl: string; libraryRelUrl: string; listItemId: string } | null {
    try {
      const u = new URL(webUrl);
      const listItemId = u.searchParams.get('ID');
      if (!listItemId) return null;
      // pathname: /sites/ClientServiceTeam319/Shared Documents/Forms/DispForm.aspx
      const parts = decodeURIComponent(u.pathname).split('/');
      const formsIdx = parts.indexOf('Forms');
      if (formsIdx < 2) return null;
      const libraryParts = parts.slice(0, formsIdx); // e.g. ['','sites','ClientServiceTeam319','Shared Documents']
      const siteParts = parts.slice(0, formsIdx - 1); // e.g. ['','sites','ClientServiceTeam319']
      const libraryRelUrl = libraryParts.join('/'); // /sites/ClientServiceTeam319/Shared Documents
      const siteUrl = u.origin + siteParts.join('/'); // https://...sharepoint.com/sites/ClientServiceTeam319
      return { siteUrl, libraryRelUrl, listItemId };
    } catch { return null; }
  }

  // Helper: download a parquet file from a known SharePoint/OneDrive item ID (personal OneDrive)
  async function downloadParquetById(token: string, itemId: string): Promise<ArrayBuffer> {
    const contentResp = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/items/${itemId}/content`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!contentResp.ok) throw new Error(`Failed to download item ${itemId}: ${contentResp.status}`);
    return contentResp.arrayBuffer();
  }

  // Helper: download from a known OneDrive path
  async function downloadParquetByPath(token: string, drivePath: string): Promise<ArrayBuffer> {
    const encoded = encodeURIComponent(drivePath).replace(/%2F/g, '/');
    const contentResp = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/root:/${encoded}:/content`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!contentResp.ok) throw new Error(`Failed to download ${drivePath}: ${contentResp.status}`);
    return contentResp.arrayBuffer();
  }

  // Helper: download via SharePoint REST API using list item ID
  // Uses the same Graph bearer token — modern SharePoint Online accepts it for REST API calls
  async function downloadParquetBySharePointRest(
    token: string, siteUrl: string, libraryRelUrl: string, listItemId: string
  ): Promise<ArrayBuffer> {
    // Encode library rel URL for use inside OData string param via @a query pattern
    const encodedLib = encodeURIComponent(libraryRelUrl);
    const restUrl = `${siteUrl}/_api/web/GetList(@a)/items(${listItemId})/File/$value?@a='${encodedLib}'`;
    const resp = await fetch(restUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json;odata=nometadata',
      },
    });
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`SharePoint REST download failed ${resp.status}: ${errText.substring(0, 300)}`);
    }
    return resp.arrayBuffer();
  }

  // Helper: try Graph drive-specific download (requires Sites.Read.All or site-granted access)
  async function downloadParquetByDriveItem(
    token: string, driveId: string, itemId: string
  ): Promise<ArrayBuffer> {
    const resp = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/content`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!resp.ok) throw new Error(`Graph drive download failed ${resp.status}`);
    return resp.arrayBuffer();
  }

  // Helper: read all rows from a parquet ArrayBuffer using hyparquet
  async function readParquetRows(ab: ArrayBuffer): Promise<Record<string, any>[]> {
    const { parquetRead } = await import('hyparquet');
    return new Promise((resolve, reject) => {
      parquetRead({
        file: {
          byteLength: ab.byteLength,
          slice: (start: number, end?: number) => Promise.resolve(ab.slice(start, end)),
        } as any,
        rowFormat: 'object',
        onComplete: (rows: any) => resolve(rows),
      }).catch(reject);
    });
  }

  // Known file IDs in OneDrive "Inventory 25" folder
  const INV_FILE_IDS = {
    inventoryCombined: '01PWHOXR5YWQVGQTKRCBGYBQI4MUM3FZ27',
    listingGaps: '01PWHOXR6725HBD4EBLVH3R5SMK6QJK4QW',
  };

  // Convert a parquet date value to ISO date string "YYYY-MM-DD"
  function toDateStr(val: any): string | null {
    if (!val) return null;
    if (val instanceof Date) return val.toISOString().slice(0, 10);
    if (typeof val === 'number') {
      // Excel serial → JS Date
      const d = new Date((val - 25569) * 86400 * 1000);
      return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    }
    if (typeof val === 'string') return val.slice(0, 10);
    return null;
  }

  // Helper: fetch children from a specific item ID (works across any drive)
  async function browseItemById(token: string, itemId: string) {
    const r = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/items/${itemId}/children?$select=name,id,size,folder&$top=200`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return r.json() as Promise<any>;
  }

  // Helper: fetch children by path from root of personal drive
  async function browseByPath(token: string, folderPath: string) {
    if (!folderPath || folderPath === '.') {
      const r = await fetch(
        `https://graph.microsoft.com/v1.0/me/drive/root/children?$select=name,id,size,folder&$top=200`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return r.json() as Promise<any>;
    }
    const encoded = folderPath.split('/').map(encodeURIComponent).join('/');
    const r = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/root:/${encoded}:/children?$select=name,id,size,folder&$top=200`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return r.json() as Promise<any>;
  }

  function parseChildren(data: any) {
    const folders = (data.value || [])
      .filter((f: any) => f.folder)
      .map((f: any) => ({ name: f.name, id: f.id, type: 'folder' as const }));
    const files = (data.value || [])
      .filter((f: any) => !f.folder && f.name?.endsWith('.parquet'))
      .map((f: any) => ({ name: f.name, id: f.id, size: f.size || 0, type: 'file' as const }));
    return { folders, files };
  }

  // GET /api/inventory/browse?path=<folder>&itemId=<id>&driveId=<driveId>
  // If itemId provided: browse that item directly (works across drives)
  // If driveId + itemId: browse item in a specific SharePoint drive
  // Otherwise: browse by path in personal OneDrive
  app.get('/api/inventory/browse', async (req, res) => {
    try {
      const { getOneDriveToken } = await import('./onedrive.js');
      const token = await getOneDriveToken();
      const itemId = req.query.itemId as string | undefined;
      const driveId = req.query.driveId as string | undefined;
      const folderPath = (req.query.path as string) || '.';

      let data: any;
      if (driveId && itemId) {
        // Browse a specific item in a SharePoint drive
        const r = await fetch(
          `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/children?$select=name,id,size,folder,parentReference&$top=200`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        data = await r.json();
      } else if (driveId) {
        // Browse root of a specific SharePoint drive
        const r = await fetch(
          `https://graph.microsoft.com/v1.0/drives/${driveId}/root/children?$select=name,id,size,folder,parentReference&$top=200`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        data = await r.json();
      } else if (itemId) {
        data = await browseItemById(token, itemId);
      } else {
        data = await browseByPath(token, folderPath);
      }

      if (data.error) return res.status(400).json({ error: data.error.message });
      const { folders, files } = parseChildren(data);
      res.json({ path: folderPath, folders, files, driveId });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/inventory/search-sharepoint?q=filename — search across all drives incl SharePoint
  app.get('/api/inventory/search-sharepoint', async (req, res) => {
    try {
      const { getOneDriveToken } = await import('./onedrive.js');
      const token = await getOneDriveToken();
      const q = (req.query.q as string) || 'Inventory_Combined.parquet';

      // Use Microsoft Search API to find files across all accessible drives
      const searchResp = await fetch('https://graph.microsoft.com/v1.0/search/query', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            entityTypes: ['driveItem'],
            query: { queryString: q },
            fields: ['name', 'id', 'size', 'parentReference', 'lastModifiedDateTime', 'webUrl'],
            from: 0, size: 20,
          }],
        }),
      });
      const searchData = await searchResp.json() as any;
      const hits = searchData?.value?.[0]?.hitsContainers?.[0]?.hits ?? [];

      const results = hits.map((h: any) => {
        const r = h.resource;
        const webUrl = r.webUrl as string | undefined;
        const parsed = webUrl ? parseSharePointWebUrl(webUrl) : null;
        return {
          name: r.name,
          id: r.id,
          driveId: r.parentReference?.driveId,
          driveType: r.parentReference?.driveType,
          parentPath: r.parentReference?.path,
          size: r.size,
          lastModified: r.lastModifiedDateTime,
          webUrl,
          // SharePoint REST API fields (parsed from webUrl DispForm URL)
          siteUrl: parsed?.siteUrl ?? null,
          libraryRelUrl: parsed?.libraryRelUrl ?? null,
          listItemId: parsed?.listItemId ?? null,
        };
      }).filter((r: any) => r.name?.toLowerCase().endsWith('.parquet'));

      res.json({ results, query: q });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/inventory/list-drives — list all SharePoint site drives the user can access
  app.get('/api/inventory/list-drives', async (req, res) => {
    try {
      const { getOneDriveToken } = await import('./onedrive.js');
      const token = await getOneDriveToken();

      // Get user's followed sites
      const sitesResp = await fetch(
        'https://graph.microsoft.com/v1.0/me/followedSites?$select=id,displayName,webUrl&$top=50',
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const sitesData = await sitesResp.json() as any;
      const followedSites = sitesData.value ?? [];

      // Also get the joined teams' SharePoint sites
      const teamsResp = await fetch(
        'https://graph.microsoft.com/v1.0/me/joinedTeams?$select=id,displayName&$top=50',
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const teamsData = await teamsResp.json() as any;

      res.json({
        followedSites: followedSites.map((s: any) => ({ id: s.id, name: s.displayName, url: s.webUrl })),
        teams: (teamsData.value ?? []).map((t: any) => ({ id: t.id, name: t.displayName })),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/inventory/item-meta?driveId=&itemId= — get item name + parent path
  app.get('/api/inventory/item-meta', async (req, res) => {
    try {
      const { getOneDriveToken } = await import('./onedrive.js');
      const token = await getOneDriveToken();
      const { driveId, itemId } = req.query as Record<string, string>;
      if (!driveId || !itemId) return res.status(400).json({ error: 'driveId and itemId required' });

      const r = await fetch(
        `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}?$select=name,size,parentReference,lastModifiedDateTime`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await r.json() as any;
      if (data.error) return res.status(400).json({ error: data.error.message });
      res.json({
        name: data.name,
        size: data.size,
        lastModified: data.lastModifiedDateTime,
        parentPath: data.parentReference?.path,
        parentId: data.parentReference?.id,
        driveId: data.parentReference?.driveId,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/inventory/site-browse?siteHost=&sitePath=&folderPath= — browse SharePoint site library
  app.get('/api/inventory/site-browse', async (req, res) => {
    try {
      const { getOneDriveToken } = await import('./onedrive.js');
      const token = await getOneDriveToken();
      const { siteHost, sitePath, folderPath } = req.query as Record<string, string>;

      // Resolve site ID
      const siteResp = await fetch(
        `https://graph.microsoft.com/v1.0/sites/${siteHost}:/${sitePath}?$select=id,displayName`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const site = await siteResp.json() as any;
      if (site.error) return res.status(400).json({ error: site.error.message, detail: 'Could not resolve site' });

      // Get the default drive (Shared Documents)
      const driveResp = await fetch(
        `https://graph.microsoft.com/v1.0/sites/${site.id}/drive/root${folderPath ? `:/${folderPath}:` : ''}/children?$select=name,id,size,folder&$top=200`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const driveData = await driveResp.json() as any;
      if (driveData.error) return res.status(400).json({ error: driveData.error.message });

      const { folders, files } = parseChildren(driveData);

      // Get the drive ID for future browsing
      const driveMetaResp = await fetch(
        `https://graph.microsoft.com/v1.0/sites/${site.id}/drive?$select=id`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const driveMeta = await driveMetaResp.json() as any;

      res.json({ siteId: site.id, siteName: site.displayName, driveId: driveMeta.id, folderPath, folders, files });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/inventory/drives — list all drives (personal + SharePoint sites) accessible to the user
  app.get('/api/inventory/drives', async (req, res) => {
    try {
      const { getOneDriveToken } = await import('./onedrive.js');
      const token = await getOneDriveToken();

      // Personal drive root folders
      const personalRoot = await browseByPath(token, '.');
      const personalFolders = (personalRoot.value || [])
        .filter((f: any) => f.folder)
        .map((f: any) => ({ name: f.name, id: f.id, driveType: 'personal', type: 'folder' as const }));

      // SharePoint/Teams shared drives (sites the user follows)
      const sitesR = await fetch(
        `https://graph.microsoft.com/v1.0/me/followedSites?$select=id,name,displayName&$top=20`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const sitesData = await sitesR.json() as any;
      const sites = (sitesData.value || []).map((s: any) => ({
        name: s.displayName || s.name,
        id: s.id,
        type: 'site' as const,
      }));

      res.json({ personalFolders, sites });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/inventory/clients — list which clients are loaded
  app.get('/api/inventory/clients', async (req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT client, COUNT(DISTINCT store_name) as stores, SUM(sku_count) as skus,
          MAX(week_ending) as latest_week, MIN(synced_at) as synced_at
        FROM inv_store_summary
        WHERE client IS NOT NULL
        GROUP BY client ORDER BY client
      `);
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/inventory/sync-upload — accept a manually uploaded parquet file and run sync
  app.post('/api/inventory/sync-upload', upload.single('file'), async (req, res) => {
    const startMs = Date.now();
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

      const fs = await import('fs');
      const fileBuffer = fs.readFileSync(req.file.path);
      const invAb: ArrayBuffer = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength) as ArrayBuffer;

      // Clean up temp file
      fs.unlinkSync(req.file.path);

      console.log(`[Inventory Sync Upload] Parsing ${req.file.originalname} (${(invAb.byteLength / 1024 / 1024).toFixed(1)} MB)…`);
      const invRows = await readParquetRows(invAb);
      console.log(`[Inventory Sync Upload] Parsed ${invRows.length} rows`);

      const clientsInFile = [...new Set(invRows.map((r: any) => r['client']).filter(Boolean))] as string[];
      console.log(`[Inventory Sync Upload] Clients: ${clientsInFile.join(', ')}`);

      for (const c of clientsInFile) {
        await db.execute(sql`DELETE FROM inv_sku_metrics WHERE client = ${c}`);
        await db.execute(sql`DELETE FROM inv_store_summary WHERE client = ${c}`);
      }

      const BATCH = 500;
      const skuMapped = invRows.map((r: any) => {
        const storeSoh = r['store soh'] ?? null;
        const sellOutP4 = r['sell out p4 weeks'] ?? null;
        const oosFlag = storeSoh !== null && storeSoh <= 0 ? 1 : 0;
        const noSalesFlag = sellOutP4 !== null && sellOutP4 <= 0 && storeSoh !== null && storeSoh > 0 ? 1 : 0;
        const negativeSohFlag = storeSoh !== null && storeSoh < 0 ? 1 : 0;
        let stockClass = 'OK';
        if (oosFlag) stockClass = 'OOS';
        else if (noSalesFlag) stockClass = 'No Sales';
        else if (storeSoh !== null && storeSoh < 5) stockClass = 'Low Stock';
        return {
          client: r['client'] ?? null,
          banner: r['banner'] ? String(r['banner']).trim() : null,
          storeName: r['store name'] ? String(r['store name']).trim() : null,
          storeNumber: r['store number'] != null ? String(r['store number']) : null,
          region: r['region'] ? String(r['region']).trim().toUpperCase() : null,
          productCode: r['product code'] ? String(r['product code']) : null,
          productDescription: r['product description'] ? String(r['product description']) : null,
          weekEnding: toDateStr(r['week ending']),
          storeSoh: storeSoh != null ? Number(storeSoh) : null,
          dcSoh: r['supplying dc soh'] != null ? Number(r['supplying dc soh']) : null,
          sellOutP4: sellOutP4 != null ? Number(sellOutP4) : null,
          oosFlag, noSalesFlag, negativeSohFlag, stockClass,
        };
      });

      for (let i = 0; i < skuMapped.length; i += BATCH) {
        await db.insert(invSkuMetrics).values(skuMapped.slice(i, i + BATCH));
      }

      // Aggregate store summaries
      const storeSummaryRows = await db.execute(sql`
        SELECT client, banner, store_name, store_number, region, week_ending,
          COUNT(*) as sku_count,
          SUM(CASE WHEN oos_flag = 1 THEN 1 ELSE 0 END) as oos_count,
          SUM(CASE WHEN no_sales_flag = 1 THEN 1 ELSE 0 END) as no_sales_count,
          SUM(CASE WHEN negative_soh_flag = 1 THEN 1 ELSE 0 END) as negative_soh_count,
          SUM(store_soh) as total_store_soh,
          SUM(dc_soh) as total_dc_soh,
          SUM(sell_out_p4) as total_sales_p4
        FROM inv_sku_metrics
        WHERE client = ANY(${clientsInFile})
        GROUP BY client, banner, store_name, store_number, region, week_ending
      `);

      for (let i = 0; i < storeSummaryRows.rows.length; i += BATCH) {
        await db.insert(invStoreSummary).values(storeSummaryRows.rows.slice(i, i + BATCH).map((r: any) => ({
          client: r.client, banner: r.banner, storeName: r.store_name, storeNumber: r.store_number,
          region: r.region, weekEnding: r.week_ending,
          skuCount: Number(r.sku_count), oosCount: Number(r.oos_count),
          noSalesCount: Number(r.no_sales_count), negativeSohCount: Number(r.negative_soh_count),
          totalStoreSoh: Number(r.total_store_soh), totalDcSoh: Number(r.total_dc_soh),
          totalSalesP4: Number(r.total_sales_p4), syncedAt: new Date(),
        })));
      }

      const durationMs = Date.now() - startMs;
      await db.insert(invSyncLog).values({
        fileName: req.file.originalname, status: 'ok',
        skuRows: invRows.length, storeRows: storeSummaryRows.rows.length, durationMs,
      });

      console.log(`[Inventory Sync Upload] Done in ${durationMs}ms`);
      res.json({ ok: true, skuRows: invRows.length, storeRows: storeSummaryRows.rows.length, durationMs, clients: clientsInFile });
    } catch (err: any) {
      console.error('[Inventory Sync Upload] Error:', err.message);
      try {
        await db.insert(invSyncLog).values({ fileName: 'upload', status: 'error', error: err.message, durationMs: Date.now() - startMs });
      } catch {}
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/inventory/test-sp-rest — test SharePoint REST API access for a specific file
  // Query: siteUrl, libraryRelUrl, listItemId
  app.get('/api/inventory/test-sp-rest', async (req, res) => {
    try {
      const { getOneDriveToken } = await import('./onedrive.js');
      const token = await getOneDriveToken();
      const { siteUrl, libraryRelUrl, listItemId } = req.query as Record<string, string>;
      if (!siteUrl || !libraryRelUrl || !listItemId) {
        return res.status(400).json({ error: 'siteUrl, libraryRelUrl, listItemId required' });
      }
      const encodedLib = encodeURIComponent(libraryRelUrl);
      // Fetch just the file metadata (not $value) to test access
      const metaUrl = `${siteUrl}/_api/web/GetList(@a)/items(${listItemId})/File?@a='${encodedLib}'&$select=Name,Length,TimeLastModified`;
      const resp = await fetch(metaUrl, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json;odata=nometadata' },
      });
      if (!resp.ok) {
        const txt = await resp.text();
        return res.status(resp.status).json({ error: `SP REST ${resp.status}`, detail: txt.substring(0, 400) });
      }
      const data = await resp.json() as any;
      res.json({ ok: true, name: data.Name, size: data.Length, modified: data.TimeLastModified });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/inventory/sync — download Inventory_Combined.parquet and load into DB
  // Body (optional): { fileId?, drivePath?, driveId?, siteUrl?, libraryRelUrl?, listItemId?, label? }
  app.post('/api/inventory/sync', async (req, res) => {
    const startMs = Date.now();
    const { fileId, drivePath, driveId, siteUrl, libraryRelUrl, listItemId, label } = req.body || {};
    try {
      const { getOneDriveToken } = await import('./onedrive.js');
      const token = await getOneDriveToken();

      // Download the specified file, or default to Inventory_Combined.parquet
      const fileLabel = label || siteUrl || drivePath || fileId || 'Inventory_Combined.parquet';
      console.log(`[Inventory Sync] Downloading ${fileLabel}…`);
      let invAb: ArrayBuffer;
      if (siteUrl && libraryRelUrl && listItemId) {
        // SharePoint REST API download (works with Sites.Selected scope)
        console.log(`[Inventory Sync] Using SharePoint REST API for listItemId=${listItemId}`);
        invAb = await downloadParquetBySharePointRest(token, siteUrl, libraryRelUrl, listItemId);
      } else if (driveId && fileId) {
        // Graph drive-specific download (requires Sites.Read.All)
        console.log(`[Inventory Sync] Using Graph drive download for driveId=${driveId}`);
        invAb = await downloadParquetByDriveItem(token, driveId, fileId);
      } else if (fileId) {
        invAb = await downloadParquetById(token, fileId);
      } else if (drivePath) {
        invAb = await downloadParquetByPath(token, drivePath);
      } else {
        invAb = await downloadParquetById(token, INV_FILE_IDS.inventoryCombined);
      }
      console.log('[Inventory Sync] Downloaded. Parsing…');

      const invRows = await readParquetRows(invAb);
      console.log(`[Inventory Sync] Parsed ${invRows.length} rows`);

      // Detect which clients are in this file
      const clientsInFile = [...new Set(invRows.map((r: any) => r['client']).filter(Boolean))] as string[];
      console.log(`[Inventory Sync] Clients in file: ${clientsInFile.join(', ')}`);

      // Delete only the affected clients (leaves other clients intact)
      for (const c of clientsInFile) {
        await db.execute(sql`DELETE FROM inv_sku_metrics WHERE client = ${c}`);
        await db.execute(sql`DELETE FROM inv_store_summary WHERE client = ${c}`);
      }

      // Map Inventory_Combined.parquet → inv_sku_metrics rows
      const BATCH = 500;
      const skuMapped = invRows.map((r: any) => {
        const storeSoh = r['store soh'] ?? null;
        const sellOutP4 = r['sell out p4 weeks'] ?? null;
        const oosFlag = storeSoh !== null && storeSoh <= 0 ? 1 : 0;
        const noSalesFlag = sellOutP4 !== null && sellOutP4 <= 0 && storeSoh !== null && storeSoh > 0 ? 1 : 0;
        const negativeSohFlag = storeSoh !== null && storeSoh < 0 ? 1 : 0;
        let stockClass = 'OK';
        if (oosFlag) stockClass = 'OOS';
        else if (noSalesFlag) stockClass = 'No Sales';
        else if (storeSoh !== null && storeSoh < 5) stockClass = 'Low Stock';

        return {
          client: r['client'] ?? null,
          banner: r['cleaned banner'] ?? r['banner'] ?? null,
          region: r['region'] ?? null,
          storeName: r['cleaned store name'] ?? r['site name'] ?? null,
          repName: null,
          lineManager: null,
          weekEnding: toDateStr(r['week ending']),
          barcode: r['barcode'] != null ? String(r['barcode']) : null,
          brand: r['brand'] ?? null,
          category: r['category'] ?? null,
          article: r['article'] != null ? String(r['article']) : null,
          articleDescription: r['article description'] ?? null,
          dcSoh: r['supplying dc soh'] ?? null,
          storeSoh,
          sellOutP4,
          openPoQty: r['open po qty'] != null ? Number(r['open po qty']) : null,
          avgSales: null,
          wfc: null,
          wfcWithPo: null,
          stockClassification: stockClass,
          action: null,
          oosFlag,
          noSalesFlag,
          negativeSohFlag,
          exceptionFlag: r['exceptionflag'] === true || r['exceptionflag'] === 1 ? true
            : r['exceptionflag'] === false || r['exceptionflag'] === 0 ? false : null,
        };
      });

      for (let i = 0; i < skuMapped.length; i += BATCH) {
        await db.insert(invSkuMetrics).values(skuMapped.slice(i, i + BATCH));
      }
      console.log(`[Inventory Sync] Inserted ${skuMapped.length} SKU rows`);

      // Compute store summary by aggregation
      await db.execute(sql`
        INSERT INTO inv_store_summary (client, banner, store_name, rep_name, line_manager, week_ending,
          total_sales_p4, total_store_soh, total_dc_soh, sku_count, oos_sku_count, no_sales_sku_count, negative_soh_sku_count)
        SELECT
          client, banner, store_name, NULL, NULL, week_ending,
          COALESCE(SUM(sell_out_p4), 0),
          COALESCE(SUM(store_soh), 0),
          COALESCE(SUM(dc_soh), 0),
          COUNT(*),
          COALESCE(SUM(oos_flag), 0),
          COALESCE(SUM(no_sales_flag), 0),
          COALESCE(SUM(negative_soh_flag), 0)
        FROM inv_sku_metrics
        GROUP BY client, banner, store_name, week_ending
      `);

      const storeCount = await db.execute(sql`SELECT COUNT(*) as c FROM inv_store_summary`);
      const storeRows = Number((storeCount.rows[0] as any).c);

      const durationMs = Date.now() - startMs;
      await db.insert(invSyncLog).values({ storeRows, skuRows: skuMapped.length, durationMs, status: 'ok' });
      console.log(`[Inventory Sync] Done in ${durationMs}ms — ${storeRows} store rows, ${skuMapped.length} SKU rows`);
      res.json({ ok: true, storeRows, skuRows: skuMapped.length, durationMs });
    } catch (err: any) {
      const durationMs = Date.now() - startMs;
      console.error('[Inventory Sync] Error:', err.message);
      try { await db.insert(invSyncLog).values({ durationMs, status: 'error', error: err.message }); } catch {}
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/inventory/sync-status
  app.get('/api/inventory/sync-status', async (req, res) => {
    try {
      const rows = await db.select().from(invSyncLog).orderBy(desc(invSyncLog.syncedAt)).limit(1);
      res.json(rows[0] ?? null);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/inventory/filters
  app.get('/api/inventory/filters', async (req, res) => {
    try {
      const clientFilter = req.query.client as string | undefined;

      const [clients, banners, regions, weeks] = await Promise.all([
        db.execute(sql`SELECT DISTINCT client FROM inv_store_summary WHERE client IS NOT NULL ORDER BY client`),
        clientFilter
          ? db.execute(sql`SELECT DISTINCT banner FROM inv_store_summary WHERE client = ${clientFilter} AND banner IS NOT NULL ORDER BY banner`)
          : db.execute(sql`SELECT DISTINCT banner FROM inv_store_summary WHERE banner IS NOT NULL ORDER BY banner`),
        clientFilter
          ? db.execute(sql`SELECT DISTINCT region FROM inv_sku_metrics WHERE client = ${clientFilter} AND region IS NOT NULL ORDER BY region`)
          : db.execute(sql`SELECT DISTINCT region FROM inv_sku_metrics WHERE region IS NOT NULL ORDER BY region`),
        db.execute(sql`SELECT DISTINCT week_ending FROM inv_store_summary WHERE week_ending IS NOT NULL ORDER BY week_ending DESC LIMIT 20`),
      ]);

      res.json({
        clients: (clients.rows as any[]).map(r => r.client),
        banners: (banners.rows as any[]).map(r => r.banner),
        regions: (regions.rows as any[]).map(r => r.region),
        weeks: (weeks.rows as any[]).map(r => r.week_ending as string),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Helper: build a WHERE clause from optional filter values using Drizzle sql template
  function buildInvWhere(opts: {
    weekEnding?: string | null; client?: string; banner?: string; region?: string;
    store?: string; flag?: string;
  }): SQL {
    const parts: SQL[] = [];
    if (opts.weekEnding) parts.push(sql`week_ending = ${opts.weekEnding}`);
    if (opts.client) parts.push(sql`client = ${opts.client}`);
    if (opts.banner) parts.push(sql`banner = ${opts.banner}`);
    if (opts.region) parts.push(sql`region = ${opts.region}`);
    if (opts.store) parts.push(sql`store_name = ${opts.store}`);
    if (opts.flag === 'oos') parts.push(sql`oos_flag = 1`);
    else if (opts.flag === 'nosales') parts.push(sql`no_sales_flag = 1`);
    else if (opts.flag === 'negative') parts.push(sql`negative_soh_flag = 1`);
    return parts.length ? sql`WHERE ${sql.join(parts, sql` AND `)}` : sql``;
  }

  // Helper: get latest week_ending from a table
  async function getLatestWeek(table: 'inv_store_summary' | 'inv_sku_metrics'): Promise<string | null> {
    const r = await db.execute(
      table === 'inv_store_summary'
        ? sql`SELECT MAX(week_ending) as w FROM inv_store_summary`
        : sql`SELECT MAX(week_ending) as w FROM inv_sku_metrics`
    );
    return (r.rows[0] as any)?.w ?? null;
  }

  // GET /api/inventory/kpis
  app.get('/api/inventory/kpis', async (req, res) => {
    try {
      const { client, banner, region, week } = req.query as Record<string, string>;
      const weekEnding = week || await getLatestWeek('inv_store_summary');
      const where = buildInvWhere({ weekEnding, client, banner });

      const result = await db.execute(sql`
        SELECT COUNT(DISTINCT store_name) as store_count,
          COALESCE(SUM(sku_count),0) as total_skus,
          COALESCE(SUM(oos_sku_count),0) as oos_count,
          COALESCE(SUM(no_sales_sku_count),0) as no_sales_count,
          COALESCE(SUM(negative_soh_sku_count),0) as negative_soh_count,
          COALESCE(SUM(total_store_soh),0) as total_store_soh,
          COALESCE(SUM(total_dc_soh),0) as total_dc_soh,
          COALESCE(SUM(total_sales_p4),0) as total_sales_p4
        FROM inv_store_summary ${where}
      `);

      const row = result.rows[0] as any;
      res.json({
        weekEnding,
        storeCount: Number(row.store_count),
        totalSkus: Number(row.total_skus),
        oosCount: Number(row.oos_count),
        noSalesCount: Number(row.no_sales_count),
        negativeSohCount: Number(row.negative_soh_count),
        totalStoreSoh: Number(row.total_store_soh),
        totalDcSoh: Number(row.total_dc_soh),
        totalSalesP4: Number(row.total_sales_p4),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/inventory/insights — pre-aggregated executive data (top banners, regions, stores, DC split)
  app.get('/api/inventory/insights', async (req, res) => {
    try {
      const { client, banner, region, week } = req.query as Record<string, string>;
      const weekEnding = week || await getLatestWeek('inv_store_summary');
      const storeWhere = buildInvWhere({ weekEnding, client, banner });

      // Build SKU-level where with region filter + exclude nulls
      const skuParts: SQL[] = [];
      if (weekEnding) skuParts.push(sql`week_ending = ${weekEnding}`);
      if (client)     skuParts.push(sql`client = ${client}`);
      if (banner)     skuParts.push(sql`banner = ${banner}`);
      if (region)     skuParts.push(sql`region = ${region}`);
      const skuBaseWhere = skuParts.length ? sql`WHERE ${sql.join(skuParts, sql` AND `)}` : sql``;
      const skuRegionWhere = sql`WHERE ${sql.join([...skuParts, sql`region IS NOT NULL`, sql`region != ''`], sql` AND `)}`;

      const [bannersRes, regionsRes, storesRes, dcSplitRes] = await Promise.all([
        db.execute(sql`
          SELECT banner,
            COALESCE(SUM(oos_sku_count),0) as oos_count,
            COALESCE(SUM(sku_count),0) as total_skus,
            COALESCE(SUM(no_sales_sku_count),0) as no_sales_count
          FROM inv_store_summary ${storeWhere}
          GROUP BY banner ORDER BY oos_count DESC LIMIT 5
        `),
        db.execute(sql`
          SELECT region,
            COALESCE(SUM(oos_flag),0) as oos_count,
            COUNT(*) as total_skus
          FROM inv_sku_metrics ${skuRegionWhere}
          GROUP BY region ORDER BY oos_count DESC LIMIT 5
        `),
        db.execute(sql`
          SELECT store_name as "storeName", banner,
            COALESCE(oos_sku_count,0) as "oosCount",
            COALESCE(sku_count,0) as "totalSkus",
            COALESCE(total_dc_soh,0) as "dcSoh"
          FROM inv_store_summary ${storeWhere}
          ORDER BY oos_sku_count DESC NULLS LAST LIMIT 5
        `),
        db.execute(sql`
          SELECT
            COALESCE(SUM(CASE WHEN oos_flag = 1 AND dc_soh > 0 THEN 1 ELSE 0 END),0) as store_replenish,
            COALESCE(SUM(CASE WHEN oos_flag = 1 AND (dc_soh IS NULL OR dc_soh <= 0) THEN 1 ELSE 0 END),0) as dc_constrained
          FROM inv_sku_metrics ${skuBaseWhere}
        `),
      ]);

      res.json({
        weekEnding,
        topBanners: bannersRes.rows.map((r: any) => ({
          banner: r.banner, oosCount: Number(r.oos_count), totalSkus: Number(r.total_skus), noSalesCount: Number(r.no_sales_count),
        })),
        topRegions: regionsRes.rows.map((r: any) => ({
          region: r.region, oosCount: Number(r.oos_count), totalSkus: Number(r.total_skus),
        })),
        topStores: storesRes.rows.map((r: any) => ({
          storeName: r.storeName, banner: r.banner,
          oosCount: Number(r.oosCount), totalSkus: Number(r.totalSkus), dcSoh: Number(r.dcSoh),
        })),
        dcSplit: {
          storeReplenish: Number((dcSplitRes.rows[0] as any).store_replenish),
          dcConstrained: Number((dcSplitRes.rows[0] as any).dc_constrained),
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/inventory/stores
  app.get('/api/inventory/stores', async (req, res) => {
    try {
      const { client, banner, week } = req.query as Record<string, string>;
      const weekEnding = week || await getLatestWeek('inv_store_summary');
      const where = buildInvWhere({ weekEnding, client, banner });

      const result = await db.execute(sql`
        SELECT store_name as "storeName", banner, rep_name as "repName", line_manager as "lineManager",
          COALESCE(sku_count,0) as "skuCount",
          COALESCE(oos_sku_count,0) as "oosSkuCount",
          COALESCE(no_sales_sku_count,0) as "noSalesSkuCount",
          COALESCE(negative_soh_sku_count,0) as "negativeSohSkuCount",
          COALESCE(total_store_soh,0) as "totalStoreSoh",
          COALESCE(total_dc_soh,0) as "totalDcSoh",
          COALESCE(total_sales_p4,0) as "totalSalesP4"
        FROM inv_store_summary ${where}
        ORDER BY oos_sku_count DESC NULLS LAST, store_name
      `);

      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/inventory/skus
  app.get('/api/inventory/skus', async (req, res) => {
    try {
      const { client, banner, region, week, flag, store } = req.query as Record<string, string>;
      const weekEnding = week || await getLatestWeek('inv_sku_metrics');
      const where = buildInvWhere({ weekEnding, client, banner, region, store, flag });

      const result = await db.execute(sql`
        SELECT id, barcode,
          article_description as "articleDescription", brand, category, article,
          store_name as "storeName", banner, region, rep_name as "repName",
          COALESCE(store_soh,0) as "storeSoh",
          COALESCE(dc_soh,0) as "dcSoh",
          COALESCE(sell_out_p4,0) as "sellOutP4",
          COALESCE(open_po_qty,0) as "openPoQty",
          COALESCE(avg_sales,0) as "avgSales",
          COALESCE(wfc,0) as "wfc",
          COALESCE(wfc_with_po,0) as "wfcWithPo",
          stock_classification as "stockClassification",
          action,
          COALESCE(oos_flag,0) as "oosFlag",
          COALESCE(no_sales_flag,0) as "noSalesFlag",
          COALESCE(negative_soh_flag,0) as "negativeSohFlag",
          exception_flag as "exceptionFlag"
        FROM inv_sku_metrics ${where}
        ORDER BY store_soh ASC NULLS LAST, article_description
        LIMIT 2000
      `);

      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ---------------------------------------------------------------------
  // Nexus Inventory Insights routes
  //
  // These call the separate Nexus Azure Function backend (server/nexus.ts)
  // rather than the StockFix Postgres DB. NEXUS_API_KEY is not set in most
  // sandboxes, so these will legitimately fail at runtime with a clean JSON
  // error until that secret is provisioned — that's expected; the goal here
  // is correct plumbing/typing, not a working live call.
  //
  // "Current week" resolution: Nexus publishes its own weekly snapshots and
  // we don't yet have a confirmed way to ask it "what's the latest week".
  // As a best-effort default we reuse the same latest-week lookup already
  // used for the /api/inventory/* routes (getLatestWeek against
  // inv_store_summary) since that's the only "current week" convention that
  // exists elsewhere in this file. Callers can override with ?week=YYYY-MM-DD.
  // UNVERIFIED — confirm this matches Nexus's own week-folder naming once
  // NEXUS_API_KEY is provisioned.
  async function resolveNexusWeek(weekParam?: string): Promise<string> {
    if (weekParam) return weekParam;
    const latest = await getLatestWeek('inv_store_summary');
    return latest || new Date().toISOString().split('T')[0];
  }

  app.get('/api/nexus/store-overview', async (req, res) => {
    try {
      const { rep, store, client, week } = req.query as Record<string, string>;
      const weekEnding = await resolveNexusWeek(week);
      const clientSlug = nexusClientSlug(client || '');
      const data = await fetchNexusJson<NexusStoreCurrentRecord[]>(
        weekEnding,
        clientSlug,
        'store_current',
        { ...(rep ? { rep } : {}), ...(store ? { store } : {}) }
      );
      res.json({ weekEnding, clientSlug, records: data });
    } catch (err: any) {
      res.status(502).json({ error: `Nexus store-overview fetch failed: ${err.message}` });
    }
  });

  app.get('/api/nexus/availability', async (req, res) => {
    try {
      const { rep, store, client, week } = req.query as Record<string, string>;
      const weekEnding = await resolveNexusWeek(week);
      const clientSlug = nexusClientSlug(client || '');
      const data = await fetchNexusJson<NexusOosDetailRecord[]>(
        weekEnding,
        clientSlug,
        'oos_detail',
        { ...(rep ? { rep } : {}), ...(store ? { store } : {}) }
      );
      res.json({ weekEnding, clientSlug, records: data });
    } catch (err: any) {
      res.status(502).json({ error: `Nexus availability fetch failed: ${err.message}` });
    }
  });

  app.get('/api/nexus/line-list', async (req, res) => {
    try {
      const { rep, store, client, classification, week } = req.query as Record<string, string>;
      const weekEnding = await resolveNexusWeek(week);
      const clientSlug = nexusClientSlug(client || '');

      // Route the stem by classification since Nexus publishes separate
      // detail files per bucket (oos/low-stock/overstock). "No sales stock
      // present" and "Optimal" don't have a dedicated detail stem in the
      // spec, so they fall back to oos_detail as a best-effort placeholder.
      // UNVERIFIED — confirm the correct stem per classification once
      // NEXUS_API_KEY is provisioned.
      let stem: string;
      switch (classification) {
        case 'Low stock':
          stem = 'low_stock_detail';
          break;
        case 'Overstocked':
          stem = 'overstock_detail';
          break;
        case 'Out of stock':
        default:
          stem = 'oos_detail';
          break;
      }

      const data = await fetchNexusJson<
        NexusOosDetailRecord[] | NexusLowStockDetailRecord[] | NexusOverstockDetailRecord[]
      >(weekEnding, clientSlug, stem, {
        ...(rep ? { rep } : {}),
        ...(store ? { store } : {}),
        ...(classification ? { classification } : {}),
      });
      res.json({ weekEnding, clientSlug, classification: classification || null, records: data });
    } catch (err: any) {
      res.status(502).json({ error: `Nexus line-list fetch failed: ${err.message}` });
    }
  });

  app.get('/api/nexus/sku-record', async (req, res) => {
    try {
      const { barcode, store, client, scope, week } = req.query as Record<string, string>;
      if (!barcode) {
        return res.status(400).json({ error: 'barcode is required' });
      }
      const weekEnding = await resolveNexusWeek(week);
      const clientSlug = nexusClientSlug(client || '');
      const resolvedScope = scope === 'all-mine' ? 'all-mine' : 'this-store';
      const data = await fetchNexusJson<NexusStoreSkuCurrentRecord[]>(
        weekEnding,
        clientSlug,
        'store_sku_current',
        {
          barcode,
          scope: resolvedScope,
          ...(resolvedScope === 'this-store' && store ? { store } : {}),
        }
      );
      res.json({ weekEnding, clientSlug, scope: resolvedScope, records: data });
    } catch (err: any) {
      res.status(502).json({ error: `Nexus sku-record fetch failed: ${err.message}` });
    }
  });

  return httpServer;
}
