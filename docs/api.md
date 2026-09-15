# HTTP API

All application endpoints use `/api/v1`. Amounts and rates are decimal strings, dates are `YYYY-MM-DD` in Asia/Dhaka, and audit timestamps are UTC instants. Authentication uses the `sf_session` HTTP-only cookie. Send `Content-Type: application/json` and `X-CSRF-Protection: 1` on every write, including login. Browser requests must use the configured `APP_ORIGIN`; no cross-origin client access is enabled.

Every financial or settings mutation requires an `Idempotency-Key` header of 1–128 characters. Reuse the key only when retrying the exact same request. Corrections and metadata edits include the previously read `version`. The server returns 400 for invalid input, 401 for missing/expired access, 404 for missing records, and 409 for stale versions or conflicting request-key reuse. List endpoints for transactions and audit accept `limit` (1–200) and `offset`.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/login` | Email and password login. |
| POST | `/logout` | Revoke this session. |
| GET | `/me` | Current user profile. |
| GET, POST | `/wallets` | List wallets or create one with an opening balance. |
| PUT | `/wallets/{id}` | Update name, details, credit limit, or archive status. Type and currency are immutable. |
| POST | `/wallets/{id}/adjust` | Set a target `balance` with `version` and `reason`. For credit cards, the target means debt owed. |
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

Income and expense inputs accept `category_id`; omission or an empty value selects the matching Others category. A category of the wrong type is rejected, as is a category on a transfer. Transaction revisions preserve category corrections. Old records without a stored category resolve to Others without rewriting stored history. Schedule inputs also accept an expense `category_id`; occurrences snapshot it and confirmed expenses inherit it. Category names are returned unchanged, with no display formatter required.

Monthly responses contain `month`, decimal-string `spent`, `target` (`amount`, `version`), and expense `categories` (`category_id`, `name`, `spent`, `percentage`). An empty target amount means unset. Percentages use total actual monthly spending, not the target; zero-spending months return zero shares. All expense categories are included, even when unused. Totals cover every matching latest non-voided expense, regardless of transaction pagination. Target initialization is persisted on first read, so reading the same month after a previous-month edit does not change that month's target.

The Go request/response structs in `internal/finance` are the field contract. Create an expense with `kind`, `wallet_id`, `amount`, `date`, and optional `note` and `rate`. Transfers also take `to_wallet_id` and an optional `received_amount`. Same-currency transfer amounts must match. Cross-currency transfers preserve the actual sent and received amounts; their selected rate is a recorded reference, not a promise that a provider paid exactly that amount. Record transfer fees as separate expenses.

The system rate is initially unset rather than populated with an invented market rate. USD transactions need an explicit rate or a configured default. An omitted rate on a correction retains the prior transaction's rate. Opening balances and adjustments are reconciliation records, not converted income or expenses; correct them with a new adjustment rather than rewriting or voiding them.

Credit wallets return `debt` and `available_credit`; their cash `balance` is zero so clients cannot accidentally count borrowed credit as owned money. A negative debt means a card is overpaid. Cash wallets may go negative because manual records can be incomplete or entered out of order. The backend bounds individual amounts and final wallet balances to 9,000,000,000,000 minor units.

Omitted and empty recurring-payment amounts both use the occurrence's expected amount. If the payment wallet uses a different currency from the scheduled wallet, an explicit actual amount is required instead. Explicit zero, negative, or malformed amounts are rejected. Editing a schedule snapshots already-due occurrences before applying future changes. Deactivation stops new occurrence generation; reactivation catches up unpaid dates. Voiding a payment reopens its occurrence. Changes to confirmed transaction amounts retain the linked occurrence and its original expected amount.

ENV changes take effect on restart. Startup removes sessions for removed or changed credentials so later restoring a user cannot resurrect a revoked session. Sessions expire after seven days. Database profile rows remain for historical attribution.

HTTPS origins require secure cookies (`ALLOW_INSECURE_COOKIES=false`); insecure cookies are only accepted for HTTP development origins. The unauthenticated `/healthz` endpoint performs a bounded SQLite read and returns 200 with `status: ok` or 503 with `status: unavailable`. It does not prove disk write capacity or backup availability.
