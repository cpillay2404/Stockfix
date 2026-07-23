import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, timestamp, integer, doublePrecision, boolean, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  
  // Identification
  uniqueId: text("unique_id").notNull().unique(),
  key: text("key").notNull(),
  
  // Organization
  client: text("client").notNull(),
  banner: text("banner").notNull(),
  region: text("region").notNull(),
  storeName: text("store_name").notNull(),
  repName: text("rep_name").notNull(),
  lineManager: text("line_manager").notNull(),
  
  // Product Info
  category: text("category").notNull(),
  barcode: text("barcode").notNull(),
  articleDescription: text("article_description").notNull(),
  
  // Metrics / Data
  dcSoh: text("dc_soh").notNull(),
  storeSoh: text("store_soh").notNull(),
  p4WeekSales: text("p4_week_sales").notNull(),
  missedSales: text("missed_sales").notNull(),
  storeWfc: text("store_wfc").notNull(),
  stockClassification: text("stock_classification").notNull(),
  
  // Time Series Data
  weekEnding: text("week_ending"),
  weekEndingDate: text("week_ending_date"),
  
  // Action Required
  action: text("action").notNull(),
  actionDate: text("action_date"),
  
  // Feedback / Result
  feedback: text("feedback"),
  captureDate: text("capture_date"),
  actionStatus: text("action_status").notNull().default("Pending"),
  reasonCode: text("reason_code"),
  actionTakenComment: text("action_taken_comment"),
  
  // Physical Count Fields (rep captured)
  physicalCount: text("physical_count"),
  variance: text("variance"),
  systemAdjusted: text("system_adjusted"),
  
  // Images (up to 4 captured by rep)
  image1: text("image1"),
  image2: text("image2"),
  image3: text("image3"),
  image4: text("image4"),
  systemImage: text("system_image"),
  piImage: text("pi_image"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertTaskSchema = createInsertSchema(tasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasks.$inferSelect;

export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  repName: text("rep_name").notNull(),
  repEmail: text("rep_email"),
  managerName: text("manager_name"),
  managerEmail: text("manager_email"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertContactSchema = createInsertSchema(contacts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contacts.$inferSelect;

export const pilotTasksHistory = pgTable("pilot_tasks_history", {
  uniqueId:             text("unique_id").primaryKey(),
  key:                  text("key"),
  client:               text("client"),
  banner:               text("banner"),
  region:               text("region"),
  storeName:            text("store_name"),
  repName:              text("rep_name"),
  lineManager:          text("line_manager"),
  category:             text("category"),
  barcode:              text("barcode"),
  articleDescription:   text("article_description"),
  dcSoh:                text("dc_soh"),
  storeSoh:             text("store_soh"),
  p4WeekSales:          text("p4_week_sales"),
  missedSales:          text("missed_sales"),
  storeWfc:             text("store_wfc"),
  stockClassification:  text("stock_classification"),
  weekEnding:           text("week_ending"),
  weekEndingDate:       text("week_ending_date"),
  action:               text("action"),
  actionDate:           text("action_date"),
  actionStatus:         text("action_status"),
  physicalCount:        text("physical_count"),
  variance:             text("variance"),
  systemAdjusted:       text("system_adjusted"),
  reasonCode:           text("reason_code"),
  actionTakenComment:   text("action_taken_comment"),
  feedback:             text("feedback"),
  captureDate:          text("capture_date"),
  image1:               text("image1"),
  image2:               text("image2"),
  image3:               text("image3"),
  image4:               text("image4"),
  savedAt:              timestamp("saved_at").defaultNow().notNull(),
});

export const pilotReps = pgTable("pilot_reps", {
  id: serial("id").primaryKey(),
  repName: text("rep_name").notNull().unique(),
  joinedDate: text("joined_date").notNull().default('2026-07-01'),
  active: boolean("active").notNull().default(true),
  leftDate: text("left_date"),
});

export const pilotSnapshots = pgTable("pilot_snapshots", {
  id: serial("id").primaryKey(),
  weekEndingDate: text("week_ending_date").notNull(),
  repName: text("rep_name").notNull(),
  lineManager: text("line_manager"),
  region: text("region"),
  totalTasks: text("total_tasks").notNull().default("0"),
  completed: text("completed").notNull().default("0"),
  pending: text("pending").notNull().default("0"),
  captureRate: text("capture_rate").notNull().default("0"),
  savedAt: timestamp("saved_at").defaultNow().notNull(),
}, (table) => ({
  weekRepUnique: unique().on(table.weekEndingDate, table.repName),
}));

export const pilotCaptures = pgTable("pilot_captures", {
  id:               serial("id").primaryKey(),
  backupDate:       timestamp("backup_date").defaultNow().notNull(),
  weekEndingDate:   text("week_ending_date"),
  uniqueId:         text("unique_id"),
  repName:          text("rep_name"),
  storeName:        text("store_name"),
  client:           text("client"),
  lineManager:      text("line_manager"),
  region:           text("region"),
  banner:           text("banner"),
  barcode:          text("barcode"),
  articleDescription: text("article_description"),
  action:           text("action"),
  actionStatus:     text("action_status"),
  reasonCode:       text("reason_code"),
  feedback:         text("feedback"),
  image1:           text("image1"),
  image2:           text("image2"),
  captureDate:      text("capture_date"),
  storeSoh:         text("store_soh"),
  storeWfc:         text("store_wfc"),
});

export const clientPasswords = pgTable("client_passwords", {
  id: serial("id").primaryKey(),
  clientName: text("client_name").notNull().unique(),
  password: text("password").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertClientPasswordSchema = createInsertSchema(clientPasswords).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertClientPassword = z.infer<typeof insertClientPasswordSchema>;
export type ClientPassword = typeof clientPasswords.$inferSelect;

// ─── Inventory Dashboard Tables ───────────────────────────────────────────────

export const invStoreSummary = pgTable("inv_store_summary", {
  id: serial("id").primaryKey(),
  client: text("client"),
  banner: text("banner"),
  storeName: text("store_name"),
  repName: text("rep_name"),
  lineManager: text("line_manager"),
  weekEnding: text("week_ending"),
  totalSalesP4: doublePrecision("total_sales_p4"),
  totalStoreSoh: doublePrecision("total_store_soh"),
  totalDcSoh: doublePrecision("total_dc_soh"),
  skuCount: integer("sku_count"),
  oosSkuCount: integer("oos_sku_count"),
  noSalesSkuCount: integer("no_sales_sku_count"),
  negativeSohSkuCount: integer("negative_soh_sku_count"),
  syncedAt: timestamp("synced_at").defaultNow(),
});

export const invSkuMetrics = pgTable("inv_sku_metrics", {
  id: serial("id").primaryKey(),
  client: text("client"),
  banner: text("banner"),
  region: text("region"),
  storeName: text("store_name"),
  repName: text("rep_name"),
  lineManager: text("line_manager"),
  weekEnding: text("week_ending"),
  barcode: text("barcode"),
  brand: text("brand"),
  category: text("category"),
  article: text("article"),
  articleDescription: text("article_description"),
  dcSoh: doublePrecision("dc_soh"),
  storeSoh: doublePrecision("store_soh"),
  sellOutP4: doublePrecision("sell_out_p4"),
  openPoQty: doublePrecision("open_po_qty"),
  avgSales: doublePrecision("avg_sales"),
  wfc: doublePrecision("wfc"),
  wfcWithPo: doublePrecision("wfc_with_po"),
  stockClassification: text("stock_classification"),
  action: text("action"),
  oosFlag: integer("oos_flag"),
  noSalesFlag: integer("no_sales_flag"),
  negativeSohFlag: integer("negative_soh_flag"),
  exceptionFlag: boolean("exception_flag"),
  syncedAt: timestamp("synced_at").defaultNow(),
});

export const invSyncLog = pgTable("inv_sync_log", {
  id: serial("id").primaryKey(),
  syncedAt: timestamp("synced_at").defaultNow(),
  storeRows: integer("store_rows"),
  skuRows: integer("sku_rows"),
  durationMs: integer("duration_ms"),
  status: text("status"),
  error: text("error"),
});
