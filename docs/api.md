# HTTP API

All application endpoints use `/api/v1`. Amounts and rates are decimal strings, dates are `YYYY-MM-DD` in Asia/Dhaka, and audit timestamps are UTC instants. New timestamps use the fixed-width form `2006-01-02T15:04:05.000000000Z`; older rows may have fewer fraction digits. Authentication uses the `sf_session` HTTP-only cookie. Send `Content-Type: application/json` and `X-CSRF-Protection: 1` on every write, including login. Browser requests must use the configured `APP_ORIGIN`; no cross-origin client access is enabled.

Every financial or settings mutation requires an `Idempotency-Key` header of 1–128 characters. Reuse the key only when retrying the exact same request. Keys and their stored responses are kept for 30 days; a retry within that window replays the first response, and after it the key counts as new, so do not retry a write older than 30 days. Corrections and metadata edits include the previously read `version`. A wallet has two versions: `version` changes only with its metadata (name, details, credit limit, archive status), so recording activity never makes a rename stale; `balance_version` changes with every balance effect and guards adjustments. A wallet edit's key covers only its editable fields, `id`, and `version`, so a retry that echoes refreshed read-only fields such as `balance` still replays. List endpoints for transactions and audit accept `limit` (1–200) and `offset`.

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
| GET | `/summary` | Home screen figures in one read; see below. |
| GET, POST | `/wallets` | List wallets or create one with an opening balance. |
| GET | `/wallets/{id}` | Read one wallet. |
| PUT | `/wallets/{id}` | Update name, details, credit limit, or archive status with the wallet's `version`. Type and currency are immutable. |
| POST | `/wallets/{id}/adjust` | Set a target `balance` with `balance_version` and `reason`. For credit cards, the target means debt owed. |
| GET, POST | `/transactions` | List records or create income, expense, or transfer. |
| GET | `/transactions/{id}` | Read one record's current revision, with `voided`, `actor_email`, and `created_at`. |
| PUT | `/transactions/{id}` | Correct a record with its current `version` and an optional `reason`. |
| POST | `/transactions/{id}/void` | Reverse a record with `version` and `reason`. |
| GET | `/transactions/{id}/history` | Read all preserved revisions and author emails. |
| GET, PUT | `/settings` | Read defaults or set `rate` with `version`. |
| GET, POST | `/categories` | List categories or create one with `name` and `type` (`income` or `expense`). Writes require an idempotency key. |
| GET | `/monthly?month=YYYY-MM` | Read spending, category shares, and target. Omit the month for the current Asia/Dhaka month. A month without its own target shows the latest earlier saved target; reading never writes. |
| PUT | `/monthly/{month}/target` | Set one BDT `amount` with the current target `version` and an idempotency key. Zero is allowed. |
| GET, POST | `/schedules` | List or create recurring bills. A new schedule may start at most 366 days before today (Asia/Dhaka), which bounds its catch-up of past bills. |
| GET | `/schedules/{id}` | Read one recurring bill. |
| PUT | `/schedules/{id}` | Change future bill details or active status, with `version`. Start date and frequency are immutable. |
| GET | `/bills/due` | Materialize and list unpaid occurrences through today. |
| GET | `/bills?status=due\|paid\|skipped` | List stored occurrences by status (default `due`) with `limit` and `offset`. `due` materializes like `/bills/due` and lists oldest first; `paid` and `skipped` are plain reads, newest first, and paid bills carry `transaction_id`. |
| GET | `/bills/upcoming?days=N` | Occurrences of active schedules dated after today through today plus `N` days (1–366, default 30), earliest first, at most 200. Computed on each read and never stored, so they have no `id`. |
| POST | `/bills/{id}/confirm` | Record payment with optional `date` (defaults to the due date), `amount`, `wallet_id`, `rate`, and `note`. |
| POST | `/bills/{id}/skip` | Skip an unpaid occurrence with a `reason`. |
| GET | `/audit` | Read wallet, schedule, bill-status, and settings changes. |

## Financial behavior

Income and expense inputs accept `category_id`; on create, omission or an empty value selects the matching Others category. On a correction, an omitted or empty `category_id` keeps the record's prior category, as an omitted rate does; send the Others ID (`others-expense` or `others-income`) to move a record to Others. A category of the wrong type is rejected, as is a category on a transfer. Transaction revisions preserve category corrections. Old records without a stored category resolve to Others without rewriting stored history. Schedule inputs also accept an expense `category_id`; occurrences snapshot it and confirmed expenses inherit it. Category names are returned unchanged, with no display formatter required.

Monthly responses contain `month`, decimal-string `spent`, `target` (`amount`, `version`, and `inherited_from` when the amount comes from an earlier month), and expense `categories` (`category_id`, `name`, `spent`, `percentage`). An empty target amount means unset. Percentages use total actual monthly spending, not the target; zero-spending months return zero shares. All expense categories are included, even when unused. Totals cover every matching latest non-voided expense, regardless of transaction pagination. A month without its own saved target shows the latest earlier month's saved target, computed on each read (ADR 0010), so a later edit to that earlier month flows into it until the month gets its own target. Such a month reports `version` 1; send that version to save its first target.

The Go request/response structs in `internal/finance` are the field contract. Create an expense with `kind`, `wallet_id`, `amount`, `date`, and optional `note` and `rate`. Transfers also take `to_wallet_id` and an optional `received_amount`. Same-currency transfer amounts must match. Cross-currency transfers preserve the actual sent and received amounts; their selected rate is a recorded reference, not a promise that a provider paid exactly that amount. Record transfer fees as separate expenses.

An archived wallet keeps its balance. New records, new schedules, and adjustments cannot use it. A correction may keep a record on an archived wallet only when that wallet's balance stays the same, for example a note, date, category, or USD rate fix; changing its amount there, or moving a record onto an archived wallet, returns `archived_wallet`. Moving a record off an archived wallet onto an active one, and voiding, stay available as the explicit ways to repair a mistaken record on an archived wallet. A schedule on an archived wallet can still be edited or deactivated while its wallet is unchanged, but it cannot be moved onto, or reactivated on, an archived wallet.

The system rate is initially unset rather than populated with an invented market rate. A rate is required only when a value is converted: a USD income or expense (for its `bdt_amount`) and a cross-currency transfer without `received_amount`. A USD-to-USD transfer, or a cross-currency transfer that gives both amounts, needs no rate; when none is given it snapshots the default rate if one is set. Without any rate, such a transfer's `bdt_amount` is the received amount when BDT is received and empty for USD to USD. An omitted rate on a correction retains the prior transaction's rate. Opening balances and adjustments are reconciliation records, not converted income or expenses; correct them with a new adjustment rather than rewriting or voiding them. Correcting or voiding one returns 400 `not_correctable` at any version. Correcting or voiding an already voided record returns 409 `already_settled`.

A debit card is created with `bank_wallet_id`, the active bank wallet it draws from, and takes that wallet's currency. It has no balance of its own: an opening balance or adjustment is rejected, its `balance` is 0.00, and records made with it keep the card as `wallet_id` while moving the bank wallet's balance. A transfer between a card and its own bank is rejected on `to_wallet_id`. The link cannot change. A debit card without `bank_wallet_id` predates this rule (ADR 0011): it keeps its recorded balance and history, but new income, expenses, incoming transfers, and schedules on it are rejected; corrections and voids of its records, transfers out of it, and an adjustment to zero stay available so it can be drained and replaced by a linked card.

Credit wallets return `debt` and `available_credit`; their cash `balance` is zero so clients cannot accidentally count borrowed credit as owned money. A negative debt means a card is overpaid. Cash wallets may go negative because manual records can be incomplete or entered out of order. The backend bounds individual amounts and final wallet balances to 9,000,000,000,000 minor units.

`GET /summary` returns `today` (Asia/Dhaka), `totals` (one entry each for BDT and USD with `cash`, `card_debt`, and `available_credit`), `month` (`month`, `spent`, and `target` for the current month, as in `/monthly`), `bills` (`due_count`, `oldest_due_date`, `next_due_date`), `recent` (the five most recent records, ordered like `/transactions`), and `legacy_debit_cards`. Cash is the balance of every non-credit wallet, archived ones included because an archived wallet keeps its balance; linked debit cards have no balance, and a legacy unlinked debit card's own balance is counted until drained. Card debt and available credit sum the credit cards; a negative debt is an overpayment. `due_count` counts unpaid occurrences through today, including ones not yet stored, and `oldest_due_date` is the earliest of them; `next_due_date` is the first occurrence after today within 90 days. The summary reads only; it never stores occurrences or targets.

Omitted and empty recurring-payment amounts both use the occurrence's expected amount. If the payment wallet uses a different currency from the scheduled wallet, an explicit actual amount is required instead. Explicit zero, negative, or malformed amounts are rejected. Editing a schedule snapshots already-due occurrences before applying future changes. Deactivation stops new occurrence generation; reactivation catches up unpaid dates. Voiding a payment reopens its occurrence. Changes to confirmed transaction amounts retain the linked occurrence and its original expected amount.

ENV changes take effect on restart. Startup removes sessions for removed or changed credentials so later restoring a user cannot resurrect a revoked session. Sessions expire after seven days. Database profile rows remain for historical attribution.

HTTPS origins require secure cookies (`ALLOW_INSECURE_COOKIES=false`); insecure cookies are only accepted for HTTP development origins. The unauthenticated `/healthz` endpoint performs a bounded SQLite read and returns 200 with `status: ok` or 503 with `status: unavailable`. It does not prove disk write capacity or backup availability.
