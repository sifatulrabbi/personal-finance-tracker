# EPIC: Household & Person Management

**Goal**: Household members can be managed through a settings page. Users can invite new members, and a default "Household" person exists for shared expenses.

**Done when**: The settings page shows household members, allows inviting new members (creates drafted users), and the default "Household" person is available for tagging on transactions.

---

## T-012 — STORY: User can view and manage household members in settings

**Parent**: Epic — Household & Person Management
**Type**: Story
**Size**: M (1d)
**Priority**: P1 (high)
**Agent-Executable**: Partial
**Blocked By**: T-006, T-010, T-011
**Blocks**: T-013

**Context**
Since this is a household-focused finance app, there needs to be a settings page where the user can see who is in their household. This is the prerequisite for invitation and person management.

**Acceptance Criteria**

- [ ] Settings page at `/settings` accessible from the app navigation
- [ ] Displays a list of all users in the current user's household
- [ ] Each member shows: name, email, status (active / invited/pending)
- [ ] Active members show their name from Google profile
- [ ] Drafted (pending) members show their email with a "Pending" badge
- [ ] Mobile-friendly list layout

**Out of Scope**

- Removing household members
- Editing member details
- Household name/description editing
- Multi-household switching

**Technical Notes**
Query: `SELECT id, name, email, is_drafted FROM users WHERE household_id = ?`. The current user's `household_id` comes from the session.

**Agent Instructions**
Create `app/(app)/settings/page.tsx`. Create API route `app/api/household/members/route.ts` that returns all users in the authenticated user's household. Use shadcn Card and Badge components. Show a loading skeleton while fetching. Pending members (`is_drafted = 1`) get a yellow/muted badge.

---

## T-013 — STORY: User can invite new members to their household

**Parent**: Epic — Household & Person Management
**Type**: Story
**Size**: M (1d)
**Priority**: P1 (high)
**Agent-Executable**: Partial
**Blocked By**: T-012
**Blocks**: —

**Context**
The invitation mechanism creates a drafted user profile with the invited person's email. When that person later signs in with Google, they'll be matched by email and activated. This is simpler than a full invitation system — no emails sent, no tokens.

**Acceptance Criteria**

- [ ] An "Invite Member" button on the settings page opens a form/dialog
- [ ] Form has a single field: email address
- [ ] Submitting creates a new user record with: email, household_id (same as inviter), is_drafted = 1, name = null
- [ ] If the email already exists in the system (any household), show an error: "This email is already registered"
- [ ] After successful invite, the new member appears in the list with "Pending" status
- [ ] The invited user can now sign in with Google and will be activated (per T-010)

**Out of Scope**

- Sending invitation emails (user tells the invited person verbally)
- Revoking invitations
- Cross-household invitations

**Technical Notes**
API: `POST /api/household/members` with body `{ email }`. Insert: `INSERT INTO users (id, household_id, email, is_drafted, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)`. Check uniqueness first with `SELECT id FROM users WHERE email = ?`.

**Agent Instructions**
Add an invite dialog to the settings page using shadcn Dialog and Input components. Create the POST handler in `app/api/household/members/route.ts`. Validate email format. Check for existing email. Insert drafted user. Return the new member. On the frontend, optimistically add to the list or refetch after success.

---

## T-014 — TASK: Implement person management API and default "Household" person

**Parent**: Epic — Household & Person Management
**Type**: Task
**Size**: S (0.5d)
**Priority**: P1 (high)
**Agent-Executable**: Yes
**Blocked By**: T-004
**Blocks**: T-019, T-020, T-021, T-022

**Context**
Transactions are tagged with a "person" — a household member who initiated the transaction. The default person "Household" represents shared expenses (e.g., food). Persons are managed in settings and selected during transaction creation.

**Acceptance Criteria**

- [ ] API: `GET /api/persons` — returns all persons for the current user's household
- [ ] API: `POST /api/persons` — creates a new person (name required, household_id from session)
- [ ] API: `DELETE /api/persons/:id` — deletes a person (cannot delete the default "Household" person)
- [ ] The default "Household" person (created by seed T-005) has `is_default = 1` and cannot be deleted
- [ ] Attempting to delete the default person returns 400 with a clear error message
- [ ] Person names are unique within a household

**Out of Scope**

- Editing person names (future enhancement)
- Linking persons to authenticated users (they are independent entities)
- Person management UI (handled as part of settings page in a future enhancement, or inline during transaction creation)

**Technical Notes**
Persons are lightweight — just a name and a household_id. They are NOT the same as users. A household member (user) might also be a person, but persons can represent anyone (e.g., a child who doesn't have an app account).

**Agent Instructions**
Create `app/api/persons/route.ts` for GET and POST. Create `app/api/persons/[id]/route.ts` for DELETE. Use the session's `household_id` to scope all queries. For POST, check uniqueness: `SELECT id FROM persons WHERE household_id = ? AND name = ?`. For DELETE, check `is_default` before deleting. Return 400 if attempting to delete the default person.
