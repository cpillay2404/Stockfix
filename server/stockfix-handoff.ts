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

export type PerfectStoreCaptureTokenFailure =
  | "missing-secret"
  | "missing-token-header"
  | "malformed-token"
  | "invalid-signature"
  | "malformed-payload"
  | "invalid-claims"
  | "issued-in-future"
  | "expired-token"
  | "invalid-token-lifetime";

export type PerfectStoreCaptureTokenVerification =
  | { token: PerfectStoreCaptureToken; failure: null }
  | { token: null; failure: PerfectStoreCaptureTokenFailure };

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

export function inspectPerfectStoreCaptureToken(
  token: string | undefined,
): PerfectStoreCaptureTokenVerification {
  const secret = getTokenSecret();
  if (!secret) return { token: null, failure: "missing-secret" };
  if (!token) return { token: null, failure: "missing-token-header" };

  const [body, signature, ...extra] = token.split(".");
  if (!body || !signature || extra.length > 0) {
    return { token: null, failure: "malformed-token" };
  }

  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  if (!safeEqual(signature, expected)) {
    return { token: null, failure: "invalid-signature" };
  }

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
    ) {
      return { token: null, failure: "invalid-claims" };
    }

    const now = Math.floor(Date.now() / 1000);
    if (parsed.iat > now + CLOCK_SKEW_SECONDS) {
      return { token: null, failure: "issued-in-future" };
    }
    if (parsed.exp <= now) {
      return { token: null, failure: "expired-token" };
    }
    if (parsed.exp <= parsed.iat || parsed.exp - parsed.iat > MAX_CAPTURE_TOKEN_TTL_SECONDS) {
      return { token: null, failure: "invalid-token-lifetime" };
    }

    return { token: parsed as PerfectStoreCaptureToken, failure: null };
  } catch {
    return { token: null, failure: "malformed-payload" };
  }
}

export function verifyPerfectStoreCaptureToken(token: string | undefined): PerfectStoreCaptureToken | null {
  return inspectPerfectStoreCaptureToken(token).token;
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