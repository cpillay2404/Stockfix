import { MailerSend, EmailParams, Sender, Recipient } from 'mailersend';
import { storage } from './storage';
import { calculateRepGamificationStats } from './gamification';

const EXECUTIVE_RECIPIENTS = [
  'vbotha@meridiangroup.co.za',
  'ndunn@meridiangroup.co.za',
  'ddutoit@meridiangroup.co.za',
  'jjooste@meridiangroup.co.za',
];

function getMailerSendClient() {
  const apiKey = process.env.MAILERSEND_API_KEY;
  if (!apiKey) {
    throw new Error('MAILERSEND_API_KEY not configured');
  }
  return new MailerSend({ apiKey });
}

export async function sendExecutiveWeeklyEmail(): Promise<void> {
  console.log('[Executive Email] Starting weekly executive email...');
  
  try {
    const latestWeek = await storage.getLatestWeekEndingDate();
    const allTasks = await storage.getTasksFiltered({
      weekEndingDate: latestWeek || undefined,
    });
    
    const allStats = calculateRepGamificationStats(allTasks);
    
    const totalTasks = allTasks.length;
    const completedTasks = allTasks.filter(t => t.actionStatus === 'Completed').length;
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    
    const priorityTasks = allTasks.filter(t => t.action?.toLowerCase().includes('priority'));
    const priorityCompleted = priorityTasks.filter(t => t.actionStatus === 'Completed').length;
    const priorityRate = priorityTasks.length > 0 ? Math.round((priorityCompleted / priorityTasks.length) * 100) : 0;
    
    const regions = Array.from(new Set(allTasks.map(t => t.region).filter(Boolean)));
    const managers = Array.from(new Set(allTasks.map(t => t.lineManager).filter(Boolean)));
    const reps = Array.from(new Set(allTasks.map(t => t.repName).filter(Boolean)));
    
    const regionStats: Record<string, { total: number; completed: number; priority: number; priorityDone: number }> = {};
    allTasks.forEach(task => {
      const region = task.region || 'Unknown';
      if (!regionStats[region]) regionStats[region] = { total: 0, completed: 0, priority: 0, priorityDone: 0 };
      regionStats[region].total++;
      if (task.actionStatus === 'Completed') regionStats[region].completed++;
      if (task.action?.toLowerCase().includes('priority')) {
        regionStats[region].priority++;
        if (task.actionStatus === 'Completed') regionStats[region].priorityDone++;
      }
    });
    
    const topRegions = Object.entries(regionStats)
      .map(([region, stats]) => ({
        region,
        rate: stats.priority > 0 ? Math.round((stats.priorityDone / stats.priority) * 100) : 0,
      }))
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 5);
    
    const topReps = [...allStats]
      .sort((a, b) => b.priorityCompletionRate - a.priorityCompletionRate)
      .slice(0, 5);
    
    const clientStats: Record<string, { total: number; completed: number }> = {};
    allTasks.forEach(task => {
      const client = task.client || 'Unknown';
      if (!clientStats[client]) clientStats[client] = { total: 0, completed: 0 };
      clientStats[client].total++;
      if (task.actionStatus === 'Completed') clientStats[client].completed++;
    });
    
    const clientList = Object.entries(clientStats)
      .map(([client, stats]) => ({
        client,
        rate: stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0,
        total: stats.total,
        completed: stats.completed,
      }))
      .sort((a, b) => b.rate - a.rate);
    
    const htmlEmail = generateExecutiveEmailHtml({
      weekEnding: latestWeek || 'N/A',
      priorityRate,
      completionRate,
      priorityCompleted,
      priorityTotal: priorityTasks.length,
      totalReps: reps.length,
      totalManagers: managers.length,
      totalRegions: regions.length,
      totalTasks,
      topRegions,
      topReps: topReps.map(r => ({ name: r.repName, manager: r.lineManager, rate: r.priorityCompletionRate })),
      clients: clientList,
    });
    
    const mailerSend = getMailerSendClient();
    const fromEmail = process.env.FROM_EMAIL || 'notifications@stockfixapp.online';
    const sentFrom = new Sender(fromEmail, 'StockFix');
    
    const subject = `StockFix Executive Update | Week Ending ${latestWeek || 'Current'}`;
    
    for (const recipientEmail of EXECUTIVE_RECIPIENTS) {
      try {
        const emailParams = new EmailParams()
          .setFrom(sentFrom)
          .setTo([new Recipient(recipientEmail)])
          .setSubject(subject)
          .setHtml(htmlEmail);
        
        await mailerSend.email.send(emailParams);
        console.log('[Executive Email] Sent to', recipientEmail);
      } catch (err: any) {
        console.error('[Executive Email] Failed to send to', recipientEmail, ':', err.message || err);
      }
    }
    
    console.log('[Executive Email] Weekly email completed');
  } catch (error: any) {
    console.error('[Executive Email] Error:', error.message || error);
  }
}

interface EmailData {
  weekEnding: string;
  priorityRate: number;
  completionRate: number;
  priorityCompleted: number;
  priorityTotal: number;
  totalReps: number;
  totalManagers: number;
  totalRegions: number;
  totalTasks: number;
  topRegions: { region: string; rate: number }[];
  topReps: { name: string; manager: string; rate: number }[];
  clients: { client: string; rate: number; total: number; completed: number }[];
}

function generateExecutiveEmailHtml(data: EmailData): string {
  const getColor = (rate: number) => {
    if (rate >= 80) return '#16a34a';
    if (rate >= 50) return '#F36C21';
    return '#dc2626';
  };
  
  const regionRows = data.topRegions.map((r, i) => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${i + 1}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${r.region}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right; color: ${getColor(r.rate)}; font-weight: 700;">${r.rate}%</td>
    </tr>
  `).join('');
  
  const repRows = data.topReps.map((r, i) => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${i + 1}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${r.name}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280; font-size: 12px;">${r.manager}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right; color: ${getColor(r.rate)}; font-weight: 700;">${r.rate}%</td>
    </tr>
  `).join('');
  
  const clientRows = data.clients.map(c => `
    <tr>
      <td style="padding: 6px 8px; border-bottom: 1px solid #e5e7eb; font-weight: 500;">${c.client}</td>
      <td style="padding: 6px 8px; border-bottom: 1px solid #e5e7eb; text-align: center; color: #6b7280;">${c.completed}/${c.total}</td>
      <td style="padding: 6px 8px; border-bottom: 1px solid #e5e7eb; text-align: right; color: ${getColor(c.rate)}; font-weight: 700;">${c.rate}%</td>
    </tr>
  `).join('');
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f0f2f5;">
  <div style="max-width: 700px; margin: 0 auto; padding: 20px;">
    
    <!-- Header -->
    <div style="background-color: #003B71; padding: 20px; border-radius: 12px 12px 0 0; text-align: center;">
      <div style="display: inline-block; background-color: #F36C21; padding: 8px 12px; border-radius: 8px; margin-bottom: 10px;">
        <span style="color: white; font-weight: 700; font-size: 18px;">StockFix</span>
      </div>
      <h1 style="color: white; margin: 10px 0 5px; font-size: 22px;">Executive Performance Update</h1>
      <p style="color: rgba(255,255,255,0.8); margin: 0; font-size: 14px;">Week Ending: ${data.weekEnding}</p>
    </div>
    
    <!-- Performance Summary -->
    <div style="background-color: white; padding: 24px; border-bottom: 1px solid #e5e7eb;">
      <h2 style="color: #003B71; margin: 0 0 16px; font-size: 16px; text-transform: uppercase; letter-spacing: 0.5px;">Overall Performance</h2>
      <div style="display: flex; justify-content: space-around; text-align: center;">
        <div style="flex: 1;">
          <div style="font-size: 42px; font-weight: 700; color: ${getColor(data.priorityRate)};">${data.priorityRate}%</div>
          <div style="color: #6b7280; font-size: 12px; text-transform: uppercase;">Priority Rate</div>
          <div style="color: #9ca3af; font-size: 11px;">${data.priorityCompleted}/${data.priorityTotal} tasks</div>
        </div>
        <div style="width: 1px; background-color: #e5e7eb;"></div>
        <div style="flex: 1;">
          <div style="font-size: 42px; font-weight: 700; color: ${getColor(data.completionRate)};">${data.completionRate}%</div>
          <div style="color: #6b7280; font-size: 12px; text-transform: uppercase;">Overall Rate</div>
          <div style="color: #9ca3af; font-size: 11px;">${data.totalTasks} total tasks</div>
        </div>
      </div>
      
      <div style="display: flex; justify-content: center; gap: 40px; margin-top: 20px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
        <div style="text-align: center;">
          <div style="font-size: 24px; font-weight: 700; color: #003B71;">${data.totalReps}</div>
          <div style="color: #6b7280; font-size: 11px;">Reps</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 24px; font-weight: 700; color: #003B71;">${data.totalManagers}</div>
          <div style="color: #6b7280; font-size: 11px;">Managers</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 24px; font-weight: 700; color: #003B71;">${data.totalRegions}</div>
          <div style="color: #6b7280; font-size: 11px;">Regions</div>
        </div>
      </div>
    </div>
    
    <!-- Top Regions & Reps -->
    <div style="background-color: white; padding: 24px; display: flex; gap: 24px; border-bottom: 1px solid #e5e7eb;">
      <div style="flex: 1;">
        <h3 style="color: #F36C21; margin: 0 0 12px; font-size: 13px; text-transform: uppercase;">Top Regions</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          ${regionRows}
        </table>
      </div>
      <div style="width: 1px; background-color: #e5e7eb;"></div>
      <div style="flex: 1.5;">
        <h3 style="color: #F36C21; margin: 0 0 12px; font-size: 13px; text-transform: uppercase;">Top Reps</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          ${repRows}
        </table>
      </div>
    </div>
    
    <!-- Client Breakdown -->
    <div style="background-color: white; padding: 24px; border-radius: 0 0 12px 12px;">
      <h3 style="color: #F36C21; margin: 0 0 12px; font-size: 13px; text-transform: uppercase;">Client Capture Rates</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
        <tr style="background-color: #f9fafb;">
          <th style="padding: 8px; text-align: left; font-weight: 600; color: #374151;">Client</th>
          <th style="padding: 8px; text-align: center; font-weight: 600; color: #374151;">Tasks</th>
          <th style="padding: 8px; text-align: right; font-weight: 600; color: #374151;">Rate</th>
        </tr>
        ${clientRows}
      </table>
    </div>
    
    <!-- Footer -->
    <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 11px;">
      <p style="margin: 0;">View the live dashboard at <a href="https://stockfix.replit.app/admin/leaderboard" style="color: #F36C21;">stockfix.replit.app/admin/leaderboard</a></p>
      <p style="margin: 8px 0 0;">This is an automated weekly report from StockFix</p>
    </div>
    
  </div>
</body>
</html>
  `;
}

export function startWeeklyEmailScheduler(): void {
  const checkAndSend = () => {
    const now = new Date();
    const saTime = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Johannesburg' }));
    const day = saTime.getDay();
    const hour = saTime.getHours();
    const minute = saTime.getMinutes();
    
    if (day === 1 && hour === 8 && minute === 0) {
      console.log('[Executive Email] Triggering weekly email at 8 AM SA time');
      sendExecutiveWeeklyEmail();
    }
  };
  
  setInterval(checkAndSend, 60000);
  console.log('[Executive Email] Weekly scheduler started - will send Mondays at 8 AM SA time');
}
