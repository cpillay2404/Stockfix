import { users, tasks, contacts, clientPasswords, type User, type InsertUser, type Task, type InsertTask, type Contact, type InsertContact, type ClientPassword, type InsertClientPassword } from "@shared/schema";
import { db } from "./db";
import { eq, desc, ilike, or, and, sql, count, gte, lte } from "drizzle-orm";
import bcrypt from "bcryptjs";

interface FiltersCache {
  data: { reps: string[]; stores: string[]; clients: string[]; regions: string[] } | null;
  timestamp: number;
}
const filtersCache: FiltersCache = { data: null, timestamp: 0 };
const CACHE_TTL = 5 * 60 * 1000;

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
  deletePendingTasks(): Promise<void>;
  getLatestWeekEndingDate(): Promise<string | null>;
  getLatestWeekEndingDateForStore(store: string, repName?: string): Promise<string | null>;
  getMostPopulatedWeekEndingDate(): Promise<string | null>;
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
  getLeaderboardAggregated(weekEndingDate: string, client?: string): Promise<{
    repName: string;
    lineManager: string;
    region: string;
    totalTasks: number;
    completedTasks: number;
    priorityTotalTasks: number;
    priorityCompletedTasks: number;
    storesMastered: number;
  }[]>;
  getClientStatsAggregated(weekEndingDate: string): Promise<{
    client: string;
    totalTasks: number;
    completedTasks: number;
  }[]>;
  getRepStreaks(): Promise<Record<string, number>>;
  getActionTypeBreakdown(weekEndingDate: string, clientFilter?: string): Promise<{
    action: string;
    totalTasks: number;
    completedTasks: number;
  }[]>;
  getActionBreakdownByClient(weekEndingDate: string): Promise<{
    client: string;
    actions: { action: string; totalTasks: number; completedTasks: number }[];
  }[]>;
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

  async deletePendingTasks(): Promise<void> {
    await db.delete(tasks).where(
      sql`action_status IS NULL OR action_status = 'Pending'`
    );
  }

  async getLatestWeekEndingDate(): Promise<string | null> {
    const [result] = await db
      .select({ maxDate: sql<string>`MAX(${tasks.weekEndingDate})` })
      .from(tasks);
    return result?.maxDate || null;
  }

  async getLatestWeekEndingDateForStore(store: string, repName?: string): Promise<string | null> {
    const conditions = [eq(tasks.storeName, store)];
    if (repName) {
      conditions.push(eq(tasks.repName, repName));
    }
    const [result] = await db
      .select({ maxDate: sql<string>`MAX(${tasks.weekEndingDate})` })
      .from(tasks)
      .where(and(...conditions));
    return result?.maxDate || null;
  }

  async getMostPopulatedWeekEndingDate(): Promise<string | null> {
    // Get the week ending date that has the most clients with data
    // This prevents partial imports (like only LINDT) from dominating the view
    const result = await db.execute(sql`
      SELECT week_ending_date, COUNT(DISTINCT client) as client_count, COUNT(*) as task_count
      FROM tasks
      GROUP BY week_ending_date
      ORDER BY client_count DESC, week_ending_date DESC
      LIMIT 1
    `);
    const rows = result.rows as any[];
    return rows[0]?.week_ending_date || null;
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

  async getLeaderboardAggregated(weekEndingDate: string, client?: string): Promise<{
    repName: string;
    lineManager: string;
    region: string;
    totalTasks: number;
    completedTasks: number;
    priorityTotalTasks: number;
    priorityCompletedTasks: number;
    storesMastered: number;
  }[]> {
    const conditions = [eq(tasks.weekEndingDate, weekEndingDate)];
    if (client) {
      conditions.push(eq(tasks.client, client));
    }
    const whereClause = and(...conditions);

    const result = await db
      .select({
        repName: tasks.repName,
        lineManager: tasks.lineManager,
        region: tasks.region,
        totalTasks: count(),
        completedTasks: sql<number>`SUM(CASE WHEN ${tasks.actionStatus} = 'Completed' THEN 1 ELSE 0 END)`,
        priorityTotalTasks: sql<number>`SUM(CASE WHEN LOWER(${tasks.action}) LIKE '%urgent: place order%' OR LOWER(${tasks.action}) LIKE '%fix counts: negative%' OR LOWER(${tasks.action}) LIKE '%negative soh%' OR LOWER(${tasks.action}) LIKE '%check count: no sales in 60%' OR LOWER(${tasks.action}) LIKE '%check count: no sales in 15%' OR LOWER(${tasks.action}) LIKE '%check count: no sales in 30%' THEN 1 ELSE 0 END)`,
        priorityCompletedTasks: sql<number>`SUM(CASE WHEN (LOWER(${tasks.action}) LIKE '%urgent: place order%' OR LOWER(${tasks.action}) LIKE '%fix counts: negative%' OR LOWER(${tasks.action}) LIKE '%negative soh%' OR LOWER(${tasks.action}) LIKE '%check count: no sales in 60%' OR LOWER(${tasks.action}) LIKE '%check count: no sales in 15%' OR LOWER(${tasks.action}) LIKE '%check count: no sales in 30%') AND ${tasks.actionStatus} = 'Completed' THEN 1 ELSE 0 END)`,
      })
      .from(tasks)
      .where(whereClause)
      .groupBy(tasks.repName, tasks.lineManager, tasks.region);

    const repNames = result.map(r => r.repName).filter(Boolean);
    let storesMasteredMap: Record<string, number> = {};
    
    if (repNames.length > 0) {
      const storesResult = await db.execute(sql`
        SELECT rep_name, COUNT(*) as mastered
        FROM (
          SELECT rep_name, store_name,
            COUNT(*) as total,
            SUM(CASE WHEN action_status = 'Completed' THEN 1 ELSE 0 END) as completed
          FROM tasks
          WHERE week_ending_date = ${weekEndingDate}
          ${client ? sql`AND client = ${client}` : sql``}
          GROUP BY rep_name, store_name
          HAVING COUNT(*) > 0 AND SUM(CASE WHEN action_status = 'Completed' THEN 1 ELSE 0 END) = COUNT(*)
        ) sub
        GROUP BY rep_name
      `);
      for (const row of storesResult.rows as any[]) {
        storesMasteredMap[row.rep_name] = Number(row.mastered) || 0;
      }
    }

    return result.map(r => ({
      repName: r.repName || 'Unknown',
      lineManager: r.lineManager || '',
      region: r.region || '',
      totalTasks: Number(r.totalTasks) || 0,
      completedTasks: Number(r.completedTasks) || 0,
      priorityTotalTasks: Number(r.priorityTotalTasks) || 0,
      priorityCompletedTasks: Number(r.priorityCompletedTasks) || 0,
      storesMastered: storesMasteredMap[r.repName || ''] || 0,
    }));
  }

  async getClientStatsAggregated(weekEndingDate: string): Promise<{
    client: string;
    totalTasks: number;
    completedTasks: number;
  }[]> {
    const result = await db
      .select({
        client: tasks.client,
        totalTasks: count(),
        completedTasks: sql<number>`SUM(CASE WHEN ${tasks.actionStatus} = 'Completed' THEN 1 ELSE 0 END)`,
      })
      .from(tasks)
      .where(eq(tasks.weekEndingDate, weekEndingDate))
      .groupBy(tasks.client);

    return result.map(r => ({
      client: r.client || 'Unknown',
      totalTasks: Number(r.totalTasks) || 0,
      completedTasks: Number(r.completedTasks) || 0,
    }));
  }

  // Get tasks filtered at SQL level - much more efficient than getAllTasks + filter
  async getRepStreaks(): Promise<Record<string, number>> {
    const result = await db.execute(sql`
      SELECT rep_name, ARRAY_AGG(DISTINCT capture_date::date ORDER BY capture_date::date DESC) as dates
      FROM tasks
      WHERE action_status = 'Completed' AND capture_date IS NOT NULL AND capture_date != ''
      GROUP BY rep_name
    `);
    
    const streaks: Record<string, number> = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    for (const row of result.rows as any[]) {
      const repName = row.rep_name;
      const dates = row.dates;
      if (!dates || dates.length === 0) continue;
      
      const parsedDates = dates
        .map((d: string) => { const dt = new Date(d); dt.setHours(0, 0, 0, 0); return dt; })
        .filter((d: Date) => !isNaN(d.getTime()))
        .sort((a: Date, b: Date) => b.getTime() - a.getTime());
      
      if (parsedDates.length === 0) continue;
      
      const daysSinceLast = Math.floor((today.getTime() - parsedDates[0].getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceLast > 1) { streaks[repName] = 0; continue; }
      
      let streak = 1;
      for (let i = 1; i < parsedDates.length; i++) {
        const diff = Math.floor((parsedDates[i - 1].getTime() - parsedDates[i].getTime()) / (1000 * 60 * 60 * 24));
        if (diff === 1) streak++;
        else break;
      }
      streaks[repName] = streak;
    }
    return streaks;
  }

  async getActionTypeBreakdown(weekEndingDate: string, clientFilter?: string): Promise<{
    action: string;
    totalTasks: number;
    completedTasks: number;
  }[]> {
    const conditions = [eq(tasks.weekEndingDate, weekEndingDate)];
    if (clientFilter) {
      conditions.push(eq(tasks.client, clientFilter));
    }
    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];
    
    const result = await db
      .select({
        action: tasks.action,
        totalTasks: count(),
        completedTasks: sql<number>`SUM(CASE WHEN ${tasks.actionStatus} = 'Completed' THEN 1 ELSE 0 END)`,
      })
      .from(tasks)
      .where(whereClause)
      .groupBy(tasks.action)
      .orderBy(desc(count()));
    
    return result.map(r => ({
      action: r.action || 'Unknown',
      totalTasks: Number(r.totalTasks),
      completedTasks: Number(r.completedTasks),
    }));
  }

  async getActionBreakdownByClient(weekEndingDate: string): Promise<{
    client: string;
    actions: { action: string; totalTasks: number; completedTasks: number }[];
  }[]> {
    const result = await db
      .select({
        client: tasks.client,
        action: tasks.action,
        totalTasks: count(),
        completedTasks: sql<number>`SUM(CASE WHEN ${tasks.actionStatus} = 'Completed' THEN 1 ELSE 0 END)`,
      })
      .from(tasks)
      .where(eq(tasks.weekEndingDate, weekEndingDate))
      .groupBy(tasks.client, tasks.action)
      .orderBy(tasks.client, desc(count()));

    const clientMap = new Map<string, { action: string; totalTasks: number; completedTasks: number }[]>();
    for (const r of result) {
      const client = r.client || 'Unknown';
      if (!clientMap.has(client)) clientMap.set(client, []);
      clientMap.get(client)!.push({
        action: r.action || 'Unknown',
        totalTasks: Number(r.totalTasks),
        completedTasks: Number(r.completedTasks),
      });
    }
    return Array.from(clientMap.entries()).map(([client, actions]) => ({ client, actions }));
  }

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

  // Get tasks within a date range based on weekEndingDate
  async getTasksInDateRange(startDate: Date, endDate: Date, client?: string): Promise<Task[]> {
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];
    
    const conditions = [
      gte(tasks.weekEndingDate, startStr),
      lte(tasks.weekEndingDate, endStr)
    ];
    
    if (client) {
      conditions.push(eq(tasks.client, client));
    }
    
    return await db.select().from(tasks)
      .where(and(...conditions))
      .orderBy(desc(tasks.weekEndingDate));
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

  // Contact operations (case-insensitive lookup)
  async getContactByRepName(repName: string): Promise<Contact | undefined> {
    const [contact] = await db.select().from(contacts).where(ilike(contacts.repName, repName));
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

  async getClientPassword(clientName: string): Promise<ClientPassword | undefined> {
    const [result] = await db.select().from(clientPasswords).where(ilike(clientPasswords.clientName, clientName));
    return result || undefined;
  }

  async verifyClientPassword(clientName: string, password: string): Promise<boolean> {
    const clientPwd = await this.getClientPassword(clientName);
    if (!clientPwd) return false;
    return await bcrypt.compare(password, clientPwd.password);
  }

  async setClientPassword(clientName: string, password: string): Promise<ClientPassword> {
    const normalizedName = clientName.toUpperCase().trim();
    const hashedPassword = await bcrypt.hash(password, 10);
    const existing = await this.getClientPassword(normalizedName);
    if (existing) {
      const [updated] = await db.update(clientPasswords)
        .set({ password: hashedPassword, updatedAt: new Date() })
        .where(eq(clientPasswords.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(clientPasswords).values({ clientName: normalizedName, password: hashedPassword }).returning();
    return created;
  }

  async getAllClientPasswords(): Promise<ClientPassword[]> {
    return await db.select().from(clientPasswords).orderBy(clientPasswords.clientName);
  }

  async deleteClientPassword(clientName: string): Promise<boolean> {
    const result = await db.delete(clientPasswords).where(ilike(clientPasswords.clientName, clientName));
    return true;
  }

  async getDistinctFilters(filters?: { client?: string; region?: string }): Promise<{
    reps: string[];
    stores: string[];
    clients: string[];
    regions: string[];
  }> {
    const noFilters = !filters?.client && !filters?.region;
    if (noFilters && filtersCache.data && (Date.now() - filtersCache.timestamp) < CACHE_TTL) {
      return filtersCache.data;
    }

    let conditions: any[] = [];
    if (filters?.client) {
      conditions.push(eq(tasks.client, filters.client));
    }
    if (filters?.region) {
      conditions.push(eq(tasks.region, filters.region));
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [repsResult, storesResult, clientsResult, regionsResult] = await Promise.all([
      db.selectDistinct({ value: tasks.repName }).from(tasks).where(whereClause),
      db.selectDistinct({ value: tasks.storeName }).from(tasks).where(whereClause),
      db.selectDistinct({ value: tasks.client }).from(tasks).where(whereClause),
      db.selectDistinct({ value: tasks.region }).from(tasks).where(whereClause),
    ]);

    const result = {
      reps: repsResult.map(r => r.value).filter(Boolean).sort() as string[],
      stores: storesResult.map(r => r.value).filter(Boolean).sort() as string[],
      clients: clientsResult.map(r => r.value).filter(Boolean).sort() as string[],
      regions: regionsResult.map(r => r.value).filter(Boolean).sort() as string[],
    };

    if (noFilters) {
      filtersCache.data = result;
      filtersCache.timestamp = Date.now();
    }

    return result;
  }

  clearFiltersCache() {
    filtersCache.data = null;
    filtersCache.timestamp = 0;
  }

  async getStoresForRep(repName: string): Promise<string[]> {
    const result = await db.execute(sql`
      SELECT DISTINCT store_name
      FROM tasks
      WHERE rep_name = ${repName}
        AND week_ending_date = (SELECT MAX(week_ending_date) FROM tasks WHERE rep_name = ${repName})
      ORDER BY store_name
    `);
    return result.rows.map((r: any) => r.store_name).filter(Boolean) as string[];
  }

  // Sourced from store_weekly_summary (the real synced Nexus data), NOT the
  // legacy tasks table - Carin, 2026-08-18: "it mustnt come from the old
  // app." Only caller is the client-facing store picker.
  async getStoresForClient(clientName: string): Promise<string[]> {
    const result = await db.execute(sql`
      SELECT DISTINCT cleaned_store_name
      FROM store_weekly_summary
      WHERE client = ${clientName}
        AND week_ending = (SELECT MAX(week_ending) FROM store_weekly_summary WHERE client = ${clientName})
      ORDER BY cleaned_store_name
    `);
    return result.rows.map((r: any) => r.cleaned_store_name).filter(Boolean) as string[];
  }

  async getDashboardStatsOptimized(filters?: { client?: string; region?: string; weekEndingDate?: string }): Promise<{
    statusCounts: Record<string, number>;
    totalTasks: number;
    totalP4WeekSales: number;
    actionBreakdown: { action: string; count: number }[];
    topStores: { name: string; count: number }[];
    topReps: { name: string; count: number }[];
    clients: { name: string; count: number }[];
    filters: { reps: string[]; stores: string[]; clients: string[]; regions: string[] };
  }> {
    let conditions: any[] = [];
    if (filters?.client) {
      conditions.push(eq(tasks.client, filters.client));
    }
    if (filters?.region) {
      conditions.push(eq(tasks.region, filters.region));
    }
    if (filters?.weekEndingDate) {
      conditions.push(eq(tasks.weekEndingDate, filters.weekEndingDate));
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [statusResults, filterData, p4Result, actionResults, storeResults, repResults, clientResults] = await Promise.all([
      db.select({ 
        status: tasks.actionStatus, 
        cnt: count() 
      }).from(tasks).where(whereClause).groupBy(tasks.actionStatus),
      this.getDistinctFilters(filters),
      db.select({
        totalP4WeekSales: sql<number>`COALESCE(SUM(CAST(NULLIF(${tasks.p4WeekSales}, '') AS NUMERIC)), 0)`,
      }).from(tasks).where(whereClause),
      db.select({ action: tasks.action, cnt: count() })
        .from(tasks).where(whereClause).groupBy(tasks.action).orderBy(desc(count())).limit(6),
      db.select({ name: tasks.storeName, cnt: count() })
        .from(tasks).where(whereClause).groupBy(tasks.storeName).orderBy(desc(count())).limit(5),
      db.select({ name: tasks.repName, cnt: count() })
        .from(tasks).where(whereClause).groupBy(tasks.repName).orderBy(desc(count())).limit(5),
      db.select({ name: tasks.client, cnt: count() })
        .from(tasks).where(whereClause).groupBy(tasks.client).orderBy(desc(count())),
    ]);

    const statusCounts: Record<string, number> = {};
    let totalTasks = 0;
    statusResults.forEach(r => {
      statusCounts[r.status] = Number(r.cnt);
      totalTasks += Number(r.cnt);
    });

    return {
      statusCounts,
      totalTasks,
      totalP4WeekSales: Math.round(Number(p4Result[0]?.totalP4WeekSales) || 0),
      actionBreakdown: actionResults.map(r => ({ action: r.action || 'Unknown', count: Number(r.cnt) || 0 })),
      topStores: storeResults.map(r => ({ name: r.name || 'Unknown', count: Number(r.cnt) || 0 })),
      topReps: repResults.map(r => ({ name: r.name || 'Unknown', count: Number(r.cnt) || 0 })),
      clients: clientResults.map(r => ({ name: r.name || 'Unknown', count: Number(r.cnt) || 0 })),
      filters: filterData,
    };
  }
}

export const storage = new DatabaseStorage();
