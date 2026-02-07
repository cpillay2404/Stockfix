// MailerSend integration for email notifications
import { MailerSend, EmailParams, Sender, Recipient } from 'mailersend';
import { storage } from './storage';

// Fallback recipients when no contact is found for a rep
const FALLBACK_RECIPIENTS = [
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
  baseUrl?: string;
}

function formatImageUrl(imagePath: string | null | undefined, baseUrl: string | undefined): string {
  if (!imagePath) return 'N/A';
  if (imagePath.startsWith('http')) return imagePath;
  const base = baseUrl || 'https://stockfix.replit.app';
  return `${base}${imagePath.startsWith('/') ? '' : '/'}${imagePath}`;
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
  const cleaned = String(value).replace(',', '.');
  const num = parseFloat(cleaned);
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

function getMailerSendClient() {
  const apiKey = process.env.MAILERSEND_API_KEY;
  
  if (!apiKey) {
    console.error('[Email] MAILERSEND_API_KEY not found in environment');
    throw new Error('MAILERSEND_API_KEY not configured');
  }
  
  console.log('[Email] Using MAILERSEND_API_KEY from environment');
  return new MailerSend({ apiKey });
}

export async function sendTaskCompletedEmail(task: TaskEmailData): Promise<void> {
  console.log('[Email] sendTaskCompletedEmail called');

  const fromEmail = process.env.FROM_EMAIL || 'notifications@stockfixapp.online';
  console.log('[Email] Using FROM_EMAIL:', fromEmail);

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
Image 1: ${task.image1 ? formatImageUrl(task.image1, task.baseUrl) : 'N/A'}
Image 2: ${task.image2 ? formatImageUrl(task.image2, task.baseUrl) : 'N/A'}
`.trim();

  try {
    console.log('[Email] Getting MailerSend client...');
    const mailerSend = getMailerSendClient();
    
    const sentFrom = new Sender(fromEmail, 'StockFix');
    
    // Build recipient list: get rep and manager emails from contacts
    let recipients: string[] = [];
    
    if (task.repName) {
      console.log('[Email] Looking up contact for rep:', task.repName);
      const contact = await storage.getContactByRepName(task.repName);
      
      if (contact) {
        console.log('[Email] Found contact:', contact.repEmail, contact.managerEmail);
        if (contact.repEmail) recipients.push(contact.repEmail);
        if (contact.managerEmail) recipients.push(contact.managerEmail);
      } else {
        console.log('[Email] No contact found for rep:', task.repName, '- no email will be sent');
      }
    } else {
      console.log('[Email] No rep name provided - no email will be sent');
    }
    
    // Always-notify recipients - these always get the email
    const alwaysNotify = [
      'jjooste@meridiangroup.co.za',
      'cpillay@meridiangroup.co.za',
      'ndunn@meridiangroup.co.za'
    ];
    
    // If no contact found for rep, send to always-notify list as primary recipients
    if (recipients.length === 0) {
      console.log('[Email] No contact found for rep - sending to always-notify list only');
      recipients = [...alwaysNotify];
    }
    
    // Remove duplicates
    recipients = [...new Set(recipients)];
    
    // CC recipients - always included (but exclude any that are already primary recipients)
    const ccRecipients = alwaysNotify.filter(email => !recipients.includes(email));
    
    // Client-specific CC recipients (supports multiple emails per client)
    const clientCcMap: Record<string, string[]> = {
      'AQUELLE': ['cperumal@meridiangroup.co.za', 'SuzelleS@aquelle.co.za', 'EstelleP@aquelle.co.za'],
      'ASPEN': ['snaidoo@meridiangroup.co.za', 'kpillay5@aspenpharma.com', 'gpilcher@aspenpharma.com', 'mhadebe2@aspenpharma.com'],
      'LINDT': ['snaidoo@meridiangroup.co.za', 'mhoosen@lindt.com'],
      'WILMAR': ['ldiale@meridiangroup.co.za', 'nivesh.hariram@za.wilmar-intl.com'],
      'SODASTREAM': ['gswart@meridiangroup.co.za', 'nikhil.bassdev@pepsico.com', 'craig.naude@pepsico.com', 'christopher.makgatho@pepsico.com'],
      'ALPEN': ['gswart@meridiangroup.co.za'],
      'ANCHOR': ['gswart@meridiangroup.co.za', 'ftmodeya@lallemand.com', 'ncoetzee@anchor.co.za'],
      'DURACELL': ['gswart@meridiangroup.co.za', 'craig.t@duracell.com'],
      'SOUTHERN OIL': ['gswart@meridiangroup.co.za', 'jeandre@soill.co.za'],
      'P&G': ['lukhna.k@pg.com'],
    };
    
    // Add client-specific CC if applicable
    if (task.client) {
      const clientUpper = task.client.toUpperCase();
      for (const [clientName, emails] of Object.entries(clientCcMap)) {
        if (clientUpper.includes(clientName)) {
          for (const email of emails) {
            if (!ccRecipients.includes(email)) {
              ccRecipients.push(email);
              console.log('[Email] Adding client-specific CC for', clientName, ':', email);
            }
          }
          break;
        }
      }
    }
    
    // Region-specific CC recipients
    const regionCcMap: Record<string, string[]> = {
      'WESTERN CAPE': ['glwigington@meridiangroup.co.za'],
    };
    
    // Add region-specific CC if applicable
    if (task.region) {
      const regionUpper = task.region.toUpperCase();
      for (const [regionName, emails] of Object.entries(regionCcMap)) {
        if (regionUpper.includes(regionName)) {
          for (const email of emails) {
            if (!ccRecipients.includes(email)) {
              ccRecipients.push(email);
              console.log('[Email] Adding region-specific CC for', regionName, ':', email);
            }
          }
          break;
        }
      }
    }
    
    console.log('[Email] Sending to recipients:', recipients, 'CC:', ccRecipients);
    
    for (const recipientEmail of recipients) {
      try {
        const emailParams = new EmailParams()
          .setFrom(sentFrom)
          .setTo([new Recipient(recipientEmail)])
          .setCc(ccRecipients.map(email => new Recipient(email)))
          .setSubject(subject)
          .setText(body);
        
        console.log('[Email] Sending email to:', recipientEmail, 'with CC');
        const result = await mailerSend.email.send(emailParams);
        console.log('[Email] Successfully sent to', recipientEmail);
      } catch (err: any) {
        console.error('[Email] Failed to send to', recipientEmail, ':', err.body || err.message || err);
      }
    }
    
    console.log('[Email] Completed sending to all recipients');
    console.log('[Email] Subject:', subject);
  } catch (error: any) {
    console.error('[Email] Failed to send email:', error.message || error);
    if (error.body) {
      console.error('[Email] Error body:', JSON.stringify(error.body, null, 2));
    }
  }
}
