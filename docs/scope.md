# First-version scope

## Included

- Shared access for ENV-allowlisted users, identified by email and a SQLite profile. Passwords are supplied as hashes. All users can work with the same household records.
- Physical-cash, bank, digital, and card wallets with names, currencies, optional account details, opening balances, recorded adjustments, and archiving. Cards distinguish debit from credit; credit cards have a limit and debt balance.
- Income, expenses, wallet transfers, credit-card repayments, corrections, voids, and preserved edit attribution. Records have dates and optional descriptive notes. There are no file attachments.
- BDT by default and USD support. Settings provide the default BDT-per-USD rate. Applicable transactions can override it and retain the effective rate used at recording time.
- Cross-currency transfers record sent and received amounts. A fee is an expense, not part of transfer income. Bank and debit-card representations must not duplicate the same cash balance.
- Weekly, monthly, and yearly recurring bills. Display due items without sending notifications. Users confirm payment manually with an optional replacement amount and note. Empty amount means the expected amount; charges are included manually in the final amount.
- A mobile-first React, TypeScript, shadcn/ui, and Tailwind web client. No separate desktop design work.
- Flat income and expense categories with one category per income or expense, category creation in Settings and record forms, and Others defaults. Recurring bills carry an expense category.
- Monthly actual spending in BDT, category shares of that spending, and a single versioned monthly target. No category-level budgets.
- A locally buildable Docker image, persistent SQLite storage, reproducible tests, and concise setup and recovery instructions.

## Excluded

Bank connections, credit-card statement processing, automatic billing-cycle or interest calculations, minimum-payment rules, installment plans, invoice/file uploads, notifications, automatic bill payment, public registration, category-level budgets, reports beyond the monthly spending view, spreadsheet imports, and container-registry publishing.

## Delivery gates

1. Backend: financial rules, SQLite-backed operations, and the HTTP API work before frontend implementation begins. Test data is synthetic and isolated from real finances.
2. Frontend: mobile browser tests cover login, wallets, expenses, income, transfers, debt repayment, corrections, recurring payment confirmation, and rate settings.
3. Packaging: verify Docker build/startup, persistent state across restart, and backup/restore. Report any unavailable environment checks instead of marking them complete.
4. Handoff: provide exact commands and outstanding risks for the user's manual testing. Fresh-agent review should focus on financial integrity, authentication, recurrence dates, and concurrency.
