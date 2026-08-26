import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, timestamp, integer, doublePrecision, boolean, unique, index, jsonb } from "drizzle-orm/pg-core";
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

  // Added 2026-08-16 for auto-generated Nexus tasks: when a store has more
  // than one person covering it (real, common case per the Call Cycle
  // Master), repName stays "Unassigned" until someone actually captures the
  // task - whoever does gets the credit, written via a separate completion
  // endpoint (not the existing rep-facing PATCH, which stays untouched).
  // eligibleAssignees holds the comma-separated pool of everyone who could
  // claim it, so the app can show it to all of them until one does.
  eligibleAssignees: text("eligible_assignees"),
  
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

// Separate table for the new Insights/Fix auto-generated task flow (Carin,
// 2026-08-17: "i think we need to create a brand new table ... and not
// touch the current table where the tasks are saved" - this is the same
// real production database the live app already serves the classic Tasks
// screen from, so this new capture flow gets its own table entirely rather
// than risking test/generated rows mixing into the live `tasks` table and
// its existing completion reporting/denominator). Same shape as `tasks` -
// not a redesign, just a different destination.
export const nexusTasks = pgTable("nexus_tasks", {
  id: serial("id").primaryKey(),
  uniqueId: text("unique_id").notNull().unique(),
  key: text("key").notNull(),
  client: text("client").notNull(),
  banner: text("banner").notNull(),
  region: text("region").notNull(),
  storeName: text("store_name").notNull(),
  repName: text("rep_name").notNull(),
  // Real field from resourceRoster.resourceType (Rep/Merchandiser/Manager) -
  // set at claim time from whoever actually captured it (Carin, 2026-08-17:
  // needed for reporting split by resource type, not just by name). Null
  // until claimed, same as repName stays "Unassigned" until then.
  resourceType: text("resource_type"),
  lineManager: text("line_manager").notNull(),
  category: text("category").notNull(),
  barcode: text("barcode").notNull(),
  articleDescription: text("article_description").notNull(),
  dcSoh: text("dc_soh").notNull(),
  storeSoh: text("store_soh").notNull(),
  p4WeekSales: text("p4_week_sales").notNull(),
  missedSales: text("missed_sales").notNull(),
  storeWfc: text("store_wfc").notNull(),
  stockClassification: text("stock_classification").notNull(),
  weekEnding: text("week_ending"),
  weekEndingDate: text("week_ending_date"),
  action: text("action").notNull(),
  actionDate: text("action_date"),
  feedback: text("feedback"),
  captureDate: text("capture_date"),
  actionStatus: text("action_status").notNull().default("Pending"),
  reasonCode: text("reason_code"),
  actionTakenComment: text("action_taken_comment"),
  physicalCount: text("physical_count"),
  variance: text("variance"),
  systemAdjusted: text("system_adjusted"),
  image1: text("image1"),
  image2: text("image2"),
  image3: text("image3"),
  image4: text("image4"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertNexusTaskSchema = createInsertSchema(nexusTasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertNexusTask = z.infer<typeof insertNexusTaskSchema>;
export type NexusTask = typeof nexusTasks.$inferSelect;

// One row per (task, eligible assignee) - replaces a comma-separated
// eligibleAssignees text column (Carin, 2026-08-17: "that's a problem for
// me" - can't filter/join/export a multi-value cell cleanly). A store
// covered by 3 people means 3 rows here, not 1 cell with 3 names in it.
export const nexusTaskAssignees = pgTable("nexus_task_assignees", {
  id: serial("id").primaryKey(),
  taskUniqueId: text("task_unique_id").notNull(),
  resourceEmpId: text("resource_emp_id").notNull(),
  resourceName: text("resource_name").notNull(),
}, (table) => ({
  taskIdx: index("idx_nexus_task_assignees_task").on(table.taskUniqueId),
  uniquePair: unique().on(table.taskUniqueId, table.resourceEmpId),
}));

export type NexusTaskAssignee = typeof nexusTaskAssignees.$inferSelect;

// Per-client overstock definition (Carin, 2026-08-18): a blanket 6-week
// cover threshold flagged 74% of the entire network as "overstock" one
// week - real client-by-client variance (13.7%-77.4%) showed a flat rule
// doesn't fit every client's real order cadence. Real criteria given
// per-client, one at a time, over this session - see project memory
// for the full collection conversation. Davidoff deliberately has no row -
// inactive client, no longer receiving data (Carin, 2026-08-18).
export const clientOverstockRules = pgTable("client_overstock_rules", {
  id: serial("id").primaryKey(),
  client: text("client").notNull().unique(),
  noSalesDaysThreshold: integer("no_sales_days_threshold").notNull(),
});

export type ClientOverstockRule = typeof clientOverstockRules.$inferSelect;

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

// ─── Identity / Roster (Call Cycle Master derived) ─────────────────────────────
// Server-side source of truth for "who is this person and what are they allowed
// to see". Populated from the Call Cycle Master via /api/admin/roster/import
// (fed by the Python store_coverage.json pipeline). Not a login system with
// secrets - a person proves identity by matching Name + Employee ID against
// this week's roster.
export const resourceRoster = pgTable("resource_roster", {
  id: serial("id").primaryKey(),
  resourceEmpId: text("resource_emp_id").notNull().unique(),
  resourceName: text("resource_name").notNull(),
  resourceType: text("resource_type"),
  cleanedStoreName: text("cleaned_store_name"),
  banner: text("banner"),
  manager: text("manager"),
  clientScope: text("client_scope").notNull().default("SYNDICATED"),
  // Carin, 2026-08-19: the real Call Cycle Master (both its Call Cycle tab
  // and the P&G tab) has email addresses for some people - not previously
  // captured at all. Preferred over the separate contacts table import
  // when present (see resolveEmailRecipients in server/email.ts).
  email: text("email"),
  importedAt: timestamp("imported_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertResourceRosterSchema = createInsertSchema(resourceRoster).omit({
  id: true,
  importedAt: true,
  updatedAt: true,
});

export type InsertResourceRoster = z.infer<typeof insertResourceRosterSchema>;
export type ResourceRoster = typeof resourceRoster.$inferSelect;

// One row per (person, store) - resource_roster collapses to one row per
// person (their type/manager), which necessarily drops the fact that one
// person covers many stores. This table is the real "who covers which
// store" source, straight from store_coverage.json's un-deduped rows -
// used to answer "what stores does this rep/merchandiser actually have,"
// instead of inferring it from whichever stores happened to have a task
// imported for them (confirmed broken 2026-08-08: a real merchandiser with
// no task history showed zero stores, when they're actually assigned many).
export const storeAssignments = pgTable("store_assignments", {
  id: serial("id").primaryKey(),
  resourceEmpId: text("resource_emp_id").notNull(),
  resourceName: text("resource_name").notNull(),
  cleanedStoreName: text("cleaned_store_name").notNull(),
  banner: text("banner"),
  // Carin, 2026-08-20: Nexus's own store master is badly incomplete for
  // smaller/convenience formats (Usave 11.7% complete, liquor shops
  // 38-54%, vs 97-100% for big established chains) - the Call Cycle
  // Master file itself is 100% complete on region, since Carin maintains
  // it directly. Used as the real region source/fallback wherever Nexus's
  // own region comes back blank, instead of trusting Nexus's gap.
  region: text("region"),
  clientScope: text("client_scope").notNull().default("SYNDICATED"),
  importedAt: timestamp("imported_at").defaultNow().notNull(),
}, (table) => ({
  // Other half of the store-search join fix (see store_weekly_summary's
  // matching index) - both sides of that join need the expression indexed.
  lookupIdx: index("idx_store_assignments_lookup").on(sql`upper(trim(${table.cleanedStoreName}))`),
}));

export const insertStoreAssignmentSchema = createInsertSchema(storeAssignments).omit({
  id: true,
  importedAt: true,
});

export type InsertStoreAssignment = z.infer<typeof insertStoreAssignmentSchema>;
export type StoreAssignment = typeof storeAssignments.$inferSelect;

// Small, cheap, per-store-per-client-per-week summary counts - sourced
// live from Nexus, synced weekly. Deliberately NOT full SKU-level detail
// (that stays live-fetched on demand, per store+barcode, only when someone
// actually taps a specific SKU - confirmed 2026-08-08 that pre-storing
// full SKU detail for every store/client/week is unaffordable, but this
// summary layer is cheap: real math confirmed ~340MB steady-state for a
// rolling 13-week window across all 25 clients).
export const storeWeeklySummary = pgTable("store_weekly_summary", {
  id: serial("id").primaryKey(),
  weekEnding: text("week_ending").notNull(),
  client: text("client").notNull(),
  cleanedStoreName: text("cleaned_store_name").notNull(),
  banner: text("banner"),
  region: text("region"),
  siteCode: text("site_code"),
  totalSkus: integer("total_skus").default(0),
  storeSoh: integer("store_soh").default(0),
  salesP4: integer("sales_p4").default(0),
  oosCount: integer("oos_count").default(0),
  lowStockCount: integer("low_stock_count").default(0),
  overstockCount: integer("overstock_count").default(0),
  noSalesCount: integer("no_sales_count").default(0),
  dormantCount: integer("dormant_count").default(0),
  atRiskCount: integer("at_risk_count").default(0),
  distributionGapsCount: integer("distribution_gaps_count").default(0),
  healthScore: integer("health_score").default(0),
  // Added 2026-08-12 so "vs LW" deltas for these 3 KPI cards can be real
  // instead of omitted - computed from oos_detail/low_stock_detail bulk
  // pages during the weekly sync (nexus-sync.ts), same formulas
  // fetchStoreOverview already uses live. Null on any week synced before
  // this column existed - the delta calc in routes.ts must treat null as
  // "no real history," never fabricate a comparison against it.
  dcAvailabilityPct: doublePrecision("dc_availability_pct"),
  avgWeeksOfCover: doublePrecision("avg_weeks_of_cover"),
  salesAtRiskSkuCount: integer("sales_at_risk_sku_count"),
  // Added 2026-08-13 (Carin: "we have the historical data, we can check if
  // there were negative SOHs last week no?") - real per-week negSOHCount
  // already exists on Nexus's own store_current rows, just never synced
  // here before. Null on weeks synced before this column existed.
  negSohCount: integer("neg_soh_count"),
  syncedAt: timestamp("synced_at").defaultNow().notNull(),
}, (table) => ({
  // One row per store+client+week - the natural key this table is built
  // around, and what the sync job upserts against.
  uniqueKey: unique("store_weekly_summary_unique").on(table.weekEnding, table.client, table.cleanedStoreName),
  // Added 2026-08-16 - /api/roster/store-search joins this table against
  // store_assignments on upper(trim(cleaned_store_name)) with no supporting
  // index on either side, forcing a full scan + sort of both tables on
  // every request (confirmed real: 5.7s). This index lets that join use an
  // index scan instead.
  lookupIdx: index("idx_store_weekly_summary_lookup").on(sql`upper(trim(${table.cleanedStoreName}))`),
}));

export const insertStoreWeeklySummarySchema = createInsertSchema(storeWeeklySummary).omit({
  id: true,
  syncedAt: true,
});

// Full per-SKU line list, one row per barcode+store+client+week - the real
// fix for the "waiting for inventory data" problem (Carin, 2026-08-13):
// At Risk, Cover Analysis, Negative SOH, Cover Distribution, and the SKU
// dropdown all currently derive from a live store_sku_current call every
// time a rep opens the app. Once this table is populated, those become
// plain local reads instead - Nexus only gets called during the weekly
// sync, never while a rep is standing in a store.
export const storeSkuWeekly = pgTable("store_sku_weekly", {
  id: serial("id").primaryKey(),
  weekEnding: text("week_ending").notNull(),
  client: text("client").notNull(),
  cleanedStoreName: text("cleaned_store_name").notNull(),
  barcode: text("barcode").notNull(),
  articleDescription: text("article_description"),
  banner: text("banner"),
  region: text("region"),
  siteCode: text("site_code"),
  storeSoh: doublePrecision("store_soh"),
  dcSoh: doublePrecision("dc_soh"),
  sellOutP4: doublePrecision("sell_out_p4"),
  avgWeeklySales: doublePrecision("avg_weekly_sales"),
  cover: doublePrecision("cover"),
  classification: text("classification"),
  // Added 2026-08-16: needed so auto-generated tasks match the columns the
  // existing stockfix-weekly-export CSV already has - missed on the initial
  // 2026-08-13 schema even though Nexus's raw store_sku_current rows always
  // include both.
  brand: text("brand"),
  category: text("category"),
  // Added 2026-08-26 (Carin: "on the tasks we must only add active skus") -
  // Nexus's store_sku_current already returns this (dashboard_queries.py
  // reads it straight off the source "Article Status" column, real values
  // confirmed 'Active'/'Discontinued'), it just was never synced into this
  // table before. generateTasksForWeek excludes Discontinued rows.
  articleStatus: text("article_status"),
  // Only real on oos_detail/low_stock_detail rows - null for everything else,
  // never fabricated (same convention as the live fetchStoreSkuList/
  // fetchIssueDetailList code this table replaces).
  estimatedMissedUnits: doublePrecision("estimated_missed_units"),
  suggestedOrderUnits: doublePrecision("suggested_order_units"),
  dcFulfillableUnits: doublePrecision("dc_fulfillable_units"),
  issueDriver: text("issue_driver"),
  priority: text("priority"),
  consecutiveWeeksOOS: integer("consecutive_weeks_oos"),
  // Added 2026-08-13 for fetchStoreOverviewFast - which real Nexus stem
  // this row came from ('oos'/'low'/'overstock'/null for plain
  // store_sku_current rows with no detail match). Inferring this from the
  // classification text alone was fragile; this makes the overview's
  // oosRows/lowStockRows split exactly match what the live fetchStoreOverview
  // computes from oos_detail/low_stock_detail directly.
  sourceStem: text("source_stem"),
  syncedAt: timestamp("synced_at").defaultNow().notNull(),
}, (table) => ({
  uniqueKey: unique("store_sku_weekly_unique").on(table.weekEnding, table.client, table.cleanedStoreName, table.barcode),
  // CRITICAL for fetchStoreOverviewFast/fetchStoreSkuListFast performance -
  // without this, Postgres falls back to the unique index above and scans
  // every row for the client+week (250k+ rows), taking 5+ seconds instead of
  // under 1ms. This was originally added via raw SQL on 2026-08-14 and got
  // silently DROPPED by a later `drizzle-kit push` because it wasn't
  // declared here - found and fixed 2026-08-16 when the live app started
  // timing out. Must stay declared in the schema, not just created ad-hoc.
  lookupIdx: index("idx_store_sku_weekly_lookup").on(table.weekEnding, table.client, sql`upper(trim(${table.cleanedStoreName}))`),
  // Added 2026-08-16 for fetchSkuHistoryFast - that query searches across
  // ALL weeks for one client+store+barcode (no week_ending filter), so the
  // index above (which leads with week_ending) doesn't help at all here.
  // Confirmed real: 433ms, removing 4,517 rows via a barcode post-filter on
  // a big client like P&G. This index leads with the fields that query
  // actually filters on.
  historyIdx: index("idx_store_sku_weekly_history").on(table.client, sql`upper(trim(${table.cleanedStoreName}))`, table.barcode),
  // Added 2026-08-18 - generateTasksForWeek's flaggedIssue query (source_stem
  // in oos/low, estimated_missed_units>0) took 118s on its own with no index
  // covering source_stem, forcing a scan of the whole week (~1.6M rows) every
  // time. This index lets that query (and the overstock cap query, which
  // also filters on source_stem) go straight to the matching subset instead.
  sourceStemIdx: index("idx_store_sku_weekly_source_stem").on(table.weekEnding, table.sourceStem),
  // Same story for the at-risk/negative-SOH queries (store_soh/cover, no
  // source_stem) - these filter on storeSoh and cover with no index at all,
  // same full-week-scan cost.
  soHCoverIdx: index("idx_store_sku_weekly_soh_cover").on(table.weekEnding, table.storeSoh, table.cover),
  // Added 2026-08-18 for the per-client Overstock checkpoint logic
  // (countRealOverstockAtStore/listRealOverstockAtStore/generateTasksForWeek's
  // overstock branch) - each candidate row runs a correlated EXISTS lookup
  // by (client, cleaned_store_name, barcode, week_ending) for every
  // checkpoint week (current, -4wk, -8wk, ...). With no index matching
  // that exact equality set, each lookup falls back to a scan - this index
  // makes it a direct hit instead (real slowness reported 2026-08-18 right
  // after this logic shipped).
  checkpointIdx: index("idx_store_sku_weekly_checkpoint").on(table.client, table.cleanedStoreName, table.barcode, table.weekEnding),
}));

export const insertStoreSkuWeeklySchema = createInsertSchema(storeSkuWeekly).omit({
  id: true,
  syncedAt: true,
});

export type InsertStoreWeeklySummary = z.infer<typeof insertStoreWeeklySummarySchema>;
export type StoreWeeklySummary = typeof storeWeeklySummary.$inferSelect;

// Added 2026-08-16 - the one remaining piece from the original speed audit
// that still called Nexus live (fetchDistributionGapsForStore). The real
// Nexus stem is small and bounded (max 1000 rows network-wide per client,
// confirmed via its own comment in server/nexus.ts) so unlike store_sku_
// weekly this doesn't need per-store pagination - one bulk file per client
// per week, synced the same way as everything else.
export const distributionGaps = pgTable("distribution_gaps", {
  id: serial("id").primaryKey(),
  weekEnding: text("week_ending").notNull(),
  client: text("client").notNull(),
  cleanedStoreName: text("cleaned_store_name").notNull(),
  banner: text("banner"),
  barcode: text("barcode").notNull(),
  articleDescription: text("article_description"),
  brand: text("brand"),
  category: text("category"),
  gapType: text("gap_type"),
  missingStores: integer("missing_stores"),
  coveragePct: doublePrecision("coverage_pct"),
  suggestedAction: text("suggested_action"),
  // Denormalized from Nexus's storeView (store-level aggregate) onto every
  // detail row for this store - same convention as everything else in this
  // schema, avoids a second table/join just to get the store total.
  missingSkusForStore: integer("missing_skus_for_store"),
  avgCoverageForStore: doublePrecision("avg_coverage_for_store"),
  syncedAt: timestamp("synced_at").defaultNow().notNull(),
}, (table) => ({
  lookupIdx: index("idx_distribution_gaps_lookup").on(table.weekEnding, table.client, sql`upper(trim(${table.cleanedStoreName}))`),
}));

export const insertDistributionGapsSchema = createInsertSchema(distributionGaps).omit({
  id: true,
  syncedAt: true,
});

export type InsertDistributionGaps = z.infer<typeof insertDistributionGapsSchema>;
export type DistributionGaps = typeof distributionGaps.$inferSelect;

// Permanent weekly Adoption dashboard snapshot (Carin, 2026-08-25: "the
// adoption report needs to be part of the process... save the file so
// that i can click on a week in the dashboard and see the adoption for
// that week just as i see it now but its saved"). /api/live-dashboard's
// output for a week only exists as long as that week's nexus_tasks rows
// are still in the DB - nexus-wipe-week hard-deletes them. Saving the
// full response JSON here, keyed by week, means a past week's Adoption
// view survives the wipe. Table already exists live in Postgres (created
// directly via SQL on 2026-08-25) - this just re-adds the Drizzle
// definition, lost when the local clone was wiped.
export const adoptionSnapshots = pgTable("adoption_snapshots", {
  weekEnding: text("week_ending").primaryKey(),
  data: jsonb("data").notNull(),
  savedAt: timestamp("saved_at").defaultNow().notNull(),
});

export type AdoptionSnapshot = typeof adoptionSnapshots.$inferSelect;

// Stores the MIME type for files in Replit Object Storage. The public SDK
// exposes no metadata/stat API, so this keeps download responses accurate
// across server restarts and deployments.
export const objectMetadata = pgTable("object_metadata", {
  objectId: text("object_id").primaryKey(),
  contentType: text("content_type").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type ObjectMetadata = typeof objectMetadata.$inferSelect;
