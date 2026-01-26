import { users, tasks, contacts, type User, type InsertUser, type Task, type InsertTask, type Contact, type InsertContact } from "@shared/schema";
import { db } from "./db";
import { eq, desc, ilike, or, and, sql, count } from "drizzle-orm";

export interface TaskFilters {
  region?: string;
  rep?: string;
  store?: string;
  client?: string;
  issue?: string;
  category?: string;
  article?: string;
  weekEndingDate?: string;
}

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Task operations
  getAllTasks(): Promise<Task[]>;
  getTaskCount(): Promise<number>;
  getTasksBatch(offset: number, limit: number): Promise<Task[]>;
  getTaskCountByWeek(weekEndingDate: string): Promise<number>;
  getTasksBatchByWeek(weekEndingDate: string, offset: number, limit: number): Promise<Task[]>;
  getTasksPaginated(page: number, limit: number, search?: string, status?: string, filters?: TaskFilters): Promise<{ tasks: Task[]; total: number; page: number; totalPages: number }>;
  getTaskById(id: number): Promise<Task | undefined>;
  getTaskByUniqueId(uniqueId: string): Promise<Task | undefined>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: number, updates: Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Task | undefined>;
  deleteTask(id: number): Promise<boolean>;
  deleteAllTasks(): Promise<void>;
  getLatestWeekEndingDate(): Promise<string | null>;
  bulkCreateTasks(tasks: InsertTask[]): Promise<Task[]>;
  bulkCreateTasksIgnoreDuplicates(tasks: InsertTask[]): Promise<Task[]>;
  getRepStatsAggregated(weekEndingDate?: string, manager?: string): Promise<{
    repName: string;
    lineManager: string;
    region: string;
    totalTasks: number;
    completedTasks: number;
    openTasks: number;
  }[]>;
  getTaskKPIs(weekEndingDate?: string, manager?: string): Promise<{
    totalOpen: number;
    totalCompleted: number;
    total: number;
  }>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  // Task operations
  async getAllTasks(): Promise<Task[]> {
    return await db.select().from(tasks).orderBy(desc(tasks.createdAt));
  }

  async getTaskCount(): Promise<number> {
    const [result] = await db.select({ count: count() }).from(tasks);
    return result?.count || 0;
  }

  async getTasksBatch(offset: number, limit: number): Promise<Task[]> {
    return await db.select().from(tasks).orderBy(tasks.id).limit(limit).offset(offset);
  }

  async getTaskCountByWeek(weekEndingDate: string): Promise<number> {
    const [result] = await db.select({ count: count() }).from(tasks).where(eq(tasks.weekEndingDate, weekEndingDate));
    return result?.count || 0;
  }

  async getTasksBatchByWeek(weekEndingDate: string, offset: number, limit: number): Promise<Task[]> {
    return await db.select().from(tasks).where(eq(tasks.weekEndingDate, weekEndingDate)).orderBy(tasks.id).limit(limit).offset(offset);
  }

  async getTasksPaginated(page: number, limit: number, search?: string, status?: string, filters?: TaskFilters): Promise<{ tasks: Task[]; total: number; page: number; totalPages: number }> {
    const offset = (page - 1) * limit;
    
    let conditions = [];
    
    if (search) {
      conditions.push(
        or(
          ilike(tasks.articleDescription, `%${search}%`),
          ilike(tasks.storeName, `%${search}%`),
          ilike(tasks.barcode, `%${search}%`),
          ilike(tasks.client, `%${search}%`)
        )
      );
    }
    
    if (status && status !== 'all') {
      conditions.push(eq(tasks.actionStatus, status === 'pending' ? 'Pending' : 'Completed'));
    }
    
    // Apply additional filters
    if (filters?.region) {
      conditions.push(eq(tasks.region, filters.region));
    }
    if (filters?.rep) {
      conditions.push(eq(tasks.repName, filters.rep));
    }
    if (filters?.store) {
      conditions.push(eq(tasks.storeName, filters.store));
    }
    if (filters?.client) {
      conditions.push(eq(tasks.client, filters.client));
    }
    if (filters?.issue) {
      conditions.push(eq(tasks.stockClassification, filters.issue));
    }
    if (filters?.category) {
      conditions.push(eq(tasks.category, filters.category));
    }
    if (filters?.article) {
      conditions.push(eq(tasks.articleDescription, filters.article));
    }
    if (filters?.weekEndingDate) {
      conditions.push(eq(tasks.weekEndingDate, filters.weekEndingDate));
    }
    
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    
    const [countResult] = await db
      .select({ count: count() })
      .from(tasks)
      .where(whereClause);
    
    const total = countResult?.count || 0;
    
    const taskResults = await db
      .select()
      .from(tasks)
      .where(whereClause)
      .orderBy(tasks.storeName, desc(sql`CAST(${tasks.missedSales} AS NUMERIC)`))
      .limit(limit)
      .offset(offset);
    
    return {
      tasks: taskResults,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    };
  }

  async getTaskById(id: number): Promise<Task | undefined> {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    return task || undefined;
  }

  async getTaskByUniqueId(uniqueId: string): Promise<Task | undefined> {
    const [task] = await db.select().from(tasks).where(eq(tasks.uniqueId, uniqueId));
    return task || undefined;
  }

  async createTask(insertTask: InsertTask): Promise<Task> {
    const [task] = await db
      .insert(tasks)
      .values(insertTask)
      .returning();
    return task;
  }

  async updateTask(id: number, updates: Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Task | undefined> {
    const [updated] = await db
      .update(tasks)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteTask(id: number): Promise<boolean> {
    const result = await db.delete(tasks).where(eq(tasks.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async deleteAllTasks(): Promise<void> {
    await db.delete(tasks);
  }

  async getLatestWeekEndingDate(): Promise<string | null> {
    const [result] = await db
      .select({ maxDate: sql<string>`MAX(${tasks.weekEndingDate})` })
      .from(tasks);
    return result?.maxDate || null;
  }

  async bulkCreateTasks(insertTasks: InsertTask[]): Promise<Task[]> {
    if (insertTasks.length === 0) return [];
    return await db.insert(tasks).values(insertTasks).returning();
  }

  async bulkCreateTasksIgnoreDuplicates(insertTasks: InsertTask[]): Promise<Task[]> {
    if (insertTasks.length === 0) return [];
    return await db.insert(tasks).values(insertTasks).onConflictDoNothing().returning();
  }

  // Efficient aggregation: get rep stats at SQL level for current week
  async getRepStatsAggregated(weekEndingDate?: string, manager?: string): Promise<{
    repName: string;
    lineManager: string;
    region: string;
    totalTasks: number;
    completedTasks: number;
    openTasks: number;
  }[]> {
    let conditions = [];
    if (weekEndingDate) {
      conditions.push(eq(tasks.weekEndingDate, weekEndingDate));
    }
    if (manager) {
      conditions.push(eq(tasks.lineManager, manager));
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const result = await db
      .select({
        repName: tasks.repName,
        lineManager: tasks.lineManager,
        region: tasks.region,
        totalTasks: count(),
        completedTasks: sql<number>`SUM(CASE WHEN ${tasks.actionStatus} = 'Completed' THEN 1 ELSE 0 END)`,
        openTasks: sql<number>`SUM(CASE WHEN ${tasks.actionStatus} != 'Completed' OR ${tasks.actionStatus} IS NULL THEN 1 ELSE 0 END)`,
      })
      .from(tasks)
      .where(whereClause)
      .groupBy(tasks.repName, tasks.lineManager, tasks.region);

    return result.map(r => ({
      repName: r.repName || 'Unknown',
      lineManager: r.lineManager || '',
      region: r.region || '',
      totalTasks: Number(r.totalTasks) || 0,
      completedTasks: Number(r.completedTasks) || 0,
      openTasks: Number(r.openTasks) || 0,
    }));
  }

  // Efficient aggregation: get task counts for dashboard KPIs
  async getTaskKPIs(weekEndingDate?: string, manager?: string): Promise<{
    totalOpen: number;
    totalCompleted: number;
    total: number;
  }> {
    let conditions = [];
    if (weekEndingDate) {
      conditions.push(eq(tasks.weekEndingDate, weekEndingDate));
    }
    if (manager) {
      conditions.push(eq(tasks.lineManager, manager));
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [result] = await db
      .select({
        total: count(),
        totalCompleted: sql<number>`SUM(CASE WHEN ${tasks.actionStatus} = 'Completed' THEN 1 ELSE 0 END)`,
        totalOpen: sql<number>`SUM(CASE WHEN ${tasks.actionStatus} != 'Completed' OR ${tasks.actionStatus} IS NULL THEN 1 ELSE 0 END)`,
      })
      .from(tasks)
      .where(whereClause);

    return {
      total: Number(result?.total) || 0,
      totalCompleted: Number(result?.totalCompleted) || 0,
      totalOpen: Number(result?.totalOpen) || 0,
    };
  }

  // Get tasks filtered at SQL level - much more efficient than getAllTasks + filter
  async getTasksFiltered(filters: {
    weekEndingDate?: string;
    repName?: string;
    lineManager?: string;
    store?: string;
    client?: string;
    region?: string;
    actionStatus?: string;
    limit?: number;
    offset?: number;
  }): Promise<Task[]> {
    let conditions = [];
    
    if (filters.weekEndingDate) {
      conditions.push(eq(tasks.weekEndingDate, filters.weekEndingDate));
    }
    if (filters.repName) {
      conditions.push(eq(tasks.repName, filters.repName));
    }
    if (filters.lineManager) {
      conditions.push(eq(tasks.lineManager, filters.lineManager));
    }
    if (filters.store) {
      conditions.push(eq(tasks.storeName, filters.store));
    }
    if (filters.client) {
      conditions.push(eq(tasks.client, filters.client));
    }
    if (filters.region) {
      conditions.push(eq(tasks.region, filters.region));
    }
    if (filters.actionStatus) {
      conditions.push(eq(tasks.actionStatus, filters.actionStatus));
    }
    
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    
    let query = db.select().from(tasks).where(whereClause).orderBy(desc(tasks.createdAt));
    
    if (filters.limit) {
      query = query.limit(filters.limit) as any;
    }
    if (filters.offset) {
      query = query.offset(filters.offset) as any;
    }
    
    return await query;
  }

  // Get task count with filters at SQL level
  async getTaskCountFiltered(filters: {
    weekEndingDate?: string;
    repName?: string;
    lineManager?: string;
    actionStatus?: string;
  }): Promise<number> {
    let conditions = [];
    
    if (filters.weekEndingDate) {
      conditions.push(eq(tasks.weekEndingDate, filters.weekEndingDate));
    }
    if (filters.repName) {
      conditions.push(eq(tasks.repName, filters.repName));
    }
    if (filters.lineManager) {
      conditions.push(eq(tasks.lineManager, filters.lineManager));
    }
    if (filters.actionStatus) {
      conditions.push(eq(tasks.actionStatus, filters.actionStatus));
    }
    
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    
    const [result] = await db.select({ count: count() }).from(tasks).where(whereClause);
    return result?.count || 0;
  }

  async getChartAggregates(filters: {
    store: string;
    repName?: string;
    client?: string;
    article?: string;
    limit?: number;
  }): Promise<{ weekEnding: string; storeSohSum: number; sellOutP4Sum: number; wfcAvg: number }[]> {
    let conditions = [eq(tasks.storeName, filters.store)];
    
    if (filters.repName) {
      conditions.push(eq(tasks.repName, filters.repName));
    }
    if (filters.client) {
      conditions.push(eq(tasks.client, filters.client));
    }
    
    // When filtering by article, look up the barcode first and filter by that
    // This ensures historical data with varying descriptions but same barcode are grouped together
    if (filters.article) {
      const barcodeResult = await db
        .select({ barcode: tasks.barcode })
        .from(tasks)
        .where(eq(tasks.articleDescription, filters.article))
        .limit(1);
      
      if (barcodeResult.length > 0 && barcodeResult[0].barcode) {
        conditions.push(eq(tasks.barcode, barcodeResult[0].barcode));
      } else {
        // Fallback to article description if no barcode found
        conditions.push(eq(tasks.articleDescription, filters.article));
      }
    }
    
    const whereClause = and(...conditions);
    const limitCount = filters.limit || 12;
    
    const result = await db
      .select({
        weekEnding: tasks.weekEndingDate,
        storeSohSum: sql<number>`COALESCE(SUM(CAST(${tasks.storeSoh} AS NUMERIC)), 0)`,
        sellOutP4Sum: sql<number>`COALESCE(SUM(CAST(${tasks.p4WeekSales} AS NUMERIC)), 0)`,
        wfcAvg: sql<number>`COALESCE(AVG(CAST(${tasks.storeWfc} AS NUMERIC)), 0)`,
      })
      .from(tasks)
      .where(whereClause)
      .groupBy(tasks.weekEndingDate)
      .orderBy(desc(tasks.weekEndingDate))
      .limit(limitCount);
    
    return result.map(r => ({
      weekEnding: r.weekEnding || '',
      storeSohSum: Math.round(Number(r.storeSohSum) || 0),
      sellOutP4Sum: Math.round(Number(r.sellOutP4Sum) || 0),
      wfcAvg: Math.round((Number(r.wfcAvg) || 0) * 10) / 10,
    }));
  }

  // Contact operations
  async getContactByRepName(repName: string): Promise<Contact | undefined> {
    const [contact] = await db.select().from(contacts).where(eq(contacts.repName, repName));
    return contact || undefined;
  }

  async getAllContacts(): Promise<Contact[]> {
    return await db.select().from(contacts).orderBy(contacts.repName);
  }

  async createContact(contact: InsertContact): Promise<Contact> {
    const [created] = await db.insert(contacts).values(contact).returning();
    return created;
  }

  async upsertContact(contact: InsertContact): Promise<Contact> {
    const existing = await this.getContactByRepName(contact.repName);
    if (existing) {
      const [updated] = await db
        .update(contacts)
        .set({
          repEmail: contact.repEmail,
          managerName: contact.managerName,
          managerEmail: contact.managerEmail,
          updatedAt: new Date(),
        })
        .where(eq(contacts.id, existing.id))
        .returning();
      return updated;
    }
    return this.createContact(contact);
  }

  async bulkUpsertContacts(contactList: InsertContact[]): Promise<number> {
    let count = 0;
    for (const contact of contactList) {
      await this.upsertContact(contact);
      count++;
    }
    return count;
  }

  async deleteAllContacts(): Promise<void> {
    await db.delete(contacts);
  }
}

export const storage = new DatabaseStorage();
