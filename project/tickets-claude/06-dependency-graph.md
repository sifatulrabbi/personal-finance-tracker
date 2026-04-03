# Dependency Order (Execution DAG)

## Layer 0 — No blockers, start immediately

| Ticket | Title | Size |
| ------ | ----- | ---- |
| T-001  | CHORE: Initialize Next.js project with Bun and core dependencies | M |
| T-007  | SPIKE: Investigate WorkOS + next-auth integration | S |

---

## Layer 1 — Blocked by Layer 0

| Ticket | Title | Blocked By | Size |
| ------ | ----- | ---------- | ---- |
| T-002  | CHORE: Configure dark theme and design system | T-001 | S |
| T-003  | CHORE: Set up SQLite database with Bun's built-in client | T-001 | M |
| T-006  | TASK: Create app shell with mobile-first responsive layout | T-001, T-002 | M |

> Note: T-006 depends on both T-001 and T-002. T-002 can start as soon as T-001 is done, and T-006 starts once both T-001 and T-002 are done.

---

## Layer 2 — Blocked by Layer 1

| Ticket | Title | Blocked By | Size |
| ------ | ----- | ---------- | ---- |
| T-004  | CHORE: Create database schema migrations | T-003 | M |

---

## Layer 3 — Blocked by Layer 2

| Ticket | Title | Blocked By | Size |
| ------ | ----- | ---------- | ---- |
| T-005  | CHORE: Create database seed with safety checks | T-004 | S |
| T-008  | TASK: Implement WorkOS authentication integration | T-001, T-004, T-007 | L |
| T-014  | TASK: Implement person management API and default "Household" person | T-004 | S |

> Note: T-008 waits for both the schema (T-004) and the spike (T-007).

---

## Layer 4 — Blocked by Layer 3

| Ticket | Title | Blocked By | Size |
| ------ | ----- | ---------- | ---- |
| T-010  | TASK: Implement user lookup and activation on login | T-004, T-005, T-008 | M |
| T-011  | CHORE: Add auth middleware for protected routes | T-008 | S |
| T-009  | TASK: Create sign-in page | T-002, T-006, T-008 | S |

---

## Layer 5 — Blocked by Layer 4

| Ticket | Title | Blocked By | Size |
| ------ | ----- | ---------- | ---- |
| T-012  | STORY: User can view and manage household members in settings | T-006, T-010, T-011 | M |
| T-015  | TASK: Implement account CRUD API | T-004, T-011 | M |
| T-023  | TASK: Implement origin management API | T-004, T-011 | S |

---

## Layer 6 — Blocked by Layer 5

| Ticket | Title | Blocked By | Size |
| ------ | ----- | ---------- | ---- |
| T-013  | STORY: User can invite new members to their household | T-012 | M |
| T-016  | TASK: Create accounts page UI | T-002, T-006, T-015 | M |
| T-019  | TASK: Implement expense transaction API | T-004, T-011, T-014, T-015 | M |
| T-021  | TASK: Implement income transaction API with origin support | T-004, T-011, T-014, T-015, T-023 | M |

---

## Layer 7 — Blocked by Layer 6

| Ticket | Title | Blocked By | Size |
| ------ | ----- | ---------- | ---- |
| T-017  | TASK: Implement account transfer logic | T-015, T-004 | M |
| T-020  | TASK: Create expense transaction UI | T-002, T-006, T-014, T-019 | M |
| T-022  | TASK: Create income transaction UI with origin selection | T-002, T-006, T-014, T-021, T-023 | M |
| T-024  | TASK: Implement transaction list API with person filter | T-004, T-019, T-021 | M |

---

## Layer 8 — Blocked by Layer 7

| Ticket | Title | Blocked By | Size |
| ------ | ----- | ---------- | ---- |
| T-018  | TASK: Create transfer UI | T-016, T-017 | S |
| T-025  | TASK: Create transaction history UI with person filter | T-002, T-006, T-020, T-022, T-024 | M |

---

## Parallelizable Groups

These tickets within each layer can be worked on simultaneously:

| Layer | Parallelizable Tickets |
| ----- | ---------------------- |
| 0     | T-001, T-007 |
| 1     | T-002, T-003 (T-006 waits for T-002) |
| 3     | T-005, T-008, T-014 (T-023 waits for T-011 in L4) |
| 4     | T-009, T-010, T-011 |
| 5     | T-012, T-015, T-023 |
| 6     | T-013, T-016, T-019, T-021 |
| 7     | T-017, T-020, T-022, T-024 |
| 8     | T-018, T-025 |

---

## Critical Path

The longest chain of sequential dependencies that determines the minimum time to completion:

```
T-001 (M, 1d) → T-003 (M, 1d) → T-004 (M, 1d) → T-008 (L, 2-3d) → T-011 (S, 0.5d)
  → T-015 (M, 1d) → T-019 (M, 1d) → T-024 (M, 1d) → T-025 (M, 1d)
```

**Critical path duration: ~10-11 working days**

Secondary critical path (auth UI):
```
T-001 → T-002 (S) → T-006 (M) → T-009 (S)
```

---

## Summary

| Metric | Value |
| ------ | ----- |
| Total tickets | 25 |
| Epics | 5 |
| Spikes | 1 |
| Chores | 7 |
| Tasks | 13 |
| Stories | 4 |
| Critical path | ~10-11 days |
| Max parallelism | 4 tickets (Layer 6, 7) |
| Agent-executable (Yes) | 14 tickets |
| Agent-executable (Partial) | 10 tickets |
| Agent-executable (No) | 1 ticket (none — all are at least Partial) |
