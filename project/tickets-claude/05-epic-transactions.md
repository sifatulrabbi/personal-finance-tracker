# EPIC: Transaction Management

**Goal**: Users can record income and expense transactions, tag them with a person, assign income to an origin, and view/filter transaction history.

**Done when**: Users can create expenses (with person + account), create income (with person + account + origin), auto-create origins inline, view all transactions, and filter by person.

---

## T-019 — TASK: Implement expense transaction API

**Parent**: Epic — Transaction Management
**Type**: Task
**Size**: M (1d)
**Priority**: P1 (high)
**Agent-Executable**: Yes
**Blocked By**: T-004, T-011, T-014, T-015
**Blocks**: T-020, T-024

**Context**
Expenses are the most common transaction type. Each expense must be recorded against an account (reducing its balance) and tagged with a person who initiated it.

**Acceptance Criteria**

- [ ] API: `POST /api/transactions` with `type = 'expense'` — accepts: `account_id` (required), `person_id` (required), `amount` (required, > 0), `description` (optional), `date` (required, ISO date string)
- [ ] Creates a transaction record with `type = 'expense'`
- [ ] Decrements the account's `current_balance` by the amount
- [ ] Both insert and balance update happen in a single SQLite transaction
- [ ] Validation: account_id and person_id must exist and belong to the household
- [ ] Validation: amount must be a positive number
- [ ] `origin_id` is null for expenses (origins are income-only)
- [ ] `created_by` set to the authenticated user's ID from session
- [ ] Returns the created transaction with account and person details

**Out of Scope**

- Categories (not in rework scope)
- Receipt attachments
- Split transactions
- Recurring transactions

**Technical Notes**
The `created_by` field tracks which authenticated user created the transaction. The `person_id` field tracks which household member the expense is attributed to — these may differ (e.g., user A records an expense that person B made).

**Agent Instructions**
Create `src/app/api/transactions/route.ts` for POST (will also handle GET in T-024). Validate the type field. For expenses: validate account_id and person_id exist in household, insert transaction, update `accounts SET current_balance = current_balance - ? WHERE id = ?`. Wrap in `db.transaction()`. Return the created record with a JOIN to get account name and person name.

---

## T-020 — TASK: Create expense transaction UI

**Parent**: Epic — Transaction Management
**Type**: Task
**Size**: M (1d)
**Priority**: P1 (high)
**Agent-Executable**: Partial
**Blocked By**: T-002, T-006, T-014, T-019
**Blocks**: T-025

**Context**
Users need a form to quickly record expenses. Since this is the most common action, it should be easily accessible and fast to complete.

**Acceptance Criteria**

- [ ] Transactions page at `/transactions` accessible from navigation
- [ ] "Add Expense" button opens a form with: amount, account (dropdown), person (dropdown), date (date picker, defaults to today), description (optional)
- [ ] Person dropdown includes all persons in the household (including default "Household")
- [ ] Account dropdown shows all accounts with their current balances
- [ ] After submitting, the transaction appears in the list and account balance updates
- [ ] Validation errors displayed inline on the form
- [ ] Mobile-first form layout — stacked fields, large touch targets
- [ ] Uses shadcn: Dialog, Input, Select, Button, Calendar/DatePicker

**Out of Scope**

- Income creation UI (T-022)
- Transaction editing
- Transaction deletion
- Filtering (T-025)

**Agent Instructions**
Create `src/app/(app)/transactions/page.tsx`. Create `src/components/transactions/expense-form.tsx`. Fetch accounts via `/api/accounts` and persons via `/api/persons` for dropdowns. Use shadcn Select for dropdowns. POST to `/api/transactions` with `type: 'expense'`. After success, refetch the transaction list.

---

## T-021 — TASK: Implement income transaction API with origin support

**Parent**: Epic — Transaction Management
**Type**: Task
**Size**: M (1d)
**Priority**: P1 (high)
**Agent-Executable**: Yes
**Blocked By**: T-004, T-011, T-014, T-015, T-023
**Blocks**: T-022, T-024

**Context**
Income transactions increase an account balance and must have an origin (client, employer, etc.). The origin can be selected from existing ones or auto-created by providing a new name.

**Acceptance Criteria**

- [ ] API: `POST /api/transactions` with `type = 'income'` — accepts: `account_id` (required), `person_id` (required), `origin_id` OR `origin_name` (one required), `amount` (required, > 0), `description` (optional), `date` (required)
- [ ] If `origin_name` is provided instead of `origin_id`: auto-create a new origin with that name for the household, then use its ID
- [ ] If `origin_name` matches an existing origin name in the household: reuse the existing origin (don't create a duplicate)
- [ ] Creates a transaction record with `type = 'income'` and the resolved `origin_id`
- [ ] Increments the account's `current_balance` by the amount
- [ ] Both origin creation (if needed), transaction insert, and balance update happen in a single SQLite transaction
- [ ] Validation: account_id and person_id must exist and belong to household
- [ ] `created_by` set to the authenticated user's ID

**Out of Scope**

- Origin editing or deletion (T-023 covers the basic API)
- Origin metadata (address, contact info, etc.)

**Technical Notes**
The auto-create logic: if `origin_name` is provided, first try `SELECT id FROM origins WHERE household_id = ? AND name = ?`. If found, use that ID. If not found, insert a new origin. This is a common "find or create" pattern. Wrap the whole thing in a transaction for atomicity.

**Agent Instructions**
Extend the POST handler in `src/app/api/transactions/route.ts` to handle `type = 'income'`. Add origin resolution logic: if `origin_name` provided, find-or-create the origin. Validate that income transactions have either `origin_id` or `origin_name`. Insert transaction with resolved origin_id. Update `accounts SET current_balance = current_balance + ? WHERE id = ?`. All in a single `db.transaction()`.

---

## T-022 — TASK: Create income transaction UI with origin selection

**Parent**: Epic — Transaction Management
**Type**: Task
**Size**: M (1d)
**Priority**: P1 (high)
**Agent-Executable**: Partial
**Blocked By**: T-002, T-006, T-014, T-021, T-023
**Blocks**: T-025

**Context**
Users need a form to record income. The key differentiator from expenses is the origin field — users can select an existing origin or type a new one to auto-create it.

**Acceptance Criteria**

- [ ] "Add Income" button on the transactions page opens an income form
- [ ] Form fields: amount, account (dropdown), person (dropdown), origin (combobox — searchable, allows new entries), date (date picker, defaults to today), description (optional)
- [ ] Origin field works as a combobox: shows existing origins in a dropdown, but allows typing a new name
- [ ] If the user types a name that doesn't match an existing origin, it sends `origin_name` to the API (auto-creates)
- [ ] If the user selects an existing origin, it sends `origin_id` to the API
- [ ] After submitting, the transaction appears in the list and account balance updates
- [ ] Mobile-friendly layout with clear distinction from the expense form (e.g., different accent or label)

**Out of Scope**

- Origin management page (origins are managed inline during income creation)
- Editing income transactions
- Bulk income entry

**Agent Instructions**
Create `src/components/transactions/income-form.tsx`. Fetch origins via `/api/origins` for the combobox. Use shadcn Combobox (or Popover + Command) for the origin field — it should show existing origins as suggestions and allow free-text input. POST to `/api/transactions` with `type: 'income'` and either `origin_id` or `origin_name`. Reuse the same Dialog pattern as the expense form.

---

## T-023 — TASK: Implement origin management API

**Parent**: Epic — Transaction Management
**Type**: Task
**Size**: S (0.5d)
**Priority**: P1 (high)
**Agent-Executable**: Yes
**Blocked By**: T-004, T-011
**Blocks**: T-021, T-022

**Context**
Origins represent where income comes from (a client, an employer, a side gig, etc.). They need a basic CRUD API. The auto-create-on-income-creation logic lives in the transaction API (T-021), but the standalone API is needed for listing origins in the UI.

**Acceptance Criteria**

- [ ] API: `GET /api/origins` — returns all origins for the current user's household, ordered by name
- [ ] API: `POST /api/origins` — creates a new origin with: name (required), description (optional)
- [ ] API: `DELETE /api/origins/:id` — deletes an origin. Returns 400 if the origin is used by any transaction
- [ ] All endpoints scoped to household_id from session
- [ ] Origin names are unique within a household (enforced by the DB constraint from T-004)
- [ ] Attempting to create a duplicate name returns 409 Conflict

**Out of Scope**

- Origin editing (PATCH) — keep it simple
- Origin metadata beyond name/description
- Origin merge/deduplication

**Agent Instructions**
Create `src/app/api/origins/route.ts` for GET and POST. Create `src/app/api/origins/[id]/route.ts` for DELETE. For POST, handle the unique constraint violation gracefully (catch the SQLite error and return 409). For DELETE, check: `SELECT COUNT(*) FROM transactions WHERE origin_id = ?`. Scope all queries with `household_id`.

---

## T-024 — TASK: Implement transaction list API with person filter

**Parent**: Epic — Transaction Management
**Type**: Task
**Size**: M (1d)
**Priority**: P1 (high)
**Agent-Executable**: Yes
**Blocked By**: T-004, T-019, T-021
**Blocks**: T-025

**Context**
Users need to see their transaction history and filter it by person. This is the read side of the transaction system.

**Acceptance Criteria**

- [ ] API: `GET /api/transactions` — returns all transactions for the household, ordered by date descending
- [ ] Supports query parameter: `?person_id=<uuid>` to filter by person
- [ ] Supports query parameter: `?type=income|expense` to filter by transaction type
- [ ] Supports query parameter: `?account_id=<uuid>` to filter by account
- [ ] Each transaction in the response includes: id, type, amount, description, date, account (name), person (name), origin (name, if income), transfer_id (if part of a transfer), created_at
- [ ] Pagination: `?page=1&limit=50` (default 50 per page). Returns `{ data: [...], total: number, page: number, limit: number }`
- [ ] Transactions that are part of a transfer are identifiable by non-null `transfer_id`

**Out of Scope**

- Full-text search on description
- Date range filtering (future enhancement)
- Sorting by fields other than date
- Transaction editing or deletion API (future enhancement)

**Technical Notes**
Use JOINs to get account name, person name, and origin name in a single query. Build the WHERE clause dynamically based on which filters are provided. Use `COUNT(*)` over the filtered set (without LIMIT) for the total.

**Agent Instructions**
Add GET handler to `src/app/api/transactions/route.ts`. Parse query params from `request.nextUrl.searchParams`. Build a SQL query with optional WHERE clauses for person_id, type, account_id. JOIN accounts, persons, and origins (LEFT JOIN for origins since it's nullable). Add `LIMIT ? OFFSET ?` for pagination. Run a parallel count query for total. Return the paginated response.

---

## T-025 — TASK: Create transaction history UI with person filter

**Parent**: Epic — Transaction Management
**Type**: Task
**Size**: M (1d)
**Priority**: P1 (high)
**Agent-Executable**: Partial
**Blocked By**: T-002, T-006, T-020, T-022, T-024
**Blocks**: —

**Context**
Users need to see their full transaction history with the ability to filter by person — the key feature for household finance tracking ("who spent what").

**Acceptance Criteria**

- [ ] Transaction list displayed on the `/transactions` page below the add buttons
- [ ] Each transaction row shows: date, type (income/expense with visual indicator), amount, description, account name, person name, origin name (for income)
- [ ] Income rows have a green/positive indicator, expense rows have a red/negative indicator
- [ ] Transfer transactions show a special indicator (e.g., transfer icon or "Transfer" label)
- [ ] Person filter dropdown at the top of the list — selecting a person filters the list
- [ ] "All" option in the person filter to show all transactions (default)
- [ ] Pagination: "Load more" button or infinite scroll for additional pages
- [ ] Mobile-first: transaction rows are compact but readable on small screens
- [ ] Empty state: friendly message when no transactions exist

**Out of Scope**

- Transaction editing or deletion UI
- Date range filter UI
- Export to CSV
- Charts or visualizations

**Agent Instructions**
Create `src/components/transactions/transaction-list.tsx` and `src/components/transactions/transaction-filters.tsx`. Fetch transactions from `/api/transactions` with query params based on active filters. Use shadcn Select for the person filter dropdown. Use shadcn Badge for type indicators (green for income, red for expense). Implement "Load more" by incrementing the page param and appending results. On the transactions page, compose the add buttons (expense/income), filters, and list together.
