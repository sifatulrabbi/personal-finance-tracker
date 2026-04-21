# EPIC: Household Directory, Categories & Settings

**Goal**: Give the household maintainer one settings area for managing transaction people, transaction categories, and app-access members without conflating the three concepts.

**Done when**: The settings experience supports maintaining the list of people used on transactions, managing reusable transaction categories, protects the default `Household` person, and allows drafted app-user invites by email.

---

### [STORY] T-014 Maintainers can manage the household people used for transaction attribution

**Parent**: Epic - Household Directory, Categories & Settings
**Type**: Story
**Size**: M (1d)
**Priority**: P1 (high)
**Agent-Executable**: Partial
**Blocked By**: T-010, T-015, T-016
**Blocks**: T-023, T-026, T-029, T-033

**Context**
Transactions need an explicit person for attribution and later filtering. The app therefore needs a maintainable list of household people, including the shared `Household` option.

**Acceptance Criteria**

- [ ] Given an authenticated maintainer, when they open settings, then they can see the current people available for transaction attribution in their household.
- [ ] Given a new person is added, when the user later opens transaction forms, then that person is available for selection.
- [ ] Given the default `Household` person, when a maintainer attempts to remove it, then the app prevents the deletion and explains why.
- [ ] Edge case: duplicate person names inside the same household are rejected cleanly.

**Out of Scope**

- Rich person profiles.
- Person-to-user auto-linking.

**Technical Notes**
Keep the concept separate from app login accounts. That separation is what makes the default shared actor possible.

**Agent Instructions**
Consider this story done only when the API and settings UI both prove the person list is usable by later transaction flows.

---

### [TASK] T-015 Implement the household people API with default `Household` protections

**Parent**: Epic - Household Directory, Categories & Settings
**Type**: Task
**Size**: S (0.5d)
**Priority**: P1 (high)
**Agent-Executable**: Yes
**Blocked By**: T-005, T-006, T-007, T-010
**Blocks**: T-014, T-016, T-024, T-027, T-031, T-035

**Context**
The transaction system depends on a reliable people list. This ticket creates the backend contract that later transaction and settings screens consume.

**Acceptance Criteria**

- [ ] Authenticated users can list all people for their own household through a dedicated API.
- [ ] Maintainers can add a new person by name, and the API prevents household-local duplicates.
- [ ] Deleting a non-default person is supported, but deleting the seeded default `Household` person is rejected.
- [ ] Edge case: person IDs from another household cannot be read or mutated through this API.

**Out of Scope**

- Editing existing names.
- Importing people from user accounts automatically.

**Technical Notes**
Use one canonical domain term in code and API design, even if the UI continues to label the field as `Person`.

**Agent Instructions**
Implement household-scoped GET, POST, and DELETE behavior with the shared validation/error pattern from the foundation work.

---

### [TASK] T-016 Build the settings UI for listing, creating, and deleting household people

**Parent**: Epic - Household Directory, Categories & Settings
**Type**: Task
**Size**: M (1d)
**Priority**: P1 (high)
**Agent-Executable**: Partial
**Blocked By**: T-008, T-015
**Blocks**: T-014

**Context**
The maintainer-facing experience for people management should live in settings, not be hidden inside transaction forms.

**Acceptance Criteria**

- [ ] The settings page includes a clear section for household people and displays the default `Household` person distinctly.
- [ ] A maintainer can add a new person from the settings UI without leaving the page.
- [ ] The UI supports deletion for removable people and shows a protected-state message for the default entry.
- [ ] Edge case: the layout remains usable on mobile without forcing dense table patterns.

**Out of Scope**

- Bulk editing.
- Advanced sorting and search.

**Technical Notes**
This UI should be optimized for low-frequency admin actions, not for power-user data grids.

**Agent Instructions**
Use simple cards or list rows, surface validation inline, and ensure the experience reads clearly on narrow screens.

---

### [STORY] T-017 Maintainers can invite app users into the household by email

**Parent**: Epic - Household Directory, Categories & Settings
**Type**: Story
**Size**: M (1d)
**Priority**: P1 (high)
**Agent-Executable**: Partial
**Blocked By**: T-010, T-018, T-019
**Blocks**: -

**Context**
The app-access invitation flow is intentionally lightweight: no email delivery, no token exchange, just a drafted local membership record that can later be claimed through Google login.

**Acceptance Criteria**

- [ ] Given an authenticated maintainer, when they invite an email address, then a drafted household user record is created for that household.
- [ ] The settings experience shows both active and drafted app members so the maintainer can understand who already has access.
- [ ] When the invited person later signs in with Google using the same email, the login flow can activate that drafted record.
- [ ] Edge case: inviting an email that already exists anywhere in the system is rejected with a clear conflict message.

**Out of Scope**

- Sending invitation emails.
- Revoking invitations.
- Cross-household user sharing.

**Technical Notes**
This story is intentionally separate from the people list so transaction attribution and app access can evolve independently.

**Agent Instructions**
Close this story only when the invitation API, the settings experience, and the auth activation path line up end to end.

---

### [TASK] T-018 Implement the drafted household-user invite API

**Parent**: Epic - Household Directory, Categories & Settings
**Type**: Task
**Size**: S (0.5d)
**Priority**: P1 (high)
**Agent-Executable**: Yes
**Blocked By**: T-005, T-007, T-010
**Blocks**: T-017, T-019

**Context**
The invitation mechanism is simple, but it still needs strong scoping and duplicate protection because it controls who is allowed to attempt sign-in.

**Acceptance Criteria**

- [ ] Authenticated maintainers can create drafted household users by email through a dedicated household-members API.
- [ ] The API can also list active and drafted members for the signed-in household so the settings page has one source of truth.
- [ ] Duplicate email addresses are rejected regardless of whether the existing record is active or drafted.
- [ ] Edge case: a user cannot invite a member into a different household or inspect another household's member list.

**Out of Scope**

- Invitation email sending.
- Member removal flows.

**Technical Notes**
This ticket only creates the local membership record. Auth activation stays in the auth epic.

**Agent Instructions**
Implement household-scoped GET and POST behavior, keep the payload minimal, and return enough status information for the settings UI.

---

### [TASK] T-019 Extend the settings UI with app-member listing and invite flow

**Parent**: Epic - Household Directory, Categories & Settings
**Type**: Task
**Size**: M (1d)
**Priority**: P1 (high)
**Agent-Executable**: Partial
**Blocked By**: T-008, T-018
**Blocks**: T-017

**Context**
The settings page should make app access understandable at a glance, especially because invitations are not delivered by email automatically.

**Acceptance Criteria**

- [ ] The settings screen includes a second section for app members that distinguishes active members from pending invites.
- [ ] A maintainer can open an invite form, submit an email, and see the new drafted member appear without leaving the settings page.
- [ ] Duplicate-invite and invalid-email errors are shown inline with user-safe messaging.
- [ ] Edge case: the people-management, category-management, and app-member sections remain clearly separated on mobile screens.

**Out of Scope**

- Editing member metadata.
- Removing members.

**Technical Notes**
Because this page contains multiple admin workflows, information architecture matters as much as implementation correctness.

**Agent Instructions**
Add the member list and invite UI to the existing settings page in a way that keeps the page understandable on phones first.

---

### [STORY] T-036 Maintainers can manage transaction categories from settings

**Parent**: Epic - Household Directory, Categories & Settings
**Type**: Story
**Size**: M (1d)
**Priority**: P1 (high)
**Agent-Executable**: Partial
**Blocked By**: T-010, T-037, T-038
**Blocks**: -

**Context**
Categories are now part of the core finance model. The household needs a central settings surface to review reusable categories instead of relying only on inline creation during transaction entry.

**Acceptance Criteria**

- [ ] Given an authenticated maintainer, when they open settings, then they can see the transaction categories available for reuse in their household.
- [ ] Given a new category is created from settings, when the user later opens expense or income entry, then that category is available for selection.
- [ ] Given an unused category, when a maintainer removes it, then the category is deleted safely without affecting other households.
- [ ] Edge case: duplicate category names inside the same household are rejected cleanly.

**Out of Scope**

- Nested categories or category trees.
- Budgeting rules tied to categories.

**Technical Notes**
Categories should remain lightweight domain entities: unique household-scoped IDs plus household-local unique names are sufficient for v1.

**Agent Instructions**
Consider this story done only when the category API and settings UI both prove that reusable categories can be managed outside the transaction forms.

---

### [TASK] T-037 Implement the household categories API with household-local uniqueness

**Parent**: Epic - Household Directory, Categories & Settings
**Type**: Task
**Size**: S (0.5d)
**Priority**: P1 (high)
**Agent-Executable**: Yes
**Blocked By**: T-005, T-007, T-010
**Blocks**: T-028, T-032, T-035, T-036, T-038

**Context**
Transaction entry and settings both need a shared source of truth for reusable categories. This ticket creates the household-scoped contract for listing, creating, and safely deleting categories.

**Acceptance Criteria**

- [ ] Authenticated users can list all categories for their own household through a dedicated API.
- [ ] Maintainers can create a new category by name, and the API prevents household-local duplicates.
- [ ] Deleting an unused category is supported, but deleting a category already referenced by transactions is rejected cleanly.
- [ ] Edge case: category IDs from another household cannot be read or mutated through this API.

**Out of Scope**

- Editing category names.
- Hierarchical category structures or aliases.

**Technical Notes**
Keep category names unique per household so inline creation during transaction entry can safely use find-or-create logic.

**Agent Instructions**
Implement household-scoped GET, POST, and DELETE behavior with the shared validation and error helpers from the foundation work.

---

### [TASK] T-038 Extend the settings UI with category management

**Parent**: Epic - Household Directory, Categories & Settings
**Type**: Task
**Size**: M (1d)
**Priority**: P1 (high)
**Agent-Executable**: Partial
**Blocked By**: T-008, T-037
**Blocks**: T-036

**Context**
Settings already carries household administration work. Categories belong there too so the household can curate reusable labels before or after entering transactions.

**Acceptance Criteria**

- [ ] The settings page includes a clear category section alongside the existing household-admin sections.
- [ ] A maintainer can create a category from settings without leaving the page.
- [ ] The UI shows existing categories and supports removal when the API says the category is unused.
- [ ] Edge case: duplicate-name and in-use deletion errors are surfaced inline with user-safe messaging.

**Out of Scope**

- Drag-and-drop reordering.
- Bulk import or export of categories.

**Technical Notes**
This section should stay simple and mobile-friendly, similar in tone to the people-management section rather than a dense admin grid.

**Agent Instructions**
Add the category section to the settings experience in a way that keeps the page understandable on phones first.
