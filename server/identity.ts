import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { db } from "./db";
import { resourceRoster, insertResourceRosterSchema, storeAssignments, insertStoreAssignmentSchema } from "@shared/schema";
import { sql } from "drizzle-orm";

// ─── Identity layer ─────────────────────────────────────────────────────────
// Lightweight "no secret to remember" identity check: a field rep proves who
// they are with Name + Employee ID (values that already exist for every real
// person - printed on payslips/contracts, not a chosen password). We verify
// that combination against `resourceRoster` (imported from this week's Call
// Cycle Master) and, on success, issue a short-lived signed token. There is
// no password to reset and no lockout state - if the combination doesn't
// match, the fix is "get added to this week's roster", not a support ticket.

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours - a work shift
const SECRET = process.env.IDENTITY_TOKEN_SECRET || "stockfix-dev-identity-secret-change-me";

export interface IdentityPayload {
  resourceEmpId: string;
  resourceName: string;
  resourceType: string | null;
  clientScope: string;
  exp: number;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(payload: IdentityPayload): string {
  const body = base64url(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyToken(token: string): IdentityPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expectedSig = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  // constant-time compare
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as IdentityPayload;
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

const COOKIE_NAME = "sf_identity";

function getToken(req: Request): string | null {
  const header = req.headers["authorization"];
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    return header.slice("Bearer ".length);
  }
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader.split(";").map(c => c.trim()).find(c => c.startsWith(`${COOKIE_NAME}=`));
    if (match) return decodeURIComponent(match.slice(COOKIE_NAME.length + 1));
  }
  return null;
}

declare global {
  namespace Express {
    interface Request {
      identity?: IdentityPayload;
    }
  }
}

/**
 * Reads and verifies the identity token if present. Does NOT block the
 * request when there is no valid token - the existing Rep/Manager/Client
 * "login" UI still works exactly as before while the new identify flow is
 * wired into the frontend. This just makes req.identity available when a
 * verified token IS present, so scopeToClient (and future routes) can use it.
 */
export function requireIdentity(req: Request, _res: Response, next: NextFunction) {
  const token = getToken(req);
  if (token) {
    const payload = verifyToken(token);
    if (payload) req.identity = payload;
  }
  next();
}

/**
 * For identified users whose clientScope is a specific dedicated client
 * (anything other than "SYNDICATED"), forces the `client` query param to
 * their own scope server-side, overriding whatever the request claims. This
 * is the actual server-side fix for "anyone can request any client's data by
 * changing the client= param". Syndicated users (and unauthenticated
 * requests, for now, to preserve existing behavior) are not restricted.
 */
export function scopeToClient(req: Request, _res: Response, next: NextFunction) {
  const identity = req.identity;
  if (identity && identity.clientScope && identity.clientScope !== "SYNDICATED") {
    (req.query as Record<string, unknown>).client = identity.clientScope;
  }
  next();
}

export async function findRosterMatch(resourceEmpId: string, resourceName: string) {
  const empId = resourceEmpId.trim().toUpperCase();
  const name = resourceName.trim().toUpperCase();
  const [row] = await db
    .select()
    .from(resourceRoster)
    .where(sql`upper(trim(${resourceRoster.resourceEmpId})) = ${empId} and upper(trim(${resourceRoster.resourceName})) = ${name}`)
    .limit(1);
  return row;
}

export function issueIdentityToken(row: { resourceEmpId: string; resourceName: string; resourceType: string | null; clientScope: string }): string {
  const payload: IdentityPayload = {
    resourceEmpId: row.resourceEmpId,
    resourceName: row.resourceName,
    resourceType: row.resourceType,
    clientScope: row.clientScope,
    exp: Date.now() + TOKEN_TTL_MS,
  };
  return sign(payload);
}

export const IDENTITY_COOKIE_NAME = COOKIE_NAME;
export const IDENTITY_TOKEN_TTL_MS = TOKEN_TTL_MS;

/**
 * Bulk import for the roster, in the same shape store_coverage.json already
 * produces. Upserts by resourceEmpId so a weekly re-import just refreshes
 * everyone's current store/manager/scope.
 */
const ROSTER_IMPORT_BATCH_SIZE = 500;

// store_coverage.json has one row per (person, store) - many rows per
// person, since a rep/merchandiser covers many stores. resource_roster is
// one row PER PERSON (their type/manager, not tied to a single store), so
// duplicate employee IDs must be collapsed before insert - Postgres also
// rejects an upsert batch that updates the same conflict key twice in one
// statement, so this is a correctness fix, not just a performance one.
// When a person has both a dedicated assignment (e.g. AQUELLE) and
// syndicated ones elsewhere, the dedicated clientScope wins, since that's
// the more specific signal about who they really are.
function dedupeByEmpId<T extends { resourceEmpId: string; clientScope: string }>(rows: T[]): T[] {
  const byId = new Map<string, T>();
  for (const row of rows) {
    const existing = byId.get(row.resourceEmpId);
    if (!existing || (existing.clientScope === "SYNDICATED" && row.clientScope !== "SYNDICATED")) {
      byId.set(row.resourceEmpId, row);
    }
  }
  return Array.from(byId.values());
}

export async function importRosterRows(rows: Array<{
  resourceEmpId: string;
  resourceName: string;
  resourceType?: string;
  cleanedStoreName?: string;
  banner?: string;
  manager?: string;
  clientScope?: string;
}>): Promise<{ imported: number; skipped: number; errors: string[] }> {
  let skipped = 0;
  const errors: string[] = [];
  const parsedRows: Array<typeof insertResourceRosterSchema._type> = [];

  for (const raw of rows) {
    const parsed = insertResourceRosterSchema.safeParse({
      resourceEmpId: String(raw.resourceEmpId ?? "").trim(),
      resourceName: String(raw.resourceName ?? "").trim(),
      resourceType: raw.resourceType ?? null,
      cleanedStoreName: raw.cleanedStoreName ?? null,
      banner: raw.banner ?? null,
      manager: raw.manager ?? null,
      clientScope: raw.clientScope?.trim() || "SYNDICATED",
    });
    if (!parsed.success || !parsed.data.resourceEmpId || !parsed.data.resourceName) {
      skipped++;
      errors.push(`Skipped row (missing resourceEmpId/resourceName): ${JSON.stringify(raw).slice(0, 200)}`);
      continue;
    }
    parsedRows.push(parsed.data);
  }

  const deduped = dedupeByEmpId(parsedRows);
  let imported = 0;

  for (let i = 0; i < deduped.length; i += ROSTER_IMPORT_BATCH_SIZE) {
    const batch = deduped.slice(i, i + ROSTER_IMPORT_BATCH_SIZE);
    await db
      .insert(resourceRoster)
      .values(batch)
      .onConflictDoUpdate({
        target: resourceRoster.resourceEmpId,
        set: {
          resourceName: sql`excluded.resource_name`,
          resourceType: sql`excluded.resource_type`,
          cleanedStoreName: sql`excluded.cleaned_store_name`,
          banner: sql`excluded.banner`,
          manager: sql`excluded.manager`,
          clientScope: sql`excluded.client_scope`,
          updatedAt: new Date(),
        },
      });
    imported += batch.length;
  }

  return { imported, skipped, errors };
}

// Unlike resource_roster (one row per person), this is intentionally one
// row per (person, store) - no dedup, since the whole point is preserving
// each person's full store list.
export async function importStoreAssignments(rows: Array<{
  resourceEmpId: string;
  resourceName: string;
  cleanedStoreName: string;
  banner?: string;
  clientScope?: string;
}>): Promise<{ imported: number; skipped: number }> {
  let skipped = 0;
  const parsedRows: Array<typeof insertStoreAssignmentSchema._type> = [];

  for (const raw of rows) {
    const parsed = insertStoreAssignmentSchema.safeParse({
      resourceEmpId: String(raw.resourceEmpId ?? "").trim(),
      resourceName: String(raw.resourceName ?? "").trim(),
      cleanedStoreName: String(raw.cleanedStoreName ?? "").trim(),
      banner: raw.banner ?? null,
      clientScope: raw.clientScope?.trim() || "SYNDICATED",
    });
    if (!parsed.success || !parsed.data.resourceEmpId || !parsed.data.cleanedStoreName) {
      skipped++;
      continue;
    }
    parsedRows.push(parsed.data);
  }

  await db.delete(storeAssignments);

  let imported = 0;
  for (let i = 0; i < parsedRows.length; i += ROSTER_IMPORT_BATCH_SIZE) {
    const batch = parsedRows.slice(i, i + ROSTER_IMPORT_BATCH_SIZE);
    await db.insert(storeAssignments).values(batch);
    imported += batch.length;
  }

  return { imported, skipped };
}
