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
