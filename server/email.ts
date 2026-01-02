// SendGrid integration for email notifications
import sgMail from '@sendgrid/mail';

const RECIPIENTS = [
  'jjooste@meridiangroup.co.za',
  'cpillay@meridiangroup.co.za'
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
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=sendgrid',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.api_key || !connectionSettings.settings.from_email)) {
    throw new Error('SendGrid not connected');
  }
  return {apiKey: connectionSettings.settings.api_key, email: connectionSettings.settings.from_email};
}

async function getUncachableSendGridClient() {
  const {apiKey, email} = await getCredentials();
  sgMail.setApiKey(apiKey);
  return {
    client: sgMail,
    fromEmail: email
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
    console.log('[Email] Getting SendGrid client...');
    const { client, fromEmail } = await getUncachableSendGridClient();
    
    console.log('[Email] Sending email via SendGrid...');
    const msg = {
      to: RECIPIENTS,
      from: fromEmail,
      subject: subject,
      text: body,
    };
    
    await client.send(msg);

    console.log(`[Email] Successfully sent task completion email to ${RECIPIENTS.join(', ')}`);
    console.log(`[Email] Subject: ${subject}`);
  } catch (error) {
    console.error('[Email] Failed to send task completion email:', error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.error('[Email] Stack trace:', error.stack);
    }
  }
}
