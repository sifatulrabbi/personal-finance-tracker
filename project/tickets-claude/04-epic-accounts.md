# EPIC: Account Management

**Goal**: Users can create and manage money-holding accounts (credit card, debit card, virtual wallet, cash, etc.) and transfer money between them.

**Done when**: A user can create accounts with names and initial balances, view all accounts, edit/delete them, and transfer money between accounts — with transfers reflected as expense+income pairs in transaction history.

---

## T-015 — TASK: Implement account CRUD API

**Parent**: Epic — Account Management
**Type**: Task
**Size**: M (1d)
**Priority**: P1 (high)
**Agent-Executable**: Yes
**Blocked By**: T-004, T-011
**Blocks**: T-016, T-017, T-019, T-021

**Context**
Accounts represent money sources — credit cards, debit cards, virtual wallets, cash, etc. They have a name, description, initial amount, and a running balance that updates with transactions.

**Acceptance Criteria**

- [ ] API: `GET /api/accounts` — returns all accounts for the current user's household, ordered by name
- [ ] API: `POST /api/accounts` — creates a new account with: name (required), description (optional), initial_amount (required, default 0). Sets `current_balance = initial_amount`
- [ ] API: `GET /api/accounts/:id` — returns a single account with its current balance
- [ ] API: `PATCH /api/accounts/:id` — updates name, description (NOT initial_amount or current_balance directly)
- [ ] API: `DELETE /api/accounts/:id` — deletes an account. Returns 400 if the account has any transactions (prevent orphaning)
- [ ] All endpoints scoped to the user's household_id from session
- [ ] Input validation: name cannot be empty, initial_amount must be a number >= 0

**Out of Scope**

- Account types/categories (keep it simple — just name-based identification)
- Multi-currency (single currency assumed)
- Balance recalculation endpoint (balance is maintained via transaction operations)

**Technical Notes**
The `current_balance` field is denormalized for performance — it's updated atomically whenever a transaction is created or deleted against this account. The initial_amount is immutable after creation (it represents the starting point).

**Agent Instructions**
Create `app/api/accounts/route.ts` for GET and POST. Create `app/api/accounts/[id]/route.ts` for GET, PATCH, DELETE. Use prepared statements from `lib/db.ts`. Validate inputs. For DELETE, check: `SELECT COUNT(*) FROM transactions WHERE account_id = ?`. Scope all queries with `household_id`.

---

## T-016 — TASK: Create accounts page UI

**Parent**: Epic — Account Management
**Type**: Task
**Size**: M (1d)
**Priority**: P1 (high)
**Agent-Executable**: Partial
**Blocked By**: T-002, T-006, T-015
**Blocks**: T-017, T-018

**Context**
Users need a page to view all their accounts, see balances, and create/edit/delete accounts. This is one of the core pages of the app.

**Acceptance Criteria**

- [ ] Accounts page at `/accounts` accessible from navigation
- [ ] Displays all accounts as cards/list items showing: name, description, current balance
- [ ] "Add Account" button opens a form (dialog or inline) with: name, description, initial amount fields
- [ ] Each account has edit and delete actions
- [ ] Edit opens a form pre-filled with current values (name, description only)
- [ ] Delete shows a confirmation dialog before proceeding
- [ ] If deletion fails (account has transactions), show the error message
- [ ] Mobile-first layout — cards stack vertically on mobile
- [ ] Total balance across all accounts displayed at the top
- [ ] Uses shadcn components: Card, Button, Dialog, Input, Label

**Out of Scope**

- Transfer UI (T-018)
- Transaction history per account
- Account filtering or search

**Agent Instructions**
Create `app/(app)/accounts/page.tsx`. Create reusable components: `components/accounts/account-card.tsx`, `components/accounts/account-form.tsx`. Use `fetch('/api/accounts')` for data. Use shadcn Dialog for create/edit forms. Calculate total balance client-side from the accounts list. Use `Intl.NumberFormat` for currency display.

---

## T-017 — TASK: Implement account transfer logic

**Parent**: Epic — Account Management
**Type**: Task
**Size**: M (1d)
**Priority**: P1 (high)
**Agent-Executable**: Yes
**Blocked By**: T-015, T-004
**Blocks**: T-018

**Context**
Users can transfer money between accounts. Per requirements, a transfer creates one expense against the source account and one income to the destination account, linked by a shared `transfer_id`. Both records appear in the expense history.

**Acceptance Criteria**

- [ ] API: `POST /api/transfers` — accepts: `from_account_id`, `to_account_id`, `amount`, `description` (optional), `date`, `person_id`
- [ ] Creates two transaction records in a single SQLite transaction:
  - Expense: `account_id = from_account_id`, `type = 'expense'`, `amount`, `transfer_id = <generated UUID>`
  - Income: `account_id = to_account_id`, `type = 'income'`, `amount`, `transfer_id = <same UUID>`
- [ ] Both transactions share the same `transfer_id` so they can be identified as a pair
- [ ] Source account `current_balance` decremented by amount
- [ ] Destination account `current_balance` incremented by amount
- [ ] Validation: from and to accounts must be different, amount must be > 0, both accounts must exist and belong to the household
- [ ] If source account balance would go negative, still allow it (overdraft is valid for credit cards)
- [ ] All operations atomic — if any step fails, nothing is committed

**Out of Scope**

- Transfer fees or exchange rates
- Reversing/canceling transfers (delete the transactions manually)
- Transfer history as a separate view

**Technical Notes**
Use SQLite's transaction support: `db.transaction(() => { ... })()`. Generate a UUID for `transfer_id` to link the pair. The `person_id` on both transactions should be the same (whoever initiated the transfer). `origin_id` is null for both since transfers are not income from an external source — but wait, the income side of a transfer doesn't have an external origin. Let's set `origin_id = null` for transfer-created income records. The type check constraint allows this since origin_id is nullable.

**Agent Instructions**
Create `app/api/transfers/route.ts` for POST. Generate a UUID for the transfer_id. In a SQLite transaction: validate inputs, insert expense record, insert income record, update source balance (`current_balance = current_balance - amount`), update destination balance (`current_balance = current_balance + amount`). Return both transaction records. Write a test that creates a transfer and verifies both balances changed correctly.

---

## T-018 — TASK: Create transfer UI

**Parent**: Epic — Account Management
**Type**: Task
**Size**: S (0.5d)
**Priority**: P2 (normal)
**Agent-Executable**: Partial
**Blocked By**: T-016, T-017
**Blocks**: —

**Context**
Users need a way to initiate transfers between accounts from the UI. This could be a button on the accounts page or a dedicated section.

**Acceptance Criteria**

- [ ] "Transfer" button accessible from the accounts page (or a dedicated transfer action)
- [ ] Transfer form with: source account (dropdown), destination account (dropdown), amount, date, person (dropdown), optional description
- [ ] Source and destination dropdowns exclude the selected other (can't transfer to same account)
- [ ] After successful transfer, account balances update in the UI
- [ ] Error handling: show validation errors from the API
- [ ] Mobile-friendly form layout

**Out of Scope**

- Transfer history view (transfers appear in general transaction history)
- Recurring transfers

**Agent Instructions**
Add a "Transfer" button to the accounts page that opens a shadcn Dialog. Create `components/accounts/transfer-form.tsx`. Fetch accounts for dropdowns. Fetch persons for the person dropdown. POST to `/api/transfers`. On success, close dialog and refetch accounts to update balances.
