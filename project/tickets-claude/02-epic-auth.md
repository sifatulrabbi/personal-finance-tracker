# EPIC: Authentication & User Management (WorkOS)

**Goal**: Users can sign in via Google through WorkOS. Only pre-invited (drafted) users can activate their accounts. Non-invited users are rejected.

**Done when**: A user with a drafted email can sign in with Google, get activated, and access the app. A user without a drafted email sees an error. Unauthenticated users are redirected to the sign-in page.

---

## T-007 — SPIKE: Investigate WorkOS + next-auth integration with App Router

**Parent**: Epic — Authentication
**Type**: Spike
**Size**: S (0.5d)
**Priority**: P0 (blocker)
**Agent-Executable**: Partial
**Blocked By**: T-001
**Blocks**: T-008

**Context**
WorkOS provides a next-auth integration documented at https://workos.com/docs/integrations/next-auth. We need to understand the exact integration pattern with Next.js App Router, how sessions work, how to intercept the login callback to check our user database, and what configuration is required.

**Acceptance Criteria**

- [ ] Written summary (in this ticket or a doc) of: how WorkOS + next-auth works with App Router
- [ ] Identified: where to intercept the auth callback to check drafted user status
- [ ] Identified: what env vars are needed (WorkOS API key, client ID, redirect URI, etc.)
- [ ] Identified: session strategy (JWT vs database sessions) and how to access user info in server components and API routes
- [ ] Risk assessment: any blockers or limitations discovered

**Out of Scope**

- Actual implementation (T-008)
- UI work (T-009)

**Technical Notes**
Reference: https://workos.com/docs/integrations/next-auth. Key questions: Does the WorkOS next-auth provider support App Router's `auth()` helper? Can we use the `signIn` callback to check our DB? How do we get the WorkOS user ID into our session?

**Agent Instructions**
Fetch and read the WorkOS next-auth documentation. Summarize the integration approach. Document the callback hooks available (signIn, jwt, session) and which one to use for our drafted-user check. Write findings to `docs/spike-workos-auth.md`.

---

## T-008 — TASK: Implement WorkOS authentication integration

**Parent**: Epic — Authentication
**Type**: Task
**Size**: L (2-3d)
**Priority**: P0 (blocker)
**Agent-Executable**: Partial
**Blocked By**: T-001, T-004, T-007
**Blocks**: T-009, T-010, T-011

**Context**
This is the core auth implementation. WorkOS handles Google OAuth, and we wrap it with next-auth to get session management. The integration must check our database during the sign-in callback to enforce the invitation-only policy.

**Acceptance Criteria**

- [ ] `next-auth` installed and configured with the WorkOS provider
- [ ] Google OAuth flow works end-to-end: click "Sign in with Google" → Google consent → redirect back → session created
- [ ] During the `signIn` callback: query our `users` table by email
- [ ] If email not found in DB → reject sign-in with error "You must be invited first to sign up to the app"
- [ ] If email found and user is drafted (`is_drafted = 1`) → allow sign-in (activation handled in T-010)
- [ ] If email found and user is active (`is_drafted = 0`) → allow sign-in normally
- [ ] Session includes: our internal user ID, email, name, household_id
- [ ] Environment variables documented in `.env.example`: `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`
- [ ] Auth configuration in `lib/auth.ts` or `app/api/auth/[...nextauth]/route.ts`

**Out of Scope**

- Sign-in page UI (T-009)
- User activation logic (T-010)
- Route protection middleware (T-011)
- Role-based access control

**Technical Notes**
The WorkOS next-auth provider handles the OAuth complexity. Our custom logic lives in the `signIn` and `jwt`/`session` callbacks. The `signIn` callback is where we gate access. The `jwt` callback is where we enrich the token with our user data. The `session` callback is where we expose that data to the client.

**Agent Instructions**
Install `next-auth` and `@workos-inc/nextauth` (or equivalent WorkOS provider package — check the spike findings). Create auth config. In the `signIn` callback, query `users` table by email. In the `jwt` callback, attach internal user_id and household_id. In the `session` callback, expose these fields. Create `.env.example` with all required vars.

---

## T-009 — TASK: Create sign-in page

**Parent**: Epic — Authentication
**Type**: Task
**Size**: S (0.5d)
**Priority**: P1 (high)
**Agent-Executable**: Partial
**Blocked By**: T-002, T-006, T-008
**Blocks**: —

**Context**
The app has a single sign-in page (no sign-up page). It shows a "Sign in with Google" button. Non-invited users who attempt to sign in see an error message.

**Acceptance Criteria**

- [ ] Sign-in page at `/sign-in` (or `/login`)
- [ ] Displays the app name/logo and a "Sign in with Google" button
- [ ] Clicking the button triggers the WorkOS/next-auth Google OAuth flow
- [ ] If sign-in is rejected (non-invited user), an error message is displayed: "You must be invited first to sign up to the app"
- [ ] Dark theme styling consistent with the design system
- [ ] Mobile-friendly layout — centered card, readable on small screens
- [ ] No sign-up link or registration form

**Out of Scope**

- Password-based login
- Sign-up flow
- "Forgot password" flow

**Agent Instructions**
Create `app/sign-in/page.tsx`. Use shadcn Button for the Google sign-in action. Call `signIn("workos", { callbackUrl: "/" })` from next-auth. Handle error query params (next-auth appends `?error=...` on rejection). Style with Tailwind — dark background, centered card, `#0077ff` accent on button.

---

## T-010 — TASK: Implement user lookup and activation on login

**Parent**: Epic — Authentication
**Type**: Task
**Size**: M (1d)
**Priority**: P0 (blocker)
**Agent-Executable**: Yes
**Blocked By**: T-004, T-005, T-008
**Blocks**: T-012, T-013

**Context**
When a drafted user successfully signs in via Google for the first time, their profile must be activated: set `is_drafted = 0`, store their WorkOS user ID and name from the Google profile. This is the "invitation acceptance" mechanism.

**Acceptance Criteria**

- [ ] During the auth callback flow, after Google auth succeeds and email is found in DB:
  - If `is_drafted = 1`: update user — set `is_drafted = 0`, set `workos_user_id` from the provider profile, set `name` from Google profile, set `updated_at`
  - If `is_drafted = 0`: no update needed, proceed normally
- [ ] After activation, subsequent logins work without re-activation
- [ ] The WorkOS user ID is stored for future lookups
- [ ] Edge case: if WorkOS returns a different name than expected, we still use the Google-provided name
- [ ] Unit/integration test: drafted user → login → user becomes active

**Out of Scope**

- User profile editing (future feature)
- Changing household assignment

**Technical Notes**
This logic lives inside the `signIn` or `jwt` callback in the auth configuration. It runs on every sign-in attempt, but the UPDATE only fires when `is_drafted = 1`. Use a single atomic UPDATE with a WHERE clause.

**Agent Instructions**
In the auth config (`lib/auth.ts`), within the `signIn` callback: after confirming the email exists, check `is_drafted`. If drafted, run `UPDATE users SET is_drafted = 0, workos_user_id = ?, name = ?, updated_at = ? WHERE id = ? AND is_drafted = 1`. Write a test in `__tests__/auth-activation.test.ts` that seeds a drafted user, simulates the callback, and asserts the user is now active.

---

## T-011 — CHORE: Add auth middleware for protected routes

**Parent**: Epic — Authentication
**Type**: Chore
**Size**: S (0.5d)
**Priority**: P1 (high)
**Agent-Executable**: Yes
**Blocked By**: T-008
**Blocks**: T-012, T-015, T-016, T-019, T-021

**Context**
All app routes (except the sign-in page) must require authentication. Unauthenticated requests should redirect to the sign-in page (for pages) or return 401 (for API routes).

**Acceptance Criteria**

- [ ] Next.js middleware at `middleware.ts` that checks for a valid session
- [ ] Unauthenticated page requests → redirect to `/sign-in`
- [ ] Unauthenticated API requests (`/api/*`) → return 401 JSON response
- [ ] The sign-in page is accessible without auth
- [ ] Static assets and Next.js internals (`_next/`, `favicon.ico`) are excluded from auth checks
- [ ] Middleware config uses `matcher` to scope appropriately

**Out of Scope**

- Role-based access (all authenticated users have equal access)
- API rate limiting

**Agent Instructions**
Create `middleware.ts` at the project root. Use next-auth's `auth` or `getToken` to check session validity. Configure `matcher` to include `/((?!sign-in|api/auth|_next/static|_next/image|favicon.ico).*)`. For API routes matching `/api/(?!auth)`, return `NextResponse.json({ error: "Unauthorized" }, { status: 401 })` if no session.
