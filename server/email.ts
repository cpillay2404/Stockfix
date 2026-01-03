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

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  console.log('[Email] Connector hostname:', hostname);
  
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  console.log('[Email] Token type:', xReplitToken ? (xReplitToken.startsWith('repl ') ? 'repl' : 'depl') : 'none');

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  const url = 'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend';
  console.log('[Email] Fetching from:', url);
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'X_REPLIT_TOKEN': xReplitToken
    }
  });
  
  const data = await response.json();
  console.log('[Email] Response status:', response.status);
  console.log('[Email] Response data items:', data.items?.length ?? 0);
  
  connectionSettings = data.items?.[0];

  if (!connectionSettings) {
    console.error('[Email] No connection settings found');
    throw new Error('Resend not connected');
  }
  
  if (!connectionSettings.settings?.api_key) {
    console.error('[Email] Missing api_key in settings');
    throw new Error('Resend not connected');
  }
  
  // Use verified mlsender.net domain for sending emails
  const fromEmail = 'StockFix <stockfix@test-p7kx4xwq8p8g9yjr.mlsender.net>';
  
  console.log('[Email] Got credentials, from email:', fromEmail);
  return { apiKey: connectionSettings.settings.api_key, fromEmail };
}

async function getUncachableResendClient() {
  const { apiKey, fromEmail } = await getCredentials();
  return {
    client: new Resend(apiKey),
    fromEmail
  };
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
Action Taken Comment: ${safeString(task.actionTakenComment)}
Feedback: ${safeString(task.feedback)}
Capture Date: ${safeString(task.captureDate)}

Images
------
Image 1: ${task.image1 ? task.image1 : 'Not provided'}
Image 2: ${task.image2 ? task.image2 : 'Not provided'}

---
This is an automated notification from StockFix.
`.trim();

  try {
    console.log('[Email] Getting Resend client...');
    const { client, fromEmail } = await getUncachableResendClient();
    
    console.log('[Email] Sending email via Resend...');
    const result = await client.emails.send({
      from: fromEmail,
      to: RECIPIENTS,
      subject: subject,
      text: body,
    });

    console.log(`[Email] Successfully sent task completion email to ${RECIPIENTS.join(', ')}`);
    console.log(`[Email] Subject: ${subject}`);
    console.log(`[Email] Resend result:`, result);
  } catch (error) {
    console.error('[Email] Failed to send task completion email:', error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.error('[Email] Stack trace:', error.stack);
    }
  }
}
