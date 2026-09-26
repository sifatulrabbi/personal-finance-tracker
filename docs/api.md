# HTTP API

All application endpoints use `/api/v1`. Amounts and rates are decimal strings, dates are `YYYY-MM-DD` in Asia/Dhaka, and audit timestamps are UTC instants. Authentication uses the `sf_session` HTTP-only cookie. Send `Content-Type: application/json` and `X-CSRF-Protection: 1` on every write, including login. Browser requests must use the configured `APP_ORIGIN`; no cross-origin client access is enabled.

Every financial or settings mutation requires an `Idempotency-Key` header of 1–128 characters. Reuse the key only when retrying the exact same request. Corrections and metadata edits include the previously read `version`. A wallet has two versions: `version` changes only with its metadata (name, details, credit limit, archive status), so recording activity never makes a rename stale; `balance_version` changes with every balance effect and guards adjustments. A wallet edit's key covers only its editable fields, `id`, and `version`, so a retry that echoes refreshed read-only fields such as `balance` still replays. List endpoints for transactions and audit accept `limit` (1–200) and `offset`.

## Errors

Every error response is JSON: `{"error":{"code":"<code>","message":"<human text>","field":"<input name>"}}`. `field` is present only when one input field is at fault; it uses the JSON field name (for example `amount`, `rate`, `wallet_id`, `limit`). Messages are fixed, human-readable text that never echoes submitted values; clients should branch on `code` and may show `message`. See ADR 0008.

| Code | Status | Meaning and client action |
| --- | --- | --- |
| `validation_failed` | 400 | The request or one field is invalid. Fix the input. |
| `rate_required` | 400 | A USD amount needs a rate and no default is set. Enter a rate or set one in Settings. |
| `archived_wallet` | 400 | The change would use an archived wallet or change its balance. |
| `not_correctable` | 400 | Opening balances and adjustments cannot be corrected or voided. Record a new adjustment. |
| `unauthenticated` | 401 | No valid session, or the login email or password is wrong. Sign in. |
| `forbidden` | 403 | CSRF header or origin check failed. |
| `not_found` | 404 | The record, a referenced wallet (with `field`), or the API route does not exist. |
| `method_not_allowed` | 405 | The route exists but not for this method; see the `Allow` header. |
| `stale_version` | 409 | The record changed since it was read. Reload and retry with the new `version`. |
| `idempotency_key_reused` | 409 | This `Idempotency-Key` was used for a different request. Send a new key. |
| `duplicate_name` | 409 | A category with this name and type exists. |
| `already_settled` | 409 | The bill was already paid or skipped, or the record was already voided. |
| `unsupported_media_type` | 415 | Send `Content-Type: application/json`. |
| `rate_limited` | 429 | Too many failed logins from this client or for this account; wait for `Retry-After` seconds (ADR 0009). |
| `internal` | 500 | Unexpected server fault. Retry later with the same `Idempotency-Key`, which cannot apply a write twice. |

Unauthenticated requests to any `/api/v1` path, including unknown ones, get 401 before routing.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/login` | Email and password login. |
| POST | `/logout` | Revoke this session. |
| GET | `/me` | Current user profile. |
| GET, POST | `/wallets` | List wallets or create one with an opening balance. |
| GET | `/wallets/{id}` | Read one wallet. |
| PUT | `/wallets/{id}` | Update name, details, credit limit, or archive status with the wallet's `version`. Type and currency are immutable. |
| POST | `/wallets/{id}/adjust` | Set a target `balance` with `balance_version` and `reason`. For credit cards, the target means debt owed. |
| GET, POST | `/transactions` | List records or create income, expense, or transfer. |
| PUT | `/transactions/{id}` | Correct a record with its current `version` and an optional `reason`. |
| POST | `/transactions/{id}/void` | Reverse a record with `version` and `reason`. |
| GET | `/transactions/{id}/history` | Read all preserved revisions and author emails. |
| GET, PUT | `/settings` | Read defaults or set `rate` with `version`. |
| GET, POST | `/categories` | List categories or create one with `name` and `type` (`income` or `expense`). Writes require an idempotency key. |
| GET | `/monthly?month=YYYY-MM` | Read spending, category shares, and target. Omit the month for the current Asia/Dhaka month. Initializes a missing target by copying the immediately preceding month's saved target. |
| PUT | `/monthly/{month}/target` | Set one BDT `amount` with the current target `version` and an idempotency key. Zero is allowed. |
| GET, POST | `/schedules` | List or create recurring bills. |
| PUT | `/schedules/{id}` | Change future bill details or active status, with `version`. Start date and frequency are immutable. |
| GET | `/bills/due` | Materialize and list unpaid occurrences through today. |
| POST | `/bills/{id}/confirm` | Record payment with `date`, optional `amount`, `wallet_id`, `rate`, and `note`. |
| POST | `/bills/{id}/skip` | Skip an unpaid occurrence with a `reason`. |
| GET | `/audit` | Read wallet, schedule, bill-status, and settings changes. |

## Financial behavior

Income and expense inputs accept `category_id`; on create, omission or an empty value selects the matching Others category. On a correction, an omitted or empty `category_id` keeps the record's prior category, as an omitted rate does; send the Others ID (`others-expense` or `others-income`) to move a record to Others. A category of the wrong type is rejected, as is a category on a transfer. Transaction revisions preserve category corrections. Old records without a stored category resolve to Others without rewriting stored history. Schedule inputs also accept an expense `category_id`; occurrences snapshot it and confirmed expenses inherit it. Category names are returned unchanged, with no display formatter required.

Monthly responses contain `month`, decimal-string `spent`, `target` (`amount`, `version`), and expense `categories` (`category_id`, `name`, `spent`, `percentage`). An empty target amount means unset. Percentages use total actual monthly spending, not the target; zero-spending months return zero shares. All expense categories are included, even when unused. Totals cover every matching latest non-voided expense, regardless of transaction pagination. Target initialization is persisted on first read, so reading the same month after a previous-month edit does not change that month's target.

The Go request/response structs in `internal/finance` are the field contract. Create an expense with `kind`, `wallet_id`, `amount`, `date`, and optional `note` and `rate`. Transfers also take `to_wallet_id` and an optional `received_amount`. Same-currency transfer amounts must match. Cross-currency transfers preserve the actual sent and received amounts; their selected rate is a recorded reference, not a promise that a provider paid exactly that amount. Record transfer fees as separate expenses.

An archived wallet keeps its balance. New records, new schedules, and adjustments cannot use it. A correction may keep a record on an archived wallet only when that wallet's balance stays the same, for example a note, date, category, or USD rate fix; changing its amount there, or moving a record onto an archived wallet, returns `archived_wallet`. Moving a record off an archived wallet onto an active one, and voiding, stay available as the explicit ways to repair a mistaken record on an archived wallet. A schedule on an archived wallet can still be edited or deactivated while its wallet is unchanged, but it cannot be moved onto, or reactivated on, an archived wallet.

The system rate is initially unset rather than populated with an invented market rate. USD transactions need an explicit rate or a configured default. An omitted rate on a correction retains the prior transaction's rate. Opening balances and adjustments are reconciliation records, not converted income or expenses; correct them with a new adjustment rather than rewriting or voiding them. Correcting or voiding one returns 400 `not_correctable` at any version. Correcting or voiding an already voided record returns 409 `already_settled`.

Credit wallets return `debt` and `available_credit`; their cash `balance` is zero so clients cannot accidentally count borrowed credit as owned money. A negative debt means a card is overpaid. Cash wallets may go negative because manual records can be incomplete or entered out of order. The backend bounds individual amounts and final wallet balances to 9,000,000,000,000 minor units.

Omitted and empty recurring-payment amounts both use the occurrence's expected amount. If the payment wallet uses a different currency from the scheduled wallet, an explicit actual amount is required instead. Explicit zero, negative, or malformed amounts are rejected. Editing a schedule snapshots already-due occurrences before applying future changes. Deactivation stops new occurrence generation; reactivation catches up unpaid dates. Voiding a payment reopens its occurrence. Changes to confirmed transaction amounts retain the linked occurrence and its original expected amount.

ENV changes take effect on restart. Startup removes sessions for removed or changed credentials so later restoring a user cannot resurrect a revoked session. Sessions expire after seven days. Database profile rows remain for historical attribution.

HTTPS origins require secure cookies (`ALLOW_INSECURE_COOKIES=false`); insecure cookies are only accepted for HTTP development origins. The unauthenticated `/healthz` endpoint performs a bounded SQLite read and returns 200 with `status: ok` or 503 with `status: unavailable`. It does not prove disk write capacity or backup availability.
