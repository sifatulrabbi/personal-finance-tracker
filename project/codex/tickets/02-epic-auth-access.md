# EPIC: Authentication & Household Access

**Goal**: Enforce invite-only access through WorkOS-backed Google sign-in while keeping local household membership authoritative inside the app.

**Done when**: An invited user can sign in, receive a household-scoped session, and enter the app; a non-invited user is rejected with a clear message; protected routes stay inaccessible without a valid session.

---

### [SPIKE] T-009 Confirm the WorkOS invitation-gated auth design for modern Next.js

**Parent**: Epic - Authentication & Household Access
**Type**: Spike
**Size**: S (0.5d)
**Priority**: P0 (blocker)
**Agent-Executable**: Partial
**Blocked By**: T-001
**Blocks**: T-011, T-012, T-013

**Context**
The requirements are clear about desired behavior but not about the exact integration points. We need one authoritative implementation path before we touch auth code.

**Acceptance Criteria**

- [ ] A spike note identifies the recommended WorkOS integration package and callback/session hooks for App Router.
- [ ] The spike explains where to reject non-invited users and where to activate drafted users on first successful login.
- [ ] Required environment variables and session fields are documented.
- [ ] Edge case: the spike records how callback failures surface a user-safe error on the sign-in screen.

**Out of Scope**

- Building the auth flow.
- Styling the sign-in page.

**Technical Notes**
The key decision is where local authorization lives relative to external authentication success.

**Agent Instructions**
Produce a short decision note that names the exact callbacks and session enrichment approach the implementation should follow.

---

### [STORY] T-010 Invited household users can sign in with Google and receive a household-scoped session

**Parent**: Epic - Authentication & Household Access
**Type**: Story
**Size**: L (2-3d)
**Priority**: P0 (blocker)
**Agent-Executable**: Partial
**Blocked By**: T-011, T-012, T-013
**Blocks**: T-014, T-017, T-020, T-026, T-029, T-033

**Context**
Everything else in the product assumes the app knows who the signed-in household user is. This story delivers the trust boundary for the rest of the system.

**Acceptance Criteria**

- [ ] Given a drafted or active invited email, when Google sign-in succeeds, then the user receives a valid session containing the app's internal user ID and household ID.
- [ ] Given an email that does not exist in the app database, when Google sign-in succeeds upstream, then the app rejects access and shows an invite-first error.
- [ ] Given a drafted invited user on first successful login, when the callback completes, then the user record becomes active and stores the WorkOS identity details exactly once.
- [ ] Edge case: previously activated users can sign in repeatedly without their local household membership being duplicated or reassigned.

**Out of Scope**

- Role-based permissions.
- Open sign-up.
- Multi-household switching.

**Technical Notes**
Treat WorkOS as the external identity source and the local database as the source of truth for who is allowed into the household ledger.

**Agent Instructions**
Close this story only after child tasks prove the sign-in flow, rejection path, and session scope all work together.

---

### [TASK] T-011 Implement the WorkOS auth integration and session enrichment

**Parent**: Epic - Authentication & Household Access
**Type**: Task
**Size**: M (1d)
**Priority**: P0 (blocker)
**Agent-Executable**: Yes
**Blocked By**: T-005, T-007, T-009
**Blocks**: T-010, T-012, T-013

**Context**
This task establishes the auth provider wiring and the canonical session contents every protected route will rely on.

**Acceptance Criteria**

- [ ] WorkOS-backed Google sign-in is configured for the chosen Next.js auth path and can complete a local auth handshake.
- [ ] Session or token enrichment includes at least the internal user ID, household ID, email, display name, and WorkOS user ID where available.
- [ ] Environment variables needed for local development are documented in an example env file.
- [ ] Edge case: session creation fails safely when required local user data cannot be resolved.

**Out of Scope**

- Invitation gating details.
- Sign-in page UX.

**Technical Notes**
Keep session payloads minimal but sufficient for household scoping and audit fields.

**Agent Instructions**
Wire the provider, implement the session enrichment hooks, and prove the session shape with a focused auth smoke test.

---

### [TASK] T-012 Implement drafted-user activation and invitation gating on login

**Parent**: Epic - Authentication & Household Access
**Type**: Task
**Size**: S (0.5d)
**Priority**: P0 (blocker)
**Agent-Executable**: Yes
**Blocked By**: T-006, T-011
**Blocks**: T-010, T-017

**Context**
The product is invitation-only, and drafted users only become active after their first successful sign-in. That logic belongs in one explicit task rather than being spread across the UI and callbacks.

**Acceptance Criteria**

- [ ] Given a successful external login, when the email does not exist locally, then the sign-in is rejected with the required invite-first error.
- [ ] Given a drafted local user, when sign-in succeeds, then the app stores the WorkOS user ID and display name and flips the user to active.
- [ ] Given an already active user, when sign-in succeeds again, then the app does not recreate or re-draft the membership record.
- [ ] Edge case: repeated first-login retries remain idempotent and do not duplicate local activation side effects.

**Out of Scope**

- Inviting users from the settings UI.
- Editing profile details after activation.

**Technical Notes**
This ticket is where the app's authorization rules meet the external identity callback.

**Agent Instructions**
Implement the lookup-and-activate flow atomically enough that retries cannot create inconsistent user state.

---

### [TASK] T-013 Create the sign-in page and protected-route behavior

**Parent**: Epic - Authentication & Household Access
**Type**: Task
**Size**: S (0.5d)
**Priority**: P1 (high)
**Agent-Executable**: Partial
**Blocked By**: T-002, T-008, T-011
**Blocks**: T-010, T-014, T-017, T-020, T-026, T-029, T-033

**Context**
Users need a single obvious entry point into the app, and every authenticated area needs a consistent guardrail once auth is in place.

**Acceptance Criteria**

- [ ] A dedicated sign-in page exists with a Google sign-in action and styling that matches the dark-only design system.
- [ ] Auth failures caused by missing invitations are surfaced with a clear user-facing message.
- [ ] Protected pages redirect unauthenticated users to the sign-in page, and protected APIs reject unauthenticated requests predictably.
- [ ] Edge case: auth routes and static assets remain reachable without triggering incorrect redirects.

**Out of Scope**

- Password auth.
- Sign-up or invite redemption pages.

**Technical Notes**
The UX here should stay intentionally simple: one page, one action, one clear failure mode.

**Agent Instructions**
Build the page, wire the sign-in action, and add the route-protection behavior for both page and API traffic.
