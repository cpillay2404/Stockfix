// Resend integration for email notifications
import { Resend } from 'resend';

const RECIPIENTS = [
  'jjooste@meridiangroup.co.za',
  'cpillay@meridiangroup.co.za',
  'carin.pillay@gmail.com'
];

interface TaskEmailData {
  repName?: string | null;
  client?: string | null;
  storeName?: string | null;
  banner?: string | null;
  region?: string | null;
  weekEndingDate?: string | null;
  category?: string | null;
  barcode?: string | null;
  articleDescription?: string | null;
  stockClassificationThisWeek?: string | null;
  actionColumn?: string | null;
  actionStatus?: string | null;
  storeSOH?: string | null;
  supplyingDcSoh?: string | null;
  sellOutP4Weeks?: string | null;
  wfc?: string | null;
  physicalCount?: string | null;
  variance?: string | null;
  systemAdjusted?: string | null;
  reasonCode?: string | null;
  actionTakenComment?: string | null;
  feedback?: string | null;
  captureDate?: string | null;
  image1?: string | null;
  image2?: string | null;
}

function safeString(value: any): string {
  if (value === null || value === undefined || value === '') {
    return 'N/A';
  }
  return String(value);
}

function formatWfc(value: any): string {
  if (value === null || value === undefined || value === '') {
    return 'N/A';
  }
  const num = parseFloat(String(value));
  if (isNaN(num)) return String(value);
  return num.toFixed(1);
}

function formatSystemAdjusted(value: any): string {
  if (value === null || value === undefined || value === '') {
    return 'N/A';
  }
  const strVal = String(value).toLowerCase();
  if (strVal === 'true' || strVal === 'yes' || strVal === '1') {
    return 'Yes';
  }
  if (strVal === 'false' || strVal === 'no' || strVal === '0') {
    return 'No';
  }
  return String(value);
}

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  
  if (!apiKey) {
    console.error('[Email] RESEND_API_KEY not found in environment');
    throw new Error('RESEND_API_KEY not configured');
  }
  
  console.log('[Email] Using RESEND_API_KEY from environment');
  return new Resend(apiKey);
}

export async function sendTaskCompletedEmail(task: TaskEmailData): Promise<void> {
  console.log('[Email] sendTaskCompletedEmail called');

  const subject = `StockFix | ${safeString(task.client)} | ${safeString(task.storeName)} | ${safeString(task.actionColumn)}`;

  const body = `
Task Completion Notification
============================

Rep Name: ${safeString(task.repName)}
Client: ${safeString(task.client)}
Store: ${safeString(task.storeName)}
Banner: ${safeString(task.banner)}
Region: ${safeString(task.region)}
Week Ending: ${safeString(task.weekEndingDate)}
Category: ${safeString(task.category)}

Product Details
---------------
Barcode: ${safeString(task.barcode)}
Article Description: ${safeString(task.articleDescription)}
Stock Classification (This Week): ${safeString(task.stockClassificationThisWeek)}

Action Details
--------------
Action Column: ${safeString(task.actionColumn)}
Action Status: ${safeString(task.actionStatus)}

Inventory Data
--------------
Store SOH: ${safeString(task.storeSOH)}
Supplying DC SOH: ${safeString(task.supplyingDcSoh)}
Sell Out (P4 Weeks): ${safeString(task.sellOutP4Weeks)}
WFC: ${formatWfc(task.wfc)}

Rep Feedback
------------
Physical Count: ${safeString(task.physicalCount)}
Variance: ${safeString(task.variance)}
System Adjusted: ${formatSystemAdjusted(task.systemAdjusted)}
Reason Code: ${safeString(task.reasonCode)}
Action/Comment: ${safeString(task.actionTakenComment)}
Feedback: ${safeString(task.feedback)}
Capture Date: ${safeString(task.captureDate)}

Images
------
Image 1: ${task.image1 ? `Attached - ${task.image1}` : 'N/A'}
Image 2: ${task.image2 ? `Attached - ${task.image2}` : 'N/A'}
`.trim();

  try {
    console.log('[Email] Getting Resend client...');
    const resend = getResendClient();
    
    // Send to each recipient individually
    for (const recipientEmail of RECIPIENTS) {
      try {
        console.log('[Email] Sending email to:', recipientEmail);
        const result = await resend.emails.send({
          from: 'StockFix <onboarding@resend.dev>',
          to: [recipientEmail],
          subject: subject,
          text: body,
        });
        
        if (result.error) {
          console.error('[Email] Failed to send to', recipientEmail, ':', result.error);
        } else {
          console.log('[Email] Successfully sent to', recipientEmail, 'id:', result.data?.id);
        }
      } catch (err: any) {
        console.error('[Email] Failed to send to', recipientEmail, ':', err.message || err);
      }
    }
    
    console.log('[Email] Completed sending to all recipients');
    console.log('[Email] Subject:', subject);
  } catch (error: any) {
    console.error('[Email] Failed to send email:', error.message || error);
  }
}
