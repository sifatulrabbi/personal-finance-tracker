# Pass 1 — Discovery & Clarification

## Primary User / Actor

Household members — primarily the app maintainer and their family members. The maintainer manages the household, invites members, and everyone tracks income/expenses.

## Success Condition

A household can collaboratively track all income and expenses across multiple accounts, see who initiated each transaction, filter by person, manage money-holding accounts, and transfer between them — all from a mobile-first dark-themed web app.

## Systems Touched

| System       | Details                                              |
| ------------ | ---------------------------------------------------- |
| Frontend     | Next.js App Router, React, Tailwind CSS, shadcn/ui   |
| Backend      | Next.js API Route Handlers (no separate server)       |
| Database     | SQLite via Bun's built-in `bun:sqlite` client         |
| Auth         | WorkOS + Google OAuth (via next-auth integration)      |
| Third-party  | WorkOS (auth), Google (OAuth provider)                 |
| Deployment   | Vercel (future — not in scope for this decomposition) |

## Explicit Constraints

- **Mobile-first** responsive design, must work well on phones
- **Dark theme only** — `#0077ff` accent color, no light theme, no gradients
- **Bun 1.3.11** as runtime, package manager, and test suite
- **SQLite** with Bun's built-in client (not PostgreSQL, not an ORM)
- **Next.js App Router** — all CRUD logic via API route handlers
- **WorkOS** handles all authentication/authorization
- **Single sign-in page** — no sign-up page (invitation-only)
- **Vercel-compatible** (keep in mind, no deployment work needed now)

## Cross-Cutting Concerns

| Concern              | Notes                                                              |
| -------------------- | ------------------------------------------------------------------ |
| Auth                 | WorkOS integration, middleware for protected routes                 |
| Database migrations  | Must be isolated, safe seed that won't overwrite prod data          |
| Error handling       | User-facing errors for auth rejection (non-invited users)           |
| Mobile responsiveness| Every UI ticket must consider mobile-first                          |

## Explicitly OUT of Scope

- Deployment / Vercel configuration
- Light theme or multi-theme support
- Multi-household finance tracking (users belong to one household only)
- Categories, budgets, goals, tags (not mentioned in new requirements)
- Recurring transactions (not mentioned in new requirements)
- Reports / charts (no specific chart features detailed yet)
- Multi-currency support (not mentioned in new requirements)
- Full contact/CRM system for origins (origins are simple name entities)

## Assumptions (documented — need confirmation where noted)

1. **TypeScript version**: Requirements say "typescript 6.x" but TypeScript 6 does not exist (latest stable is 5.x). **Assuming latest TypeScript 5.x.** ⚠️ Needs confirmation.
2. **Full rewrite**: The "rework" branch and requirements describe a completely different tech stack (Next.js + SQLite vs current Hono + Vite + PostgreSQL). This is a ground-up rewrite, not an incremental migration.
3. **Bun's SQLite client**: Will use `bun:sqlite` directly with raw SQL or a thin query helper — no ORM layer.
4. **Origin entity**: A simple record (id, name, optional description) representing where income comes from (client, employer, etc.). Not a full contact system.
5. **Person entity**: Represents a household member tagged on transactions. Distinct from the authenticated user (though they may overlap). The default "Household" person is auto-created per household for shared expenses.
6. **Transfer model**: An account-to-account transfer creates two transaction records — one expense (from source account) and one income (to destination account). Both are linked.
7. **No separate server**: All backend logic lives in Next.js API route handlers within the app router.
8. **Seed safety**: The seed script must be idempotent — check for existence before inserting, never overwrite existing data.
9. **Charts library**: Requirements mention "a well performant and light weight charts library" but no specific chart features are detailed. Deferring library selection to when chart features are specified.
10. **WorkOS + next-auth**: Will follow the WorkOS next-auth integration pattern per their docs (https://workos.com/docs/integrations/next-auth).

## Known Unknowns (Spikes Required)

| Unknown                                    | Risk                                                      |
| ------------------------------------------ | --------------------------------------------------------- |
| Bun's SQLite client in Next.js on Vercel   | `bun:sqlite` may not work in Vercel's serverless runtime  |
| WorkOS + next-auth with App Router         | Integration specifics, session handling, callback flow     |

## Target Output Format

Plain Markdown — saved to `.project/tickets-claude/`
