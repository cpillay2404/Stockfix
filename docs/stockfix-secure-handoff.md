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

## Embedded store bootstrap

When the StockFix iframe opens Store Detail, it sends the same
`X-StockFix-Embedded: perfectstorepro` and `X-StockFix-Capture-Token` headers
to `/api/roster/clients-for-store`, `/api/roster/store-overview`, and
`/api/roster/sku-list` / `/api/roster/sku-history` endpoints. For these
embedded requests, StockFix derives the
rep name, store, and client exclusively from the verified token. The parent
must not supply a `rep` query parameter; any such query value is ignored.

The requested store must match the token store. A requested client must either
match the token client or be `ALL`, which still resolves to the token client
for an embedded session. Mismatches are rejected with `403`.

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