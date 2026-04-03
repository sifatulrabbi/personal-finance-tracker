# Pass 1 - Discovery & Clarification

## Primary User / Actor

The primary actor is the household maintainer, with invited household members as secondary actors. The maintainer sets up the household, manages app access, defines transaction people, and establishes the initial ledger structure; invited members then participate in day-to-day finance tracking.

## Success Condition

A household can sign in through Google via WorkOS, manage who belongs to the household, track money across multiple accounts, record expenses and income with the right person, category, and origin context, transfer money between accounts without breaking balances, and review transaction history from a mobile-first dark-mode web app.

## Systems Touched

| System             | Details                                                                            |
| ------------------ | ---------------------------------------------------------------------------------- |
| Frontend           | Next.js App Router web app, mobile-first UI, Tailwind CSS, shadcn/ui               |
| Backend            | Next.js route handlers and server utilities inside the same app                    |
| Database           | SQLite accessed through Bun's built-in SQLite client                               |
| Auth               | WorkOS-backed + NextAuth.js Google login with invitation-only local access control |
| Data / Domain      | Households, users, people, categories, accounts, origins, transactions, transfers  |
| Hosting Constraint | Expected to run on Vercel later, but deployment work is explicitly out of scope    |

## Explicit Constraints

- Mobile-first UI with acceptable desktop behavior.
- Dark theme only with `#0077ff` as the accent color.
- No gradients and no light-theme support.
- Preferred stack is Next.js, WorkOS, Tailwind CSS, shadcn/ui, Bun `1.3.11`, and TypeScript.
- Use Bun as runtime, package manager, test runner, and SQLite client where practical.
- Use SQLite instead of a separate server database.
- Keep CRUD logic inside the Next.js app rather than introducing a separate API service.
- Use `income` and `expense` terminology consistently in UI and code instead of banking `credit` / `debit` language.
- Sign-in is invite-only; there is no open registration flow.
- A user belongs to exactly one household in v1.

## Cross-Cutting Concerns

| Concern               | Why It Matters                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------- |
| Household scoping     | Every read/write must stay inside the signed-in user's household                             |
| Auth gating           | The app must reject non-invited users even if Google auth succeeds                           |
| Safe seeding          | Seed data must never overwrite real household data                                           |
| Error handling        | Invitation failures, duplicate entities, and protected deletes need clear user-safe messages |
| Logging / diagnostics | Auth callbacks, seed operations, and transfer writes need enough logging for debugging       |
| Money correctness     | Account balances and transaction writes must remain atomic and deterministic                 |
| Mobile UX             | Settings, accounts, and transaction capture flows must work comfortably on phones            |

## Explicitly Out of Scope

- Vercel deployment implementation.
- Light mode or multi-theme support.
- Multi-household membership for a single user.
- Budgets, goals, recurring transactions, attachments, and exports.
- A full invitation email system or token-based invite acceptance flow.
- A dedicated reporting/dashboard implementation beyond whatever shell placeholders are needed.
- Editing or deleting transactions in v1.

## Assumptions

1. `TypeScript 6.x` is treated as `latest stable TypeScript 5.x` until 6.x exists in the ecosystem.
2. The `users` table is the lightweight local profile store; a separate `profiles` table is unnecessary in v1.
3. Transaction `people` are household-scoped actors used for attribution and filtering; they are distinct from authenticated `users`, because the default `Household` person is not a login account.
4. The settings page will likely need three sections: one for transaction people, one for transaction categories, and one for app-access members.
5. Categories are household-scoped entities with unique IDs and household-local unique names; they can be created from settings or inline during expense and income entry.
6. Categories are required on manually created income and expense transactions. Transfer-generated ledger entries may leave `category_id` empty because they represent internal movement rather than categorized spend or earnings.
7. `Origin` is required for income entries, not for expense entries. The line saying every transaction requires an origin is treated as shorthand for the income flow, because it conflicts with the earlier income-specific origin rules.
8. Transfers are modeled as a linked pair of ledger entries: one `expense` from the source account and one `income` into the destination account, both sharing a transfer group identifier.
9. Transfer-generated income entries do not require an external origin, because the money came from another in-app account.
10. Monetary values should be stored as integer minor units rather than SQLite `REAL` fields to avoid rounding drift.
11. Household creation is seed-driven in v1; there is no household self-service creation UI.
12. Seed data must be strictly idempotent and append-only in practice: insert missing records, never mutate or overwrite existing prod records.

## Known Unknowns / Spikes Needed

| Unknown                                                               | Why It Needs a Spike                                                                                                         |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Bun SQLite in a Next.js App Router app that is later hosted on Vercel | Local development is straightforward, but deploy/runtime guarantees are unclear and persistence may be unsuitable for Vercel |
| Exact WorkOS integration path with modern Next.js auth handling       | We need a precise callback/session design before building invitation gating and drafted-user activation                      |

## Target Output Format

Plain markdown, saved into `project/tickets-codex/` as a small backlog set the team can review file-by-file.
