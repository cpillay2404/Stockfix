import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, timestamp } from "drizzle-orm/pg-core";
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
  
  // Action Required
  action: text("action").notNull(),
  actionDate: text("action_date").notNull(),
  
  // Feedback / Result
  feedback: text("feedback"),
  captureDate: text("capture_date"),
  actionStatus: text("action_status").notNull().default("Pending"),
  reasonCode: text("reason_code"),
  actionTakenComment: text("action_taken_comment"),
  
  // Images
  image1: text("image1"),
  image2: text("image2"),
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
