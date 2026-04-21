# EPIC: Accounts & Transfers

**Goal**: Let the household manage money-holding accounts and move money between them while keeping the ledger internally consistent.

**Done when**: Users can create and maintain accounts, see balances, and perform transfers that generate linked ledger entries without breaking history or account totals.

---

### [STORY] T-020 Households can manage money-holding accounts

**Parent**: Epic - Accounts & Transfers
**Type**: Story
**Size**: M (1d)
**Priority**: P1 (high)
**Agent-Executable**: Partial
**Blocked By**: T-010, T-021, T-022
**Blocks**: T-023, T-026, T-029, T-033

**Context**
Accounts are the core money containers in the product. Every transaction and transfer depends on having the right account structure first.

**Acceptance Criteria**

- [ ] Given an authenticated user, when they open the accounts experience, then they can see all household accounts with current balances.
- [ ] The household can create a new account with a name, optional description, and starting balance.
- [ ] Existing accounts can be updated for descriptive fields and safely deleted only when no ledger history depends on them.
- [ ] Edge case: the starting balance is captured once and does not create silent drift in the running balance model.

**Out of Scope**

- Bank sync.
- Multi-currency balances.
- Per-account analytics.

**Technical Notes**
Treat accounts as domain entities with durable balances, not just labels attached to transactions.

**Agent Instructions**
Mark this story complete only when both the household-scoped API and the management UI are working together.

---

### [TASK] T-021 Implement the account CRUD API

**Parent**: Epic - Accounts & Transfers
**Type**: Task
**Size**: M (1d)
**Priority**: P1 (high)
**Agent-Executable**: Yes
**Blocked By**: T-005, T-007, T-010
**Blocks**: T-020, T-022, T-024, T-027, T-031, T-034

**Context**
Every later finance workflow reads or mutates accounts. The API contract therefore needs strong invariants around household scoping and balance fields.

**Acceptance Criteria**

- [ ] Authenticated users can list household accounts and fetch individual account details through a household-scoped API.
- [ ] New accounts can be created with a name, optional description, and starting balance, with the current balance initialized consistently.
- [ ] Account updates are limited to allowed fields, and deletion is blocked when transactions already reference the account.
- [ ] Edge case: requests referencing accounts from another household are rejected cleanly.

**Out of Scope**

- Importing account statements.
- Account type taxonomies beyond a simple name/description model.

**Technical Notes**
Use integer minor units for all balance fields and keep balance mutations out of generic update routes.

**Agent Instructions**
Implement the CRUD contract with strong validation and protect the balance fields from ad hoc edits.

---

### [TASK] T-022 Build the accounts page UI

**Parent**: Epic - Accounts & Transfers
**Type**: Task
**Size**: M (1d)
**Priority**: P1 (high)
**Agent-Executable**: Partial
**Blocked By**: T-008, T-021
**Blocks**: T-020, T-025

**Context**
The account list is a daily-use surface, especially on mobile where users need to see balances quickly and reach transfer actions without hunting.

**Acceptance Criteria**

- [ ] The accounts page displays all household accounts with readable balance summaries and clear create/edit/delete actions.
- [ ] The page exposes the household total across accounts without obscuring the individual balances.
- [ ] Create and edit flows can be completed without leaving the page.
- [ ] Edge case: destructive actions require explicit confirmation and surface dependency errors from the API clearly.

**Out of Scope**

- Transfer execution itself.
- Historical charts or trends.

**Technical Notes**
Favor stacked cards or list sections over data tables so the page remains comfortable on phones.

**Agent Instructions**
Build the page around mobile-first account cards and modal or inline forms, then wire it to the account API.

---

### [STORY] T-023 Households can transfer money between accounts without breaking ledger history

**Parent**: Epic - Accounts & Transfers
**Type**: Story
**Size**: M (1d)
**Priority**: P1 (high)
**Agent-Executable**: Partial
**Blocked By**: T-014, T-020, T-024, T-025
**Blocks**: T-033

**Context**
Transfers are a critical special case because they are not external income or spending, but they still need to appear honestly in the ledger and account balances.

**Acceptance Criteria**

- [ ] Given two household accounts, when a transfer is created, then the source account decreases and the destination account increases atomically.
- [ ] The transfer is represented as linked ledger entries so it can appear in transaction history without losing its paired meaning.
- [ ] The initiating person is captured so the transfer remains attributable like other transactions.
- [ ] Edge case: transferring between the same account is rejected, but transfers that temporarily produce a negative balance are allowed if the household uses credit-like accounts.

**Out of Scope**

- Transfer fees.
- Reversing or editing transfers in v1.

**Technical Notes**
The transfer model should stay legible in the DB and the UI. Linked entries with a shared identifier are the cleanest fit for the stated requirement.

**Agent Instructions**
Treat this story as complete only when both the API and the accounts UI prove the paired-entry behavior and balance changes.

---

### [TASK] T-024 Implement the transfer service/API as linked ledger entries

**Parent**: Epic - Accounts & Transfers
**Type**: Task
**Size**: M (1d)
**Priority**: P1 (high)
**Agent-Executable**: Yes
**Blocked By**: T-005, T-007, T-010, T-015, T-021
**Blocks**: T-023, T-025, T-034

**Context**
This task carries the main accounting correctness risk in the app. It needs to write both ledger entries and both account balance changes as one atomic unit.

**Acceptance Criteria**

- [ ] A transfer API accepts a source account, destination account, amount, initiating person, date, and optional description and writes the result atomically.
- [ ] The implementation creates one `expense` entry and one `income` entry linked by a transfer-group identifier.
- [ ] Source and destination balances are updated within the same transaction as the ledger entries.
- [ ] Edge case: transfer-generated entries bypass external origin and category requirements and are explicitly marked as internal transfers.

**Out of Scope**

- Batch transfers.
- Transfer editing UI.

**Technical Notes**
The transfer linkage should be queryable later so history screens can label transfers without reverse-engineering them. Transfer-generated entries can keep `category_id` empty because they represent internal movement rather than categorized income or spending.

**Agent Instructions**
Implement the write flow in one DB transaction, validate household ownership for every referenced ID, and return enough metadata for later history rendering.

---

### [TASK] T-025 Add the transfer UI to the accounts experience

**Parent**: Epic - Accounts & Transfers
**Type**: Task
**Size**: S (0.5d)
**Priority**: P2 (normal)
**Agent-Executable**: Partial
**Blocked By**: T-015, T-022, T-024
**Blocks**: T-023

**Context**
The accounts page is the most natural place to launch transfers because users already think about balances there.

**Acceptance Criteria**

- [ ] Users can open a transfer flow from the accounts experience without navigating elsewhere.
- [ ] The transfer UI captures source account, destination account, amount, date, person, and optional description.
- [ ] The form prevents selecting the same account for both ends of the transfer.
- [ ] Edge case: after a successful transfer, the accounts view refreshes to show the updated balances immediately.

**Out of Scope**

- Separate transfer history screens.
- Scheduled transfers.

**Technical Notes**
Keep the UI small and focused. This is a quick entry flow, not a long wizard.

**Agent Instructions**
Add a transfer dialog or inline panel to the accounts screen and wire it directly to the transfer API.
