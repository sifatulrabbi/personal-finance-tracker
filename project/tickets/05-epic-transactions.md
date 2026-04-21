# EPIC: Transactions, Categories, Origins, and History

**Goal**: Let the household capture expenses and income with the right category and origin context, then browse that ledger through useful household-focused filters.

**Done when**: Users can record expenses and income, choose or create categories inline, reuse or create origins inline, and review a filterable transaction history that correctly labels transfers.

---

### [STORY] T-026 Households can record expense transactions with a person and an account

**Parent**: Epic - Transactions, Categories, Origins, and History
**Type**: Story
**Size**: M (1d)
**Priority**: P1 (high)
**Agent-Executable**: Partial
**Blocked By**: T-014, T-020, T-027, T-028
**Blocks**: T-033

**Context**
Expense capture is the most common write path in the app. It must be fast, explicit, and safe for shared-household use, while still tagging the transaction with a reusable category.

**Acceptance Criteria**

- [ ] Given a valid account, person, and category, when a user records an expense, then the transaction is saved and the account balance decreases immediately.
- [ ] Shared household spending can be attributed to the default `Household` person when no single member should own the expense.
- [ ] Given a new category name entered during expense capture, when the expense is saved, then the category is created once and linked to the transaction.
- [ ] The saved expense becomes visible in transaction history with the expected person, category, and account labels.
- [ ] Edge case: invalid amounts or cross-household IDs are rejected without mutating balances.

**Out of Scope**

- Receipt attachments.
- Transaction editing or deletion.

**Technical Notes**
Treat expense creation as a balance mutation plus ledger insert that must succeed or fail together.

**Agent Instructions**
Close the story only when both the API and UI prove that expense creation is quick and balance-safe.

---

### [TASK] T-027 Implement the expense-create API and balance mutation logic

**Parent**: Epic - Transactions, Categories, Origins, and History
**Type**: Task
**Size**: M (1d)
**Priority**: P1 (high)
**Agent-Executable**: Yes
**Blocked By**: T-005, T-007, T-010, T-015, T-021
**Blocks**: T-026, T-028, T-034

**Context**
Expense creation is the first half of the core ledger behavior. It needs strong household checks, category resolution, and atomic writes.

**Acceptance Criteria**

- [ ] An authenticated API can create an `expense` transaction using a household-scoped account and person plus either an existing `category_id` or a new `category_name`, amount, date, and optional description.
- [ ] When a new `category_name` is supplied, the API finds an existing household category with the same normalized name or creates one before writing the transaction.
- [ ] The transaction write, optional category creation, and the corresponding account-balance decrement happen in the same DB transaction.
- [ ] The ledger entry records which authenticated user created it for future auditability.
- [ ] Edge case: invalid or foreign-household account, person, or category IDs fail before any balance mutation happens.

**Out of Scope**

- Income handling.
- Bulk transaction import.

**Technical Notes**
Expense entries should not carry an origin reference. They should, however, carry a category reference so the expense history remains meaningful.

**Agent Instructions**
Implement a focused create endpoint for expenses, including category find-or-create logic, and prove its balance mutation behavior with tests or a clear verification harness.

---

### [TASK] T-028 Build the expense-entry UI on the transactions page

**Parent**: Epic - Transactions, Categories, Origins, and History
**Type**: Task
**Size**: M (1d)
**Priority**: P1 (high)
**Agent-Executable**: Partial
**Blocked By**: T-008, T-015, T-021, T-027, T-037
**Blocks**: T-026, T-035

**Context**
If expense capture feels heavy on mobile, the app will fail its core daily-use job even if the backend is correct.

**Acceptance Criteria**

- [ ] The transactions experience exposes a clear way to start a new expense without leaving the main ledger screen.
- [ ] The form captures amount, account, person, category, date, and optional description with mobile-friendly controls.
- [ ] The category control lets the user pick an existing household category or type a new one inline.
- [ ] Validation errors are surfaced inline and success returns the user cleanly to the ledger context.
- [ ] Edge case: the form defaults to sensible values such as today's date and the seeded `Household` option being easy to find.

**Out of Scope**

- Income entry.
- Transaction filters and history rendering.

**Technical Notes**
Fast entry matters more than ornamental UI here. Optimize for the common path.

**Agent Instructions**
Implement a simple, touch-friendly expense flow and wire it to the expense API.

---

### [STORY] T-029 Households can record income with reusable or inline-created origins

**Parent**: Epic - Transactions, Categories, Origins, and History
**Type**: Story
**Size**: M (1d)
**Priority**: P1 (high)
**Agent-Executable**: Partial
**Blocked By**: T-014, T-020, T-030, T-031, T-032
**Blocks**: T-033

**Context**
Income entries are similar to expenses, but they introduce two reusable classification concepts: category and origin. The experience should stay lightweight even when the right category or origin does not exist yet.

**Acceptance Criteria**

- [ ] Given a valid account, person, category selection or category name, and origin selection or origin name, when a user records income, then the account balance increases and the transaction is saved.
- [ ] Existing categories and origins can be reused quickly, but new category names and origin names can also be typed inline and become reusable later.
- [ ] The saved income appears in transaction history with its associated category and origin labels.
- [ ] Edge case: entering a category name or origin name that already exists for the household reuses the existing entity rather than creating a duplicate.

**Out of Scope**

- Rich origin metadata.
- Income editing and deletion.

**Technical Notes**
The inline origin flow is a meaningful UX differentiator in the product and deserves explicit treatment.

**Agent Instructions**
Close the story only when the origin API, income API, and income UI prove the reuse-or-create behavior end to end.

---

### [TASK] T-030 Implement the origins list/create/delete API

**Parent**: Epic - Transactions, Categories, Origins, and History
**Type**: Task
**Size**: S (0.5d)
**Priority**: P1 (high)
**Agent-Executable**: Yes
**Blocked By**: T-005, T-007, T-010
**Blocks**: T-029, T-031, T-032

**Context**
Origins are intentionally simple, but the app still needs a stable API to list them for selection and maintain them safely.

**Acceptance Criteria**

- [ ] Authenticated users can list household origins and create new ones with household-local uniqueness enforced.
- [ ] Deleting an unused origin is supported, while deleting an origin already referenced by transactions is rejected.
- [ ] Duplicate origin names in the same household return a clear conflict response rather than a generic error.
- [ ] Edge case: origins from another household cannot be listed, deleted, or reused through the API.

**Out of Scope**

- Editing origin names.
- Origin merge or dedupe tools.

**Technical Notes**
This API supports both explicit management and the inline creation path during income entry.

**Agent Instructions**
Implement the smallest possible household-scoped contract that later UI and income tickets can safely rely on.

---

### [TASK] T-031 Implement the income-create API with inline origin resolution

**Parent**: Epic - Transactions, Categories, Origins, and History
**Type**: Task
**Size**: M (1d)
**Priority**: P1 (high)
**Agent-Executable**: Yes
**Blocked By**: T-005, T-007, T-010, T-015, T-021, T-030
**Blocks**: T-029, T-032, T-034

**Context**
The income API needs to do more than simple validation; it also has to resolve whether the user picked existing categories and origins or typed new ones.

**Acceptance Criteria**

- [ ] An authenticated API can create an `income` transaction using a household-scoped account and person plus either an existing `category_id` or a new `category_name`, and either an existing `origin_id` or a new `origin_name`.
- [ ] When a new `category_name` or `origin_name` is supplied, the API finds an existing household entity with the same normalized name or creates it before writing the transaction.
- [ ] The transaction write, optional category creation, optional origin creation, and account-balance increment happen atomically.
- [ ] Edge case: requests missing both the category path and the origin path are rejected before any write occurs.

**Out of Scope**

- Transfer-generated income entries.
- Editing income records later.

**Technical Notes**
Normalize category names and origin names before compare-or-create so trivial casing differences do not produce duplicates.

**Agent Instructions**
Implement the category and origin find-or-create logic inside one transaction and return enough response data for the UI to refresh without guesswork.

---

### [TASK] T-032 Build the income-entry UI with origin combobox behavior

**Parent**: Epic - Transactions, Categories, Origins, and History
**Type**: Task
**Size**: M (1d)
**Priority**: P1 (high)
**Agent-Executable**: Partial
**Blocked By**: T-008, T-015, T-021, T-030, T-031, T-037
**Blocks**: T-029, T-035

**Context**
The income UI should make both category reuse and origin reuse feel obvious while still allowing brand-new values to be entered quickly on mobile.

**Acceptance Criteria**

- [ ] The transactions experience exposes a dedicated income-entry flow alongside expense capture.
- [ ] The category input supports selecting existing categories and entering a new name without forcing the user into a separate admin screen.
- [ ] The origin input supports selecting existing origins and entering a new name without forcing the user into a separate admin screen.
- [ ] The form submits the correct API shape depending on whether the user chose existing categories and origins or typed new ones.
- [ ] Edge case: if the typed category or origin name matches an existing suggestion, the UI does not create an accidental duplicate path.

**Out of Scope**

- Advanced origin management screens.
- Bulk income imports.

**Technical Notes**
A searchable combobox or popover-plus-command pattern is a good fit here, as long as free text remains possible.

**Agent Instructions**
Build mobile-friendly category and origin pickers that clearly support both select and create behaviors, then wire them to the income API.

---

### [STORY] T-033 Households can browse and filter their transaction history

**Parent**: Epic - Transactions, Categories, Origins, and History
**Type**: Story
**Size**: M (1d)
**Priority**: P1 (high)
**Agent-Executable**: Partial
**Blocked By**: T-023, T-026, T-029, T-034, T-035
**Blocks**: -

**Context**
A finance tracker is only trustworthy if users can review what happened. History is where the account, person, category, origin, and transfer decisions become legible to the household.

**Acceptance Criteria**

- [ ] Users can browse transactions in reverse-chronological order with enough detail to understand type, amount, account, person, category, and origin where relevant.
- [ ] Users can filter the ledger by person and category and retain a household-oriented view of who initiated what.
- [ ] Transfer entries are visually identifiable as transfers rather than being mistaken for unrelated income and expense items.
- [ ] Edge case: the history experience handles an empty state and paginated growth without collapsing on mobile.

**Out of Scope**

- Editing or deleting transactions.
- Reporting dashboards and charts.

**Technical Notes**
This story is where the earlier modeling choices either feel coherent or fall apart. It is the best end-to-end proof of the ledger design.

**Agent Instructions**
Do not close this story until history clearly renders expenses, income, and transfers with working filters on mobile-first layouts.

---

### [TASK] T-034 Implement the transaction-list API with household filters and transfer metadata

**Parent**: Epic - Transactions, Categories, Origins, and History
**Type**: Task
**Size**: M (1d)
**Priority**: P1 (high)
**Agent-Executable**: Yes
**Blocked By**: T-005, T-007, T-010, T-021, T-024, T-027, T-031
**Blocks**: T-033, T-035

**Context**
History rendering needs one reliable read model rather than piecing together separate endpoints for each transaction type.

**Acceptance Criteria**

- [ ] An authenticated list API returns household transactions in reverse-chronological order with joined account, person, category, and origin display data.
- [ ] The API supports filters for at least person, category, account, and transaction type, plus paginated responses.
- [ ] Transfer metadata is present so the UI can label linked transfer entries accurately.
- [ ] Edge case: filters never leak transactions across household boundaries, even when valid IDs from another household are supplied.

**Out of Scope**

- Full-text search.
- Date-range analytics.
- Transaction editing endpoints.

**Technical Notes**
Design the response shape for rendering convenience, not just DB purity. The UI will need joined category, origin, and actor labels more often than raw IDs.

**Agent Instructions**
Implement one history-focused query surface with clear pagination and filtering semantics, then verify it against seeded or test data.

---

### [TASK] T-035 Build the transaction-history UI with filters, pagination, and transfer labels

**Parent**: Epic - Transactions, Categories, Origins, and History
**Type**: Task
**Size**: M (1d)
**Priority**: P1 (high)
**Agent-Executable**: Partial
**Blocked By**: T-008, T-015, T-021, T-028, T-032, T-034, T-037
**Blocks**: T-033

**Context**
This UI is the household's ledger review surface. It needs to stay compact and understandable on phones while still carrying the necessary detail.

**Acceptance Criteria**

- [ ] The transactions page renders a readable list of ledger entries with type, amount, date, account, person, category, and origin or transfer context where applicable.
- [ ] Users can filter the list by person and category at minimum, with room for account and type filtering where useful.
- [ ] The history view supports pagination or incremental loading without losing filter state.
- [ ] Edge case: income, expense, and transfer rows are visually distinct enough to scan quickly on small screens.

**Out of Scope**

- Charts.
- CSV export.
- Edit/delete transaction controls.

**Technical Notes**
Avoid turning this into a desktop-style table. Ledger cards or grouped rows will likely read better on mobile.

**Agent Instructions**
Compose the expense flow, income flow, filters, and history list into one transactions experience that still feels clean on a phone.
