# Simply Finance

Simply Finance is a shared household finance tracker for two or more ENV-allowlisted users. Read `CONTEXT.md` for money terminology and `docs/adr/` before changing financial storage or authentication. The accepted first-version scope is in `docs/scope.md`.

## Architecture and delivery

- Keep financial rules and authorization in the Go backend behind a versioned HTTP JSON API. The React UI is a client, not a second implementation of the rules.
- Use SQLite with a persistent data directory. Keep migrations versioned. Depend on Docker for reproducible builds and deployment; use Bun for TypeScript work.
- Ship one Cobra binary: `serve`, `migrate`, `seed`, and `hash-password`. Database migration and default seeding are explicit operator commands, never server startup behavior. Embed migrations and repeatable seeds separately; prepare test databases explicitly. Preserve applied migrations when adding new versions.
- Finish and verify the backend before building the mobile-first React, shadcn/ui, and Tailwind UI. Preserve one set of domain rules across all future clients.
- Pass storage, time, and configuration into application services. Keep transport concerns outside financial rules. Prefer small interfaces at actual integration boundaries, not an interface for every type.

## Money and history

- Store amounts as integer minor units and exchange rates as fixed-precision decimals. Never use floating-point arithmetic for money or rates.
- Store each wallet's currency. Snapshot the selected exchange rate on the transaction; settings changes must not reprice history.
- Categories use stable IDs and an income/expense type; names remain as entered. Legacy records resolve to Others without rewriting revision payloads. Monthly totals include only current non-voided expenses at their saved BDT values; category percentages use actual spending, not the monthly target.
- Keep credit-card debt separate from cash. A card repayment is a transfer, not another expense.
- Record opening balances and balance adjustments as transactions. Preserve prior transaction revisions and their authors. Apply all balance effects atomically.
- Protect financial writes against duplicate requests and stale edits. A retried request must not create a second financial effect.
- A recurring occurrence is not an expense until manually confirmed. An omitted amount uses its scheduled amount; an explicit invalid amount is an error, not an omission.
- Use Asia/Dhaka for calendar dates and recurrence boundaries. Persist audit timestamps as unambiguous instants. Monthly and yearly schedules preserve their original anchor when a shorter month requires clamping.

## Access and privacy

- ENV contains the allowed emails and password hashes. SQLite user profiles do not grant access. No public registration, file uploads, or external authentication service in this version.
- Derive the acting user from the authenticated session, never from a submitted author field. Both users share the household records.
- Never log passwords, hashes, session tokens, or full financial request bodies. Keep real data, ENV files, and SQLite databases out of version control.

## Verification and changes

- For nontrivial changes, explore and present the intended behavior and affected boundaries before implementing. Use test-first slices at agreed public boundaries. Every discovered bug gets a regression test.
- Exercise application operations against temporary, seeded SQLite databases. Keep fixtures synthetic and independent of production data. Include HTTP tests with real authentication and browser tests for the completed UI.
- Verify atomic writes, historical rates, corrections, duplicate submissions, concurrent edits, recurrence date boundaries, and access revocation. Do not substitute an in-memory repository for SQLite integration proof.
- Keep `.planning/` uncommitted. Put only lasting trade-offs in short ADRs. Never hard-wrap Markdown paragraphs.
- Report exact checks run and remaining gaps. A passing Go suite does not prove Docker startup, backup/restore, or mobile browser behavior.
