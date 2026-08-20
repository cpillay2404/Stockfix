import { storage } from './storage';
import { db } from './db';
import { resourceRoster } from '@shared/schema';
import { sql } from 'drizzle-orm';

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

function safeString(val: any): string {
  if (val === null || val === undefined) return 'N/A';
  return String(val);
}

function formatWfc(val: any): string {
  if (val === null || val === undefined) return 'N/A';
  const num = parseFloat(String(val));
  if (isNaN(num)) return String(val);
  return num.toFixed(1) + ' weeks';
}

function formatSystemAdjusted(val: any): string {
  if (val === null || val === undefined) return 'N/A';
  return String(val);
}

function formatImageUrl(imagePath: string, baseUrl?: string): string {
  if (!imagePath) return 'N/A';
  if (imagePath.startsWith('http')) return imagePath;
  const base = baseUrl || 'https://stockfixapp.online';
  return `${base}${imagePath}`;
}

// MailerSend API key sanitizing - shared by every send function below.
function getSanitizedApiKey(): string | null {
  const rawKey = (process.env.MAILERSEND_API_KEY || process.env.MAILERSEND_API_KEY_V2 || '').trim();
  if (!rawKey) return null;
  let apiKey = rawKey.replace(/[^\x20-\x7E]/g, '');
  if (apiKey.length > 69) {
    const match = apiKey.match(/mlsn\.([a-f0-9]{64})/i);
    if (match) apiKey = 'mlsn.' + match[1];
  }
  return apiKey;
}

const CLIENT_CC_MAP: Record<string, string[]> = {
  'AQUELLE': ['cperumal@meridiangroup.co.za', 'SuzelleS@aquelle.co.za', 'EstelleP@aquelle.co.za'],
  'ASPEN': ['snaidoo@meridiangroup.co.za', 'msithole@meridiangroup.co.za', 'lrensburg@meridiangroup.co.za', 'gpilcher@aspenpharma.com', 'mhadebe2@aspenpharma.com'],
  'LINDT': ['snaidoo@meridiangroup.co.za', 'mhoosen@lindt.com'],
  'WILMAR': ['ldiale@meridiangroup.co.za', 'muhammad.kajee@za.wilmar-intl.com'],
  'SODASTREAM': ['gswart@meridiangroup.co.za', 'nikhil.bassdev@pepsico.com', 'craig.naude@pepsico.com', 'christopher.makgatho@pepsico.com'],
  'ALPEN': ['gswart@meridiangroup.co.za'],
  'ANCHOR': ['gswart@meridiangroup.co.za', 'lrensburg@meridiangroup.co.za', 'ftmodeya@lallemand.com', 'ncoetzee@anchor.co.za'],
  'DURACELL': ['gswart@meridiangroup.co.za', 'lrensburg@meridiangroup.co.za', 'craig.t@duracell.com'],
  'SOUTHERN OIL': ['gswart@meridiangroup.co.za', 'jeandre@soill.co.za'],
  'P&G': [],
  'PMI': ['aviwe.sondlo@pmi.com', 'charl.grove@pmi.com'],
  'AGROSERVE': ['lrensburg@meridiangroup.co.za', 'bradley.chenchiah@agroserve.co.za', 'kirsten.cocks@agroserve.co.za'],
  'RACEFOODS': ['chelsea@certosports.co.za'],
  'DYNAMIC BRANDS': ['illona@dynamicbrands.co.za'],
  'BUTTERFLY': ['snaidoo@meridiangroup.co.za', 'msithole@meridiangroup.co.za', 'stockfix@butterflysa.co.za'],
  'PENFLEX': ['jonny@penflex.co.za'],
  'MAGALIES': ['christo@magaliesbrands.co.za', 'ldiale@meridiangroup.co.za', 'Wayne@magaliesbrands.co.za'],
  'SIR JUICE': ['MorvinM@sirfruit.co.za', 'AnnelizeV@sirfruit.co.za', 'Karmenv@sirfruit.co.za'],
  'CAPE COOKIES': ['chris.calitz@capecookies.com', 'sureshin.aroonslam@capecookies.com'],
  'SWEET NOTHINGS': ['craig@timeworks-kzn.co.za'],
};

// Shared recipient resolution - extracted 2026-08-19 so the new visit-
// summary digest email (Carin: "can we consolidate all captures for one
// store in one email") uses the exact same recipient logic as the
// existing per-task completion email, rather than a second copy of it.
async function resolveEmailRecipients(params: { repName?: string | null; client?: string | null; region?: string | null }): Promise<{ recipients: string[]; ccRecipients: string[] }> {
  let recipients: string[] = [];

  if (params.repName) {
    // Real Call Cycle Master emails (Carin, 2026-08-19: "they are in there
    // for some people... both in the P&G and the call cycle master") -
    // preferred over the separate contacts import when present, since
    // it's the file actually kept up to date weekly. Tried alongside (not
    // instead of) the contacts lookup below - real emails from either
    // source are combined and deduped, not one replacing the other.
    try {
      const [repRow] = await db.select({ email: resourceRoster.email, manager: resourceRoster.manager })
        .from(resourceRoster)
        .where(sql`upper(trim(${resourceRoster.resourceName})) = ${params.repName.toUpperCase().trim()}`)
        .limit(1);
      if (repRow?.email) {
        console.log('[Email] Found rep email in resource_roster:', repRow.email);
        recipients.push(repRow.email);
      }
      if (repRow?.manager) {
        const [managerRow] = await db.select({ email: resourceRoster.email })
          .from(resourceRoster)
          .where(sql`upper(trim(${resourceRoster.resourceName})) = ${repRow.manager.toUpperCase().trim()}`)
          .limit(1);
        if (managerRow?.email) {
          console.log('[Email] Found manager email in resource_roster:', managerRow.email);
          recipients.push(managerRow.email);
        }
      }
    } catch (rosterErr: any) {
      console.error('[Email] resource_roster email lookup failed:', rosterErr.message);
    }

    console.log('[Email] Looking up contact for rep:', params.repName);
    try {
      const contactTimeout = new Promise<undefined>((_, reject) =>
        setTimeout(() => reject(new Error('DB contact lookup timeout after 5s')), 5000)
      );
      const contact = await Promise.race([storage.getContactByRepName(params.repName), contactTimeout]);
      if (contact) {
        console.log('[Email] Found contact:', contact.repEmail, contact.managerEmail);
        if (contact.repEmail) recipients.push(contact.repEmail);
        if (contact.managerEmail) recipients.push(contact.managerEmail);
      } else {
        console.log('[Email] No contact found for rep:', params.repName);
      }
    } catch (dbErr: any) {
      console.error('[Email] Contact lookup failed:', dbErr.message);
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

  recipients = [...new Set(recipients.map(e => e.toLowerCase()))];
  const ccRecipients = alwaysNotify.filter(email => !recipients.includes(email.toLowerCase()));

  if (params.client) {
    const clientUpper = params.client.toUpperCase();
    for (const [clientName, emails] of Object.entries(CLIENT_CC_MAP)) {
      if (clientUpper.includes(clientName)) {
        for (const email of emails) {
          if (!ccRecipients.map(e => e.toLowerCase()).includes(email.toLowerCase()) && !recipients.includes(email.toLowerCase())) {
            ccRecipients.push(email);
            console.log('[Email] Adding client-specific CC for', clientName, ':', email);
          }
        }
        break;
      }
    }
  }

  if (params.region) {
    const regionUpper = params.region.toUpperCase();

    if (regionUpper.includes('WESTERN CAPE')) {
      if (!ccRecipients.map(e => e.toLowerCase()).includes('glwigington@meridiangroup.co.za') && !recipients.includes('glwigington@meridiangroup.co.za')) {
        ccRecipients.push('glwigington@meridiangroup.co.za');
        console.log('[Email] Adding region CC (Western Cape): glwigington@meridiangroup.co.za');
      }
    }

    const fsenekhalRegions = ['GAUTENG', 'MPUMALANGA', 'LIMPOPO'];
    const jversterRegions = ['FREE STATE', 'NORTH WEST'];

    if (fsenekhalRegions.some(r => regionUpper.includes(r))) {
      if (!ccRecipients.map(e => e.toLowerCase()).includes('fsenekal@meridiangroup.co.za') && !recipients.includes('fsenekal@meridiangroup.co.za')) {
        ccRecipients.push('fsenekal@meridiangroup.co.za');
        console.log('[Email] Adding region CC (Gauteng/Mpu/Lim):', 'fsenekal@meridiangroup.co.za');
      }
    } else if (jversterRegions.some(r => regionUpper.includes(r))) {
      if (!ccRecipients.map(e => e.toLowerCase()).includes('jverster@meridiangroup.co.za') && !recipients.includes('jverster@meridiangroup.co.za')) {
        ccRecipients.push('jverster@meridiangroup.co.za');
        console.log('[Email] Adding region CC (FS/NW):', 'jverster@meridiangroup.co.za');
      }
    }
  }

  return { recipients, ccRecipients };
}

async function sendViaMailerSend(params: { subject: string; body: string; recipients: string[]; ccRecipients: string[] }): Promise<boolean> {
  const apiKey = getSanitizedApiKey();
  if (!apiKey) {
    console.error('[Email] No MailerSend API key found');
    return false;
  }
  const fromEmail = 'noreply@stockfixapp.online';

  const payload = {
    from: { email: fromEmail, name: 'StockFix Notifications' },
    to: params.recipients.map(email => ({ email })),
    cc: params.ccRecipients.length > 0 ? params.ccRecipients.map(email => ({ email })) : undefined,
    subject: params.subject,
    text: params.body,
  };

  console.log('[Email] Sending to recipients:', params.recipients, 'CC:', params.ccRecipients);
  console.log('[Email] Subject:', params.subject);
  console.log('[Email] >>> Calling MailerSend API via fetch');

  const response = await fetch('https://api.mailersend.com/v1/email', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  console.log('[Email] MailerSend response status:', response.status);
  console.log('[Email] MailerSend response body:', responseText);

  if (response.ok) {
    console.log('[Email] Successfully sent to all recipients');
    return true;
  } else {
    console.error('[Email] MailerSend API error:', response.status, responseText);
    return false;
  }
}

export async function sendTaskCompletedEmail(task: TaskEmailData): Promise<void> {
  console.log('[Email] sendTaskCompletedEmail called');

  if (!getSanitizedApiKey()) {
    console.error('[Email] No MailerSend API key found');
    return;
  }

  const subject = `StockFix | ${safeString(task.client)} | ${safeString(task.storeName)} | ${safeString(task.actionColumn)}`;

  const body = `
StockFix Task Completion Notification
======================================

Store Details
-------------
Store: ${safeString(task.storeName)}
Banner: ${safeString(task.banner)}
Region: ${safeString(task.region)}
Week Ending: ${safeString(task.weekEndingDate)}
Client: ${safeString(task.client)}

Rep & Manager
-------------
Rep: ${safeString(task.repName)}

Product Details
---------------
Barcode: ${safeString(task.barcode)}
Article: ${safeString(task.articleDescription)}
Category: ${safeString(task.category)}
Stock Classification: ${safeString(task.stockClassificationThisWeek)}
Action Required: ${safeString(task.actionColumn)}
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
    const { recipients, ccRecipients } = await resolveEmailRecipients({ repName: task.repName, client: task.client, region: task.region });
    await sendViaMailerSend({ subject, body, recipients, ccRecipients });
  } catch (error: any) {
    console.error('[Email] Failed to send email:', error.message || error);
  }
}

interface VisitSummaryEmailData {
  repName?: string | null;
  client?: string | null;
  storeName?: string | null;
  banner?: string | null;
  region?: string | null;
  completedCount: number;
  openCount: number;
  photosCount: number;
  captures: Array<{
    barcode: string;
    articleDescription: string;
    reasonCode?: string | null;
    actionTakenComment?: string | null;
    feedback?: string | null;
    image1?: string | null;
    image2?: string | null;
    image3?: string | null;
    image4?: string | null;
  }>;
  baseUrl?: string;
}

// Consolidated per-store-visit digest email (Carin, 2026-08-19: "can we
// consolidate all captures for one store in one email") - replaces the old
// per-task "critical SKU" email pattern for the new nexus_tasks flow,
// which risked flooding inboxes given the new flow's real classification
// volumes (OOS/Risk are routine, everyday work, not rare exceptions like
// the old system's narrow priority patterns). Fires once per End Visit tap,
// listing everything captured at that store, using the same recipient
// resolution as the existing per-task email.
export async function sendVisitSummaryEmail(data: VisitSummaryEmailData): Promise<boolean> {
  console.log('[Email] sendVisitSummaryEmail called');

  const subject = `StockFix Visit Summary | ${safeString(data.client)} | ${safeString(data.storeName)} | ${data.completedCount} captured`;

  const captureLines = data.captures.length > 0
    ? data.captures.map((c, i) => {
        const imageLinks = [c.image1, c.image2, c.image3, c.image4]
          .filter((image): image is string => Boolean(image))
          .map((image, imageIndex) => `   Image ${imageIndex + 1}: ${formatImageUrl(image, data.baseUrl)}`)
          .join('\n');
        return `
${i + 1}. ${safeString(c.articleDescription)} (${safeString(c.barcode)})
   Reason: ${safeString(c.reasonCode)}
   Action: ${safeString(c.actionTakenComment)}
   Feedback: ${safeString(c.feedback)}
${imageLinks || '   Images: None'}`;
      }).join('\n')
    : 'No captures recorded.';

  const body = `
StockFix Visit Summary
=======================

Store Details
-------------
Store: ${safeString(data.storeName)}
Banner: ${safeString(data.banner)}
Region: ${safeString(data.region)}
Client: ${safeString(data.client)}
Rep: ${safeString(data.repName)}

Visit Totals
------------
Captured this visit: ${data.completedCount}
Still open at this store: ${data.openCount}
Photos captured: ${data.photosCount}

Captures
--------${captureLines}
`.trim();

  try {
    const { recipients, ccRecipients } = await resolveEmailRecipients({ repName: data.repName, client: data.client, region: data.region });
    return await sendViaMailerSend({ subject, body, recipients, ccRecipients });
  } catch (error: any) {
    console.error('[Email] Failed to send visit summary email:', error.message || error);
    return false;
  }
}
