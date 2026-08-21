# PerfectStorePro secure capture handoff

## Embed capture token

PerfectStorePro must generate a short-lived HMAC-SHA256 token with the shared
`STOCKFIX_CAPTURE_TOKEN_SECRET`, then pass it to StockFix as the
`captureToken` query parameter when opening the StockFix iframe. StockFix
sends it back only in the `X-StockFix-Capture-Token` request header. The
StockFix iframe also sends `X-StockFix-Embedded: perfectstorepro`; when that
header is present, StockFix rejects the capture unless the signed token is
valid.

The token is:

```text
base64url(JSON payload).base64url(HMAC_SHA256(base64url(JSON payload), secret))
```

The JSON payload must contain:

```json
{
  "iss": "perfectstorepro",
  "aud": "stockfix",
  "repName": "Authenticated rep name",
  "store": "Scoped store name",
  "client": "Scoped client name",
  "nonce": "unique random value",
  "iat": 1769999400,
  "exp": 1770000000
}
```

`iat` and `exp` are Unix timestamps in seconds. StockFix accepts a token for a
maximum of ten minutes, so `exp` must be after `iat` and no more than 600
seconds later. Tokens issued more than one minute in the future are rejected.
StockFix accepts the token only for its exact store and client scope. Never
place the shared secret in browser code.

## Capture completion callback

After StockFix has successfully saved a capture, it sends the parent:

```js
{ type: "stockfix-task-captured", uniqueId }
```

The target origin is `https://perfectstorepro.replit.app`. The callback has no
rep identity; PerfectStorePro must derive it from its authenticated server
session.

## Task attribution API

PerfectStorePro's server calls:

```text
PATCH /api/tasks/:uniqueId/attribution
X-API-Key: <STOCKFIX_API_KEY>
Content-Type: application/json
```

with:

```json
{ "repName": "Authenticated rep name" }
```

`STOCKFIX_API_KEY` is a distinct server-to-server secret. The endpoint returns
`404` for a missing task, `409` when another rep owns the task, and succeeds
idempotently when the task is already assigned to the same rep.