# EPIC: Foundation & Platform Backbone

**Goal**: Establish the project skeleton, design system, database foundation, and shared app shell so later feature work lands on stable rails.

**Done when**: A developer can run the app with Bun, apply migrations, seed safe starter data, and navigate a dark-themed mobile-first shell that is ready for household finance features.

---

### [CHORE] T-001 Bootstrap the Next.js app with Bun, Tailwind, and shadcn/ui

**Parent**: Epic - Foundation & Platform Backbone
**Type**: Chore
**Size**: M (1d)
**Priority**: P0 (blocker)
**Agent-Executable**: Yes
**Blocked By**: -
**Blocks**: T-002, T-003, T-004, T-008, T-009
**Status**: Completed (2026-04-03)

**Context**
The repo currently holds requirements and planning artifacts, not a working application. This ticket creates the baseline runtime and UI tooling the rest of the backlog depends on.

**Acceptance Criteria**

- [x] Given a clean checkout, when a developer runs the install and dev commands with Bun, then a Next.js App Router app starts successfully.
- [x] Tailwind CSS and shadcn/ui are installed and wired into the project without leftover starter boilerplate.
- [x] Core scripts for local development, testing, and linting are present and documented in `package.json`.
- [x] Edge case: the generated app structure leaves room for route handlers and server-side utilities without forcing a monorepo or a second service.

**Out of Scope**

- Domain schema design.
- Authentication behavior.
- Business feature pages.

**Technical Notes**
Use a single Next.js application with App Router and Bun-driven scripts. Keep dependencies lean and aligned with the stated stack.

**Agent Instructions**
Initialize the app with App Router, TypeScript, Tailwind, and shadcn/ui. Remove stock demo content, confirm `bun run dev` starts, and keep the project single-app rather than introducing extra packages prematurely.

---

### [CHORE] T-002 Configure the dark-only design system and shared theme tokens

**Parent**: Epic - Foundation & Platform Backbone
**Type**: Chore
**Size**: S (0.5d)
**Priority**: P0 (blocker)
**Agent-Executable**: Yes
**Blocked By**: T-001
**Blocks**: T-008, T-013, T-016, T-019, T-022, T-025, T-028, T-032, T-035
**Status**: Completed (2026-04-03)

**Context**
The requirements are unusually explicit about the product look and feel: dark mode only, `#0077ff` accent, and no gradients. This needs to be centralized early so every later page inherits the same system.

**Acceptance Criteria**

- [x] Given the global styles and theme tokens, when the app loads, then it renders in dark mode by default with no light-mode toggle or fallback.
- [x] Accent, border, surface, text, and focus-ring tokens are derived from `#0077ff` plus dark neutrals and are available to shadcn/ui components.
- [x] No gradients are introduced in the shared CSS or starter layout patterns.
- [x] Edge case: the theme remains readable and touch-friendly on small screens without needing page-specific overrides for basic controls.

**Out of Scope**

- Final page-level polish for feature screens.
- Dashboard/report visualizations.

**Technical Notes**
Favor reusable CSS variables and shadcn-compatible tokens over hard-coded per-component colors.

**Agent Instructions**
Define the dark palette and global CSS variables once, make the root layout consistently dark, and validate the design system with a simple smoke-test surface.

---

### [SPIKE] T-003 Validate Bun SQL Postgres runtime assumptions for local Docker development and Vercel hosting

**Parent**: Epic - Foundation & Platform Backbone
**Type**: Spike
**Size**: S (0.5d)
**Priority**: P0 (blocker)
**Agent-Executable**: Partial
**Blocked By**: T-001
**Blocks**: T-004
**Status**: Completed (2026-04-04)

**Context**
The project is pivoting early from SQLite to PostgreSQL so the database strategy matches Vercel-friendly production hosting. We still want to lean on Bun, but we need a written decision covering local Docker development, Bun SQL usage, and remote Postgres connections in hosted environments.

**Acceptance Criteria**

- [x] A written spike note explains the local Docker Postgres workflow, the Vercel-safe production assumption, and how Bun SQL will be used in the app and scripts.
- [x] The spike explicitly answers how the app, migrations, and tests should connect to Postgres in local development and in hosted environments.
- [x] The spike records PostgreSQL as the current direction and notes that remote Vercel-compatible Postgres connections remove the local-filesystem persistence concern.
- [x] Edge case: the spike calls out how the dev and test databases are separated so migrations and integration tests do not interfere with each other.

**Out of Scope**

- Deploying to Vercel.
- Choosing the final managed Postgres vendor.

**Technical Notes**
This is a risk-reduction ticket, not an implementation ticket. The point is to remove ambiguity before it spreads into the domain layer.
The decision memo is recorded in `project/tickets-codex/07-spike-postgres-runtime.md`.

**Agent Instructions**
Review the relevant Bun, Docker, and hosting constraints and write the decision memo to a short spike doc that later tickets can cite.

---

### [CHORE] T-004 Build the Postgres connection layer, migration runner, and shared domain helpers

**Parent**: Epic - Foundation & Platform Backbone
**Type**: Chore
**Size**: M (1d)
**Priority**: P0 (blocker)
**Agent-Executable**: Yes
**Blocked By**: T-001, T-003
**Blocks**: T-005, T-006, T-007
**Status**: Completed (2026-04-04)

**Context**
Before writing feature APIs, the project needs a deterministic Postgres entry point, migration runner, and helper utilities for IDs, timestamps, and money handling.

**Acceptance Criteria**

- [x] Given a configured Postgres connection string, when the app or scripts initialize the database, then they reuse a consistent Bun SQL connection strategy without reconnecting on every invocation.
- [x] A migration runner can apply ordered SQL files once and record what has already been executed.
- [x] Shared helpers exist for UUID generation, UTC timestamp creation, and money conversion between display values and integer minor units.
- [x] Edge case: rerunning the migration command on an already migrated database does not corrupt state, apply duplicate work, or ignore checksum drift.

**Out of Scope**

- Actual business schema definitions.
- Seed content.

**Technical Notes**
Store money as integer minor units from day one. Keep repository and service factories DI-friendly by accepting `db` in their factory context rather than reaching for env or connection globals directly.

**Agent Instructions**
Create the shared Bun SQL connection module, the migration infrastructure, and the minimal shared helpers needed by later route handlers and scripts.

---

### [CHORE] T-005 Create the household-ledger schema migrations

**Parent**: Epic - Foundation & Platform Backbone
**Type**: Chore
**Size**: M (1d)
**Priority**: P0 (blocker)
**Agent-Executable**: Yes
**Blocked By**: T-004
**Blocks**: T-006, T-011, T-015, T-018, T-021, T-024, T-027, T-030, T-031, T-034, T-037
**Status**: Completed (2026-04-05)

**Context**
The requirements imply a small but important domain model: households, users, people, categories, accounts, origins, and transactions. This should land as isolated migrations rather than being hidden inside feature tickets.

**Acceptance Criteria**

- [x] The schema includes tables for households, users, people, categories, accounts, origins, and transactions, each with household scoping where appropriate.
- [x] Account and transaction money fields are stored in integer minor units and supported by the right indexes and foreign keys.
- [x] Users support invitation/draft state plus `workos_user_id` lookup; transactions support category attribution, `income` / `expense` typing, and transfer grouping.
- [x] Edge case: the schema prevents duplicate origin names and duplicate category names per household and protects required references from becoming orphaned.

**Out of Scope**

- Seed data.
- API endpoints.

**Technical Notes**
Keep migrations fine-grained and reviewable. Prefer explicit names such as `transfer_group_id` over overloaded fields that later confuse history queries.
Application code now owns ID generation through the shared ULID-backed helper in `src/libs/id.ts`, while the database stores those values in `uuid` columns.
Final verification completed on 2026-04-06 with formatting, unit tests, typecheck, lint, production build, Postgres integration tests, and `db:migrate:test`.

**Agent Instructions**
Author numbered SQL migrations, run them on a fresh database, and verify the resulting schema matches the planned domain model.

---

### [CHORE] T-006 Create safe, idempotent seed data for the prod and test households

**Parent**: Epic - Foundation & Platform Backbone
**Type**: Chore
**Size**: S (0.5d)
**Priority**: P1 (high)
**Agent-Executable**: Yes
**Blocked By**: T-005
**Blocks**: T-012, T-015, T-016
**Status**: Completed (2026-04-06)

**Context**
The seed data is unusually sensitive because the prod household seed is meant to stay safe even after the app begins holding real financial data.

**Acceptance Criteria**

- [x] Running the seed script creates the real household, the test household, the two specified seed users, and the default `Household` person only when they do not already exist.
- [x] Re-running the seed script is idempotent and does not overwrite or mutate existing production records.
- [x] The seeded `Household` person is present in each household and can support shared expenses immediately.
- [x] Edge case: partial prior seed state is repaired safely by inserting only the missing records.

**Out of Scope**

- Seeding example accounts or transactions.
- Automatic seeding during app boot.

**Technical Notes**
This ticket should be treated as data safety work, not sample-data work.
Implemented with an explicit `db:seed` / `db:seed:test` Bun script, deterministic seed IDs, drafted seed users, append-only `ON CONFLICT (id) DO NOTHING` inserts that do not overwrite existing seed-ID rows, and a household-name preflight because `households.name` is not unique.
Final verification completed on 2026-04-06 with formatting, unit tests, typecheck, lint, Postgres integration tests, `db:migrate:test`, and two `db:seed:test` runs proving first-run inserts and second-run skips.

**Agent Instructions**
Implement the seed as an explicit Bun script, use existence checks or upsert-safe logic, and verify it remains no-op on subsequent runs.

---

### [CHORE] T-007 Establish request validation, error envelopes, and developer logging conventions

**Parent**: Epic - Foundation & Platform Backbone
**Type**: Chore
**Size**: S (0.5d)
**Priority**: P1 (high)
**Agent-Executable**: Yes
**Blocked By**: T-004
**Blocks**: T-011, T-015, T-018, T-021, T-024, T-027, T-030, T-031, T-034, T-037

**Context**
Most of the remaining work is API-heavy. If each route handler invents its own validation and error shape, the codebase will become inconsistent before the first feature is complete.

**Acceptance Criteria**

- [ ] A standard pattern exists for validating request bodies, parsing IDs and dates, and normalizing money inputs before DB writes.
- [ ] API routes can return a consistent JSON error structure that separates user-safe messaging from developer diagnostics.
- [ ] Basic developer logging hooks exist for high-risk flows such as auth callbacks, seeds, and transfer writes.
- [ ] Edge case: validation failures and domain conflicts produce predictable HTTP responses rather than generic 500s.

**Out of Scope**

- Full observability infrastructure.
- Third-party logging vendors.

**Technical Notes**
Keep this lightweight. The win here is shared discipline, not a large framework.

**Agent Instructions**
Create the minimal helpers and examples needed so later route tickets can follow one obvious pattern.

---

### [TASK] T-008 Create the authenticated app shell and route skeleton

**Parent**: Epic - Foundation & Platform Backbone
**Type**: Task
**Size**: M (1d)
**Priority**: P1 (high)
**Agent-Executable**: Partial
**Blocked By**: T-001, T-002
**Blocks**: T-013, T-016, T-019, T-022, T-025, T-028, T-032, T-035, T-038

**Context**
Even before feature pages are complete, the app needs a stable shell so every flow lands inside a mobile-first navigation pattern instead of one-off page layouts.

**Acceptance Criteria**

- [ ] Signed-in routes live under a shared layout that supports mobile navigation first and a comfortable desktop fallback.
- [ ] The shell exposes clear destinations for dashboard, accounts, transactions, and settings.
- [ ] Page scaffolds exist so feature teams can build into stable route locations rather than inventing paths ad hoc.
- [ ] Edge case: the shell remains usable on narrow screens without relying on hover-only interactions.

**Out of Scope**

- Auth enforcement itself.
- Final page content for each section.

**Technical Notes**
A bottom-tab mobile pattern plus a desktop sidebar is likely the cleanest fit for the stated usage pattern.

**Agent Instructions**
Build the shared layout, navigation primitives, and route group scaffolding, leaving room for the auth gate to wrap these routes later.
