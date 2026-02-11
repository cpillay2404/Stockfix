import type { Task } from "@shared/schema";

export type BadgeType = 'gold' | 'silver' | 'bronze' | 'none';
export type RankChange = 'up' | 'down' | 'same' | 'new';

// Priority action types - these are the most important tasks reps should focus on
const PRIORITY_PATTERNS = [
  'urgent: place order',
  'fix counts: negative',
  'negative soh',
  'check count: no sales in 60',
  'check count: no sales in 15',
];

// Check if a task is a priority task (what reps are measured on)
function isPriorityTask(action: string | null | undefined): boolean {
  if (!action) return false;
  const normalizedAction = action.toLowerCase().trim();
  return PRIORITY_PATTERNS.some(pattern => normalizedAction.includes(pattern));
}

export interface RepBadge {
  type: BadgeType;
  label: string;
  color: string;
  emoji: string;
}

export interface RepGamificationStats {
  repName: string;
  lineManager: string;
  region: string;
  totalTasks: number;
  completedTasks: number;
  openTasks: number;
  completionRate: number;
  // Priority task metrics (what reps are measured on)
  priorityTotalTasks: number;
  priorityCompletedTasks: number;
  priorityOpenTasks: number;
  priorityCompletionRate: number;
  badge: RepBadge;
  streak: number;
  rank: number;
  rankChange: RankChange;
  isTopPerformer: boolean;
  storesMastered: number;
}

export function calculateBadge(completionRate: number): RepBadge {
  if (completionRate >= 100) {
    return { type: 'gold', label: 'Gold', color: '#FFD700', emoji: '🥇' };
  } else if (completionRate >= 90) {
    return { type: 'silver', label: 'Silver', color: '#C0C0C0', emoji: '🥈' };
  } else if (completionRate >= 80) {
    return { type: 'bronze', label: 'Bronze', color: '#CD7F32', emoji: '🥉' };
  }
  return { type: 'none', label: '', color: '', emoji: '' };
}

export function calculateStreak(tasks: Task[], repName: string): number {
  const repTasks = tasks.filter(t => t.repName === repName && t.actionStatus === 'Completed' && t.captureDate);
  
  if (repTasks.length === 0) return 0;
  
  const captureDates = repTasks
    .map(t => {
      const dateStr = t.captureDate;
      if (!dateStr) return null;
      
      // Try ISO format first (2026-02-03T08:27:41.750Z)
      if (dateStr.includes('T') || dateStr.match(/^\d{4}-\d{2}-\d{2}/)) {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) return d;
      }
      
      // Fallback to DD/MM/YYYY or DD-MM-YYYY format
      const parts = dateStr.split(/[\/\-]/);
      if (parts.length >= 3) {
        const year = parts[2]?.length === 4 ? parseInt(parts[2]) : 2000 + parseInt(parts[2] || '0');
        const month = parseInt(parts[1] || '1') - 1;
        const day = parseInt(parts[0] || '1');
        return new Date(year, month, day);
      }
      return null;
    })
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime());

  if (captureDates.length === 0) return 0;

  let streak = 1;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const lastCaptureDate = new Date(captureDates[0]);
  lastCaptureDate.setHours(0, 0, 0, 0);
  
  const daysSinceLastCapture = Math.floor((today.getTime() - lastCaptureDate.getTime()) / (1000 * 60 * 60 * 24));
  if (daysSinceLastCapture > 1) return 0;

  for (let i = 1; i < captureDates.length; i++) {
    const currentDate = new Date(captureDates[i]);
    currentDate.setHours(0, 0, 0, 0);
    const prevDate = new Date(captureDates[i - 1]);
    prevDate.setHours(0, 0, 0, 0);
    
    const dayDiff = Math.floor((prevDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (dayDiff === 1) {
      streak++;
    } else if (dayDiff > 1) {
      break;
    }
  }

  return streak;
}

export function calculateStoresMastered(tasks: Task[], repName: string): number {
  const repTasks = tasks.filter(t => t.repName === repName);
  const storeStats: Record<string, { total: number; completed: number }> = {};
  
  repTasks.forEach(task => {
    const store = task.storeName;
    if (!storeStats[store]) {
      storeStats[store] = { total: 0, completed: 0 };
    }
    storeStats[store].total++;
    if (task.actionStatus === 'Completed') {
      storeStats[store].completed++;
    }
  });

  return Object.values(storeStats).filter(s => s.total > 0 && s.completed === s.total).length;
}

export function calculateRepGamificationStats(tasks: Task[]): RepGamificationStats[] {
  const repStats: Record<string, {
    repName: string;
    lineManager: string;
    region: string;
    totalTasks: number;
    completedTasks: number;
    openTasks: number;
    priorityTotalTasks: number;
    priorityCompletedTasks: number;
    priorityOpenTasks: number;
  }> = {};

  tasks.forEach(task => {
    const rep = task.repName || 'Unknown';
    if (!repStats[rep]) {
      repStats[rep] = {
        repName: rep,
        lineManager: task.lineManager || '',
        region: task.region || '',
        totalTasks: 0,
        completedTasks: 0,
        openTasks: 0,
        priorityTotalTasks: 0,
        priorityCompletedTasks: 0,
        priorityOpenTasks: 0,
      };
    }
    repStats[rep].totalTasks++;
    
    const isPriority = isPriorityTask(task.action);
    if (isPriority) {
      repStats[rep].priorityTotalTasks++;
    }
    
    if (task.actionStatus === 'Completed') {
      repStats[rep].completedTasks++;
      if (isPriority) {
        repStats[rep].priorityCompletedTasks++;
      }
    } else {
      repStats[rep].openTasks++;
      if (isPriority) {
        repStats[rep].priorityOpenTasks++;
      }
    }
  });

  const statsArray = Object.values(repStats).map(rep => {
    const completionRate = rep.totalTasks > 0 
      ? Math.round((rep.completedTasks / rep.totalTasks) * 100) 
      : 0;
    
    // Priority completion rate - this is what reps are measured on
    const priorityCompletionRate = rep.priorityTotalTasks > 0 
      ? Math.round((rep.priorityCompletedTasks / rep.priorityTotalTasks) * 100) 
      : 0;
    
    // Badge is based on priority task completion, not overall
    return {
      ...rep,
      completionRate,
      priorityCompletionRate,
      badge: calculateBadge(priorityCompletionRate), // Badge based on PRIORITY tasks
      streak: calculateStreak(tasks, rep.repName),
      storesMastered: calculateStoresMastered(tasks, rep.repName),
      rank: 0,
      rankChange: 'same' as RankChange,
      isTopPerformer: false,
    };
  });

  // Sort by PRIORITY completion rate (what reps are measured on)
  statsArray.sort((a, b) => b.priorityCompletionRate - a.priorityCompletionRate);

  statsArray.forEach((rep, index) => {
    rep.rank = index + 1;
    rep.isTopPerformer = index < 3;
  });

  return statsArray;
}

export function getLeaderboard(stats: RepGamificationStats[], limit: number = 10): RepGamificationStats[] {
  return stats.slice(0, limit);
}

export function getTeamStats(stats: RepGamificationStats[], managerName?: string) {
  const filtered = managerName 
    ? stats.filter(s => s.lineManager === managerName)
    : stats;
  
  const totalReps = filtered.length;
  const totalTasks = filtered.reduce((sum, r) => sum + r.totalTasks, 0);
  const totalCompleted = filtered.reduce((sum, r) => sum + r.completedTasks, 0);
  const avgCompletionRate = totalReps > 0 
    ? Math.round(filtered.reduce((sum, r) => sum + r.completionRate, 0) / totalReps)
    : 0;
  
  // Priority task metrics (what reps are measured on)
  const priorityTotalTasks = filtered.reduce((sum, r) => sum + r.priorityTotalTasks, 0);
  const priorityCompletedTasks = filtered.reduce((sum, r) => sum + r.priorityCompletedTasks, 0);
  const avgPriorityCompletionRate = totalReps > 0 
    ? Math.round(filtered.reduce((sum, r) => sum + r.priorityCompletionRate, 0) / totalReps)
    : 0;
  
  const goldCount = filtered.filter(r => r.badge.type === 'gold').length;
  const silverCount = filtered.filter(r => r.badge.type === 'silver').length;
  const bronzeCount = filtered.filter(r => r.badge.type === 'bronze').length;
  
  return {
    totalReps,
    totalTasks,
    totalCompleted,
    avgCompletionRate,
    // Priority metrics (what the team is measured on)
    priorityTotalTasks,
    priorityCompletedTasks,
    avgPriorityCompletionRate,
    badgeCounts: { gold: goldCount, silver: silverCount, bronze: bronzeCount },
    topPerformers: filtered.slice(0, 3),
  };
}
