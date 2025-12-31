import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTaskSchema } from "@shared/schema";
import { z } from "zod";
import multer from "multer";
import XLSX from "xlsx";
import path from "path";
import fs from "fs";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";

// Configure multer for file uploads
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Image uploads now use cloud storage via object storage integration

// Ensure directories exist
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
if (!fs.existsSync('public')) fs.mkdirSync('public');
if (!fs.existsSync('public/images')) fs.mkdirSync('public/images', { recursive: true });

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Register object storage routes for persistent file uploads
  registerObjectStorageRoutes(app);
  
  // GET dashboard stats
  app.get("/api/dashboard/stats", async (req, res) => {
    try {
      const regionFilter = req.query.region as string | undefined;
      const clientFilter = req.query.client as string | undefined;
      const includeAll = req.query.includeAll === 'true';
      
      let tasks = await storage.getAllTasks();
      
      // Filter to latest week ending date unless includeAll is true
      if (!includeAll) {
        const latestWeek = await storage.getLatestWeekEndingDate();
        if (latestWeek) {
          tasks = tasks.filter(t => t.weekEndingDate === latestWeek);
        }
      }
      
      // Apply filters if provided
      if (regionFilter) {
        tasks = tasks.filter(t => t.region === regionFilter);
      }
      if (clientFilter) {
        tasks = tasks.filter(t => t.client === clientFilter);
      }
      
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

  // GET stores for a specific rep
  app.get("/api/reps/:repName/stores", async (req, res) => {
    try {
      const repName = decodeURIComponent(req.params.repName);
      const includeAll = req.query.includeAll === 'true';
      
      let allTasks = await storage.getAllTasks();
      
      // Filter to latest week ending date unless includeAll is true
      if (!includeAll) {
        const latestWeek = await storage.getLatestWeekEndingDate();
        if (latestWeek) {
          allTasks = allTasks.filter(t => t.weekEndingDate === latestWeek);
        }
      }
      
      // Get unique stores for this rep
      const repTasks = allTasks.filter(t => t.repName === repName);
      const stores = [...new Set(repTasks.map(t => t.storeName).filter(Boolean))].sort();
      
      res.json({ stores });
    } catch (error) {
      console.error("Error fetching rep stores:", error);
      res.status(500).json({ error: "Failed to fetch rep stores" });
    }
  });

  // GET store overview (scoped to rep+store for Store Overview page)
  app.get("/api/store-overview", async (req, res) => {
    try {
      const rep = req.query.rep as string;
      const store = req.query.store as string;
      const client = req.query.client as string | undefined;
      const article = req.query.article as string | undefined;
      
      if (!rep || !store) {
        return res.status(400).json({ error: "Rep and store are required" });
      }
      
      const allTasks = await storage.getAllTasks();
      
      // Filter by rep and store
      let scopedTasks = allTasks.filter(t => 
        t.repName === rep && t.storeName === store
      );
      
      // Apply optional client filter
      if (client && client !== 'All Clients') {
        scopedTasks = scopedTasks.filter(t => t.client === client);
      }
      
      // Apply optional article filter
      if (article && article !== 'All Articles') {
        scopedTasks = scopedTasks.filter(t => t.articleDescription === article);
      }
      
      if (scopedTasks.length === 0) {
        return res.json({
          storeName: store,
          region: '',
          repName: rep,
          tiles: { totalSKUs: 0, actionRequired: 0, understockOOS: 0, overstock: 0 },
          charts: { storeSoh: [], sellOutP4: [], wfc: [] },
          filters: { clients: [], articles: [] },
          latestWeekEnding: null,
        });
      }
      
      // Get unique week endings sorted descending
      const weekEndings = [...new Set(scopedTasks.map(t => t.weekEndingDate).filter(Boolean))].sort().reverse();
      const latestWeekEnding = weekEndings[0] || null;
      
      // Filter for latest week only (for tiles)
      const latestWeekTasks = latestWeekEnding 
        ? scopedTasks.filter(t => t.weekEndingDate === latestWeekEnding)
        : scopedTasks;
      
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
      
      // Charts: last 12 weeks of data
      const last12Weeks = weekEndings.slice(0, 12).reverse();
      
      // Store SOH per week (sum)
      const storeSohData = last12Weeks.map(week => {
        const weekTasks = scopedTasks.filter(t => t.weekEndingDate === week);
        const sum = weekTasks.reduce((acc, t) => acc + (parseFloat(t.storeSoh) || 0), 0);
        return { weekEnding: week, value: Math.round(sum) };
      });
      
      // Sell Out P4 Weeks per week (sum)
      const sellOutP4Data = last12Weeks.map(week => {
        const weekTasks = scopedTasks.filter(t => t.weekEndingDate === week);
        const sum = weekTasks.reduce((acc, t) => acc + (parseFloat(t.p4WeekSales) || 0), 0);
        return { weekEnding: week, value: Math.round(sum) };
      });
      
      // WFC per week (average)
      const wfcData = last12Weeks.map(week => {
        const weekTasks = scopedTasks.filter(t => t.weekEndingDate === week);
        if (weekTasks.length === 0) return { weekEnding: week, value: 0 };
        const sum = weekTasks.reduce((acc, t) => acc + (parseFloat(t.storeWfc) || 0), 0);
        const avg = sum / weekTasks.length;
        return { weekEnding: week, value: Math.round(avg * 10) / 10 };
      });
      
      // Get filter options (unique clients and articles within scope before article filter)
      const baseFilteredTasks = allTasks.filter(t => 
        t.repName === rep && t.storeName === store && 
        (!client || client === 'All Clients' || t.client === client)
      );
      const clients = [...new Set(scopedTasks.map(t => t.client).filter(Boolean))].sort();
      const articles = [...new Set(baseFilteredTasks.map(t => t.articleDescription).filter(Boolean))].sort();
      
      res.json({
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
      });
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
      
      const allTasks = await storage.getAllTasks();
      
      // Filter by barcode and store to get historical data for this specific SKU
      const skuTasks = allTasks.filter(t => 
        t.barcode === barcode && t.storeName === store
      );
      
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
          value: weekTask ? (parseFloat(weekTask.storeSoh) || 0) : 0 
        };
      });
      
      // Sell Out P4 Weeks per week
      const sellOutData = last6Weeks.map(week => {
        const weekTask = skuTasks.find(t => t.weekEndingDate === week);
        return { 
          weekEnding: week, 
          value: weekTask ? (parseFloat(weekTask.p4WeekSales) || 0) : 0 
        };
      });
      
      // WFC per week
      const wfcData = last6Weeks.map(week => {
        const weekTask = skuTasks.find(t => t.weekEndingDate === week);
        return { 
          weekEnding: week, 
          value: weekTask ? (parseFloat(weekTask.storeWfc) || 0) : 0 
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
      
      let allTasks = await storage.getAllTasks();
      
      // Filter to latest week ending date unless includeAll is true
      if (!includeAll) {
        const latestWeek = await storage.getLatestWeekEndingDate();
        if (latestWeek) {
          allTasks = allTasks.filter(t => t.weekEndingDate === latestWeek);
        }
      }
      
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
      
      let allTasks = await storage.getAllTasks();
      
      // Get latest week ending for the scope
      const weekEndings = [...new Set(allTasks.map(t => t.weekEndingDate).filter(Boolean))].sort().reverse();
      const latestWeekEnding = weekEndings[0] || null;
      
      // Filter to latest week and scope
      let scopedTasks = allTasks.filter(t => t.weekEndingDate === latestWeekEnding);
      
      if (rep) scopedTasks = scopedTasks.filter(t => t.repName === rep);
      if (store) scopedTasks = scopedTasks.filter(t => t.storeName === store);
      if (client && client !== 'All Clients') scopedTasks = scopedTasks.filter(t => t.client === client);
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
      
      res.json({
        latestWeekEnding,
        totalTasks: scopedTasks.length,
        pendingCount,
        pendingCountExcludingOptimal,
        completedCount,
        pendingActionCounts,
        completedActionCounts,
        articles,
      });
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
      
      const result = await storage.getTasksPaginated(page, limit, search, status, filters);
      res.json(result);
    } catch (error) {
      console.error("Error fetching tasks:", error);
      res.status(500).json({ error: "Failed to fetch tasks" });
    }
  });

  // GET export tasks as Excel - MUST be before :uniqueId route
  app.get("/api/tasks/export", async (req, res) => {
    try {
      const allTasks = await storage.getAllTasks();
      
      // Only export tasks that have been captured (have feedback, reasonCode, or completed status)
      const capturedTasks = allTasks.filter(task => 
        task.actionStatus === 'Completed' || 
        task.reasonCode || 
        task.feedback || 
        task.captureDate ||
        task.image1 ||
        task.image2
      );
      
      // Build full URL for images
      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host || '';
      const baseUrl = `${protocol}://${host}`;
      
      // Helper to make image URL full path
      const getFullImageUrl = (imagePath: string | null | undefined): string => {
        if (!imagePath) return '';
        if (imagePath.startsWith('http')) return imagePath;
        return `${baseUrl}${imagePath}`;
      };
      
      // Transform data to match Excel columns
      const exportData = capturedTasks.map(task => ({
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

  // POST import Excel/CSV file
  app.post("/api/tasks/import", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }

      // Check if we should clear existing tasks first (full refresh)
      const clearExisting = req.query.clear === 'true' || req.body?.clear === 'true';
      
      if (clearExisting) {
        console.log("Import - Clearing all existing tasks for full refresh...");
        await storage.deleteAllTasks();
        console.log("Import - All existing tasks cleared");
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

      // Helper to parse date string to ISO format (YYYY-MM-DD)
      const parseToISODate = (dateStr: string): string => {
        if (!dateStr) return new Date().toISOString().split('T')[0];
        try {
          // Try parsing various formats
          const parsed = new Date(dateStr);
          if (!isNaN(parsed.getTime())) {
            return parsed.toISOString().split('T')[0];
          }
        } catch (e) {}
        return new Date().toISOString().split('T')[0];
      };

      // Map CSV/Excel columns to our schema with flexible matching
      const mappedTasks = data.map((row: any, index: number) => {
        // Generate unique ID from store + barcode + week ending
        const storeVal = getValue(row, 'cleaned store name', 'STORE NAME', 'Store Name', 'StoreName', 'store_name', 'Store');
        const barcodeVal = getValue(row, 'barcode', 'Barcode', 'BARCODE', 'SKU', 'sku');
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
          dcSoh: getValue(row, 'Supplying dc soh', 'DC SOH', 'DC_SOH', 'DCSOH', 'dc_soh', 'Supplying DC SOH') || '0',
          storeSoh: getValue(row, 'Store SOH', 'STORE_SOH', 'StoreSoh', 'store_soh') || '0',
          p4WeekSales: getValue(row, 'Sell out p4 weeks', 'P4 week Sales', 'P4WeekSales', 'p4_week_sales', 'P4 Sales', 'Sell out P4 weeks') || '0',
          missedSales: getValue(row, 'Missed Sales (This Week)', 'Missed Sales', 'MissedSales', 'missed_sales') || '0',
          storeWfc: getValue(row, 'WFC', ' WFC', 'Store WFC (This Week)', 'Store WFC', 'StoreWfc', 'store_wfc') || '0',
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

  return httpServer;
}
