# EPIC: Project Foundation & Architecture

**Goal**: Establish the Next.js + Bun + SQLite project from scratch with the design system, database layer, and app shell — the foundation everything else builds on.

**Done when**: A developer can run the app locally, see the dark-themed shell with navigation, connect to SQLite, run migrations, and seed the database.

---

## T-001 — CHORE: Initialize Next.js project with Bun and core dependencies

**Parent**: Epic — Project Foundation
**Type**: Chore
**Size**: M (1d)
**Priority**: P0 (blocker)
**Agent-Executable**: Yes
**Blocked By**: —
**Blocks**: T-002, T-003, T-006, T-007, T-008

**Context**
The entire app is being rewritten from a Hono + Vite + PostgreSQL monorepo to a single Next.js application. This ticket bootstraps the new project with all core dependencies.

**Acceptance Criteria**

- [ ] Next.js project initialized with App Router (not Pages Router) using Bun as the package manager
- [ ] TypeScript configured (latest 5.x — see assumption in 00-discovery.md)
- [ ] Tailwind CSS installed and configured
- [ ] shadcn/ui initialized and at least one component (Button) imported successfully
- [ ] Bun 1.3.11 used as runtime — `bun run dev` starts the dev server
- [ ] `bunfig.toml` configured if needed
- [ ] Project compiles and renders a placeholder page at `/`

**Out of Scope**

- Database setup (T-003)
- Theme/color configuration (T-002)
- App layout/navigation (T-006)

**Agent Instructions**
Run `bun create next-app` with TypeScript and Tailwind options enabled. Use App Router. Then run `bunx shadcn@latest init` to set up shadcn/ui. Verify `bun run dev` works. Remove boilerplate content from `app/page.tsx`. Ensure `package.json` scripts use `bun` where possible.

---

## T-002 — CHORE: Configure dark theme and design system

**Parent**: Epic — Project Foundation
**Type**: Chore
**Size**: S (0.5d)
**Priority**: P0 (blocker)
**Agent-Executable**: Yes
**Blocked By**: T-001
**Blocks**: T-006, T-009, T-016, T-018, T-020, T-022, T-025

**Context**
The app uses a dark-only theme with `#0077ff` as the accent color. No light theme, no gradients. The design system must be configured once at the foundation level so all UI tickets inherit it.

**Acceptance Criteria**

- [ ] Tailwind config extended with a custom color palette based on `#0077ff` (shades from 50 to 950)
- [ ] shadcn/ui theme configured for dark mode only — no theme toggle, no `prefers-color-scheme` detection
- [ ] CSS variables set for the dark theme (background, foreground, card, popover, primary, secondary, muted, accent, destructive, border, input, ring)
- [ ] No gradient utilities used or configured
- [ ] A visual smoke test page (temporary) confirms colors render correctly

**Out of Scope**

- Light theme or theme switching
- Gradient support
- Component-specific styling (handled per-ticket)

**Agent Instructions**
Edit `tailwind.config.ts` to add the custom color palette. Generate shades of `#0077ff` for primary colors. Update `globals.css` to set CSS variables for shadcn's dark theme. Set `darkMode: "class"` in Tailwind config and add `dark` class to `<html>`. Use solid backgrounds (dark grays: `#09090b`, `#0a0a0c`, etc.) for surfaces.

---

## T-003 — CHORE: Set up SQLite database with Bun's built-in client

**Parent**: Epic — Project Foundation
**Type**: Chore
**Size**: M (1d)
**Priority**: P0 (blocker)
**Agent-Executable**: Yes
**Blocked By**: T-001
**Blocks**: T-004

**Context**
The app uses SQLite via Bun's built-in `bun:sqlite` module instead of PostgreSQL or an ORM. We need a database connection utility, a migration runner, and a pattern for queries.

**Acceptance Criteria**

- [ ] Database utility module at `lib/db.ts` (or similar) that initializes a SQLite database using `bun:sqlite`
- [ ] Database file stored at a configurable path (e.g., `./data/finance.db` with env override)
- [ ] WAL mode enabled for better concurrent read performance
- [ ] A lightweight migration runner that executes numbered SQL files from a `migrations/` directory in order
- [ ] Migration state tracked in a `_migrations` table (filename + applied_at)
- [ ] Migrations are idempotent — running the runner twice doesn't fail or duplicate
- [ ] A `db:migrate` script added to `package.json`
- [ ] Basic test: create a table, insert a row, query it back

**Out of Scope**

- Actual application schema (T-004)
- Seed data (T-005)
- ORM or query builder — use raw SQL with Bun's prepared statements

**Technical Notes**
Bun's `bun:sqlite` is synchronous and very fast. Use `Database` class from `bun:sqlite`. Consider a thin helper for common patterns (e.g., `db.query<T>(sql, params)`) but keep it minimal. The database file should be gitignored.

**Agent Instructions**
Create `lib/db.ts` that exports a singleton `Database` instance. Create `lib/migrate.ts` that reads `*.sql` files from `migrations/` sorted by filename, checks against `_migrations` table, and applies pending ones in a transaction. Add `"db:migrate": "bun run lib/migrate.ts"` to package.json scripts. Create `migrations/` directory with a `.gitkeep`. Add `data/` to `.gitignore`.

---

## T-004 — CHORE: Create database schema migrations

**Parent**: Epic — Project Foundation
**Type**: Chore
**Size**: M (1d)
**Priority**: P0 (blocker)
**Agent-Executable**: Yes
**Blocked By**: T-003
**Blocks**: T-005, T-008, T-010, T-014, T-015, T-019, T-021, T-023, T-024

**Context**
All application tables must be defined as SQL migrations. This is isolated from feature work to keep migrations independently reviewable and revertable.

**Acceptance Criteria**

- [ ] Migration: `households` table — id (text PK, UUID), name (text, not null), description (text), created_at (text, ISO timestamp), updated_at (text)
- [ ] Migration: `users` table — id (text PK, UUID), household_id (FK → households), email (text, unique, not null), name (text), workos_user_id (text, unique), is_drafted (integer, default 1), created_at, updated_at. Index on workos_user_id. Index on email.
- [ ] Migration: `persons` table — id (text PK, UUID), household_id (FK → households), name (text, not null), is_default (integer, default 0), created_at, updated_at. Represents household members who can be tagged on transactions.
- [ ] Migration: `accounts` table — id (text PK, UUID), household_id (FK → households), name (text, not null), description (text), initial_amount (real, default 0), current_balance (real, default 0), created_at, updated_at
- [ ] Migration: `origins` table — id (text PK, UUID), household_id (FK → households), name (text, not null), description (text), created_at, updated_at. Unique constraint on (household_id, name).
- [ ] Migration: `transactions` table — id (text PK, UUID), household_id (FK → households), account_id (FK → accounts, not null), person_id (FK → persons, not null), origin_id (FK → origins, nullable — required for income type), type (text, not null, check: 'income' or 'expense'), amount (real, not null), description (text), date (text, not null), transfer_id (text, nullable — links paired transfer transactions), created_by (FK → users), created_at, updated_at
- [ ] All foreign keys use `ON DELETE RESTRICT` to prevent orphaning
- [ ] `PRAGMA foreign_keys = ON` enforced in the database connection
- [ ] All migrations run cleanly on a fresh database via `bun run db:migrate`

**Out of Scope**

- Seed data (T-005)
- Application logic or API routes
- Categories, budgets, goals, tags, recurring transactions (out of scope for rework)

**Technical Notes**
Use UUIDs as text primary keys (SQLite doesn't have a native UUID type). Store timestamps as ISO 8601 text strings. Use `real` for monetary amounts (sufficient for personal finance; if precision concerns arise, switch to integer cents in a future ticket). The `transfer_id` field on transactions links paired expense+income records for account transfers.

**Agent Instructions**
Create numbered SQL migration files in `migrations/`:

- `001_create_households.sql`
- `002_create_users.sql`
- `003_create_persons.sql`
- `004_create_accounts.sql`
- `005_create_origins.sql`
- `006_create_transactions.sql`

Each file should use `CREATE TABLE IF NOT EXISTS`. Include all indexes. Run `bun run db:migrate` to verify.

---

## T-005 — CHORE: Create database seed with safety checks

**Parent**: Epic — Project Foundation
**Type**: Chore
**Size**: S (0.5d)
**Priority**: P1 (high)
**Agent-Executable**: Yes
**Blocked By**: T-004
**Blocks**: T-010

**Context**
The app needs two seeded households (prod and test) with initial users and default "Household" persons. The seed must NEVER overwrite existing data — the prod database will contain real financial data.

**Acceptance Criteria**

- [ ] Seed script at `lib/seed.ts` (or `scripts/seed.ts`)
- [ ] Creates household "Rabbi Family" (prod) with user `mdsifatulislam.rabbi@gmail.com` if not already present
- [ ] Creates household "Test Household" with user `sifatuli.r@gmail.com` if not already present
- [ ] Creates a default person named "Household" for each household (with `is_default = 1`)
- [ ] All inserts use `INSERT OR IGNORE` or check-before-insert to prevent overwrites
- [ ] Running the seed multiple times produces no duplicates and no errors
- [ ] A `db:seed` script added to `package.json`
- [ ] Users are created in `is_drafted = 0` (active) state since they are seed/admin users

**Out of Scope**

- Application data (accounts, transactions, etc.)
- Automated seed on app start (manual script only)

**Technical Notes**
The seed is critical for safety. Use transactions and existence checks. The prod household email `mdsifatulislam.rabbi@gmail.com` is the app maintainer's real email. The test household email `sifatuli.r@gmail.com` is for development.

**Agent Instructions**
Create `scripts/seed.ts`. Use the `db` singleton from `lib/db.ts`. Wrap all operations in a transaction. For each household: check if it exists by name, skip if found. For each user: check if email exists, skip if found. For each default person: check if a default person exists for the household, skip if found. Add `"db:seed": "bun run scripts/seed.ts"` to package.json.

---

## T-006 — TASK: Create app shell with mobile-first responsive layout

**Parent**: Epic — Project Foundation
**Type**: Task
**Size**: M (1d)
**Priority**: P1 (high)
**Agent-Executable**: Partial
**Blocked By**: T-001, T-002
**Blocks**: T-009, T-012, T-016, T-018, T-020, T-022, T-025

**Context**
The app needs a consistent shell — navigation, header, content area — that works mobile-first. Since this is a household finance app used "mostly from mobiles", the mobile experience is primary.

**Acceptance Criteria**

- [ ] Root layout (`app/layout.tsx`) sets up the HTML structure with dark theme class and meta viewport
- [ ] A sidebar/bottom navigation component with links to: Dashboard, Accounts, Transactions, Settings
- [ ] On mobile (< 768px): bottom tab bar navigation
- [ ] On desktop (>= 768px): sidebar navigation
- [ ] Active route highlighted in navigation
- [ ] Content area scrollable independently of navigation
- [ ] Uses shadcn/ui components where applicable
- [ ] No gradients — solid backgrounds and borders only

**Out of Scope**

- Authentication gating (T-011)
- Page content (handled by individual feature tickets)
- Dashboard page content

**Agent Instructions**
Create `components/layout/app-shell.tsx` with responsive navigation. Use Next.js `usePathname()` for active route detection. Use shadcn Button or custom nav items. Mobile: fixed bottom bar. Desktop: fixed left sidebar. Wrap authenticated pages in this shell via a layout group `app/(app)/layout.tsx`.
