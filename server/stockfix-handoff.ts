import crypto from "crypto";

export interface PerfectStoreCaptureToken {
  iss: "perfectstorepro";
  aud: "stockfix";
  repName: string;
  store: string;
  client: string;
  nonce: string;
  iat: number;
  exp: number;
}

const MAX_CAPTURE_TOKEN_TTL_SECONDS = 10 * 60;
const CLOCK_SKEW_SECONDS = 60;

function getTokenSecret(): string | null {
  return process.env.STOCKFIX_CAPTURE_TOKEN_SECRET || null;
}

function safeEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function verifyPerfectStoreCaptureToken(token: string | undefined): PerfectStoreCaptureToken | null {
  const secret = getTokenSecret();
  if (!secret || !token) return null;

  const [body, signature, ...extra] = token.split(".");
  if (!body || !signature || extra.length > 0) return null;

  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  if (!safeEqual(signature, expected)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<PerfectStoreCaptureToken>;
    if (
      parsed.iss !== "perfectstorepro"
      || parsed.aud !== "stockfix"
      || !isNonEmptyString(parsed.repName)
      || !isNonEmptyString(parsed.store)
      || !isNonEmptyString(parsed.client)
      || !isNonEmptyString(parsed.nonce)
      || typeof parsed.iat !== "number"
      || !Number.isFinite(parsed.iat)
      || typeof parsed.exp !== "number"
      || !Number.isFinite(parsed.exp)
      || parsed.iat > Math.floor(Date.now() / 1000) + CLOCK_SKEW_SECONDS
      || parsed.exp <= Math.floor(Date.now() / 1000)
      || parsed.exp <= parsed.iat
      || parsed.exp - parsed.iat > MAX_CAPTURE_TOKEN_TTL_SECONDS
    ) {
      return null;
    }

    return parsed as PerfectStoreCaptureToken;
  } catch {
    return null;
  }
}

export function readCaptureTokenHeader(headers: Record<string, string | string[] | undefined>): string | undefined {
  const value = headers["x-stockfix-capture-token"];
  return typeof value === "string" ? value : undefined;
}

export function verifyStockFixApiKey(value: string | string[] | undefined): boolean {
  const expected = process.env.STOCKFIX_API_KEY;
  if (typeof value !== "string" || typeof expected !== "string" || !expected) {
    return false;
  }
  return safeEqual(value, expected);
}

export function hasStockFixApiKeyConfiguration(): boolean {
  return Boolean(process.env.STOCKFIX_API_KEY);
}

export function sameScopedValue(left: string | null | undefined, right: string | null | undefined): boolean {
  return (left || "").trim().toUpperCase() === (right || "").trim().toUpperCase();
}

export function isUnassigned(repName: string | null | undefined): boolean {
  const normalized = (repName || "").trim().toUpperCase();
  return normalized === "" || normalized === "UNASSIGNED";
}