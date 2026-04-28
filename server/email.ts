// SMTP/Nodemailer integration for email notifications
import nodemailer from 'nodemailer';
import { storage } from './storage';

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
  const base = baseUrl || 'https://stockfixapp.online';
  return `${base}${imagePath.startsWith('/') ? '' : '/'}${imagePath}`;
}

function safeString(value: any): string {
  if (value === null || value === undefined || value === '') return 'N/A';
  return String(value);
}

function formatWfc(value: any): string {
  if (value === null || value === undefined || value === '') return 'N/A';
  const cleaned = String(value).replace(',', '.');
  const num = parseFloat(cleaned);
  if (isNaN(num)) return String(value);
  return num.toFixed(1);
}

function formatSystemAdjusted(value: any): string {
  if (value === null || value === undefined || value === '') return 'N/A';
  const strVal = String(value).toLowerCase();
  if (strVal === 'true' || strVal === 'yes' || strVal === '1') return 'Yes';
  if (strVal === 'false' || strVal === 'no' || strVal === '0') return 'No';
  return String(value);
}

function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.error('[Email] Missing SMTP credentials - SMTP_HOST, SMTP_USER or SMTP_PASS not set');
    return null;
  }

  console.log('[Email] Creating SMTP transporter - host:', host, 'port:', port, 'user:', user);
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

export async function sendTaskCompletedEmail(task: TaskEmailData): Promise<void> {
  console.log('[Email] sendTaskCompletedEmail called');

  const transporter = createTransporter();
  if (!transporter) return;

  const fromEmail = process.env.FROM_EMAIL?.trim() || 'notifications@stockfixapp.online';
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

  // Build recipient list from contact lookup
  let recipients: string[] = [];

  if (task.repName) {
    console.log('[Email] Looking up contact for rep:', task.repName);
    const contact = await storage.getContactByRepName(task.repName);
    if (contact) {
      console.log('[Email] Found contact:', contact.repEmail, contact.managerEmail);
      if (contact.repEmail) recipients.push(contact.repEmail);
      if (contact.managerEmail) recipients.push(contact.managerEmail);
    } else {
      console.log('[Email] No contact found for rep:', task.repName);
    }
  }

  const alwaysNotify = [
    'jjooste@meridiangroup.co.za',
    'cpillay@meridiangroup.co.za',
  ];

  if (recipients.length === 0) {
    console.log('[Email] No contact found - sending to always-notify list only');
    recipients = [...alwaysNotify];
  }

  recipients = [...new Set(recipients)];

  const ccRecipients = alwaysNotify.filter(email => !recipients.includes(email));

  // Client-specific CC
  const clientCcMap: Record<string, string[]> = {
    'AQUELLE': ['cperumal@meridiangroup.co.za', 'SuzelleS@aquelle.co.za', 'EstelleP@aquelle.co.za'],
    'ASPEN': ['snaidoo@meridiangroup.co.za', 'msithole@meridiangroup.co.za', 'lrensburg@meridiangroup.co.za', 'kpillay5@aspenpharma.com', 'gpilcher@aspenpharma.com', 'mhadebe2@aspenpharma.com'],
    'LINDT': ['snaidoo@meridiangroup.co.za', 'mhoosen@lindt.com'],
    'WILMAR': ['ldiale@meridiangroup.co.za', 'muhammad.kajee@za.wilmar-intl.com'],
    'SODASTREAM': ['gswart@meridiangroup.co.za', 'nikhil.bassdev@pepsico.com', 'craig.naude@pepsico.com', 'christopher.makgatho@pepsico.com'],
    'ALPEN': ['gswart@meridiangroup.co.za'],
    'ANCHOR': ['gswart@meridiangroup.co.za', 'lrensburg@meridiangroup.co.za', 'ftmodeya@lallemand.com', 'ncoetzee@anchor.co.za'],
    'DURACELL': ['gswart@meridiangroup.co.za', 'lrensburg@meridiangroup.co.za', 'craig.t@duracell.com'],
    'SOUTHERN OIL': ['gswart@meridiangroup.co.za', 'jeandre@soill.co.za'],
    'P&G': ['lukhna.k@pg.com'],
    'PMI': ['aviwe.sondlo@pmi.com', 'charl.grove@pmi.com'],
    'AGROSERVE': ['lrensburg@meridiangroup.co.za', 'bradley.chenchiah@agroserve.co.za', 'kirsten.cocks@agroserve.co.za'],
    'RACEFOODS': ['chelsea@certosports.co.za'],
    'DYNAMIC BRANDS': ['illona@dynamicbrands.co.za', 'vbotha@meridiangroup.co.za'],
    'BUTTERFLY': ['snaidoo@meridiangroup.co.za', 'msithole@meridiangroup.co.za', 'karin@butterflysa.co.za', 'stockfix@butterflysa.co.za'],
  };

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

  // Region-specific CC
  const regionCcMap: Record<string, string[]> = {
    'WESTERN CAPE': ['glwigington@meridiangroup.co.za'],
  };

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
  console.log('[Email] Subject:', subject);

  try {
    const info = await transporter.sendMail({
      from: `"StockFix Notifications" <${fromEmail}>`,
      to: recipients.join(', '),
      cc: ccRecipients.length > 0 ? ccRecipients.join(', ') : undefined,
      subject,
      text: body,
    });
    console.log('[Email] Successfully sent via SMTP, messageId:', info.messageId);
  } catch (err: any) {
    console.error('[Email] SMTP send failed:', err.message || err);
  }

  console.log('[Email] Completed sending to all recipients');
}
