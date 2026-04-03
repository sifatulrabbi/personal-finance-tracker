# Dependency Order (Execution DAG)

## Progress Snapshot (as of 2026-04-03)

- Completed: T-001, T-002
- Ready to start next: T-003, T-008, T-009
- Remaining tickets are still blocked by downstream dependencies in this DAG.

## Layer 0 (no blockers - can start immediately)

- T-001 -> Bootstrap the Next.js app with Bun, Tailwind, and shadcn/ui (completed)

## Layer 1 (blocked by Layer 0)

- T-002 -> blocked by T-001 (completed)
- T-003 -> blocked by T-001
- T-009 -> blocked by T-001

## Layer 2 (blocked by Layer 1)

- T-004 -> blocked by T-001, T-003
- T-008 -> blocked by T-001, T-002

## Layer 3 (blocked by Layer 2)

- T-005 -> blocked by T-004

## Layer 4 (blocked by Layer 3)

- T-006 -> blocked by T-005
- T-007 -> blocked by T-004

## Layer 5 (blocked by Layer 4 plus auth spike)

- T-011 -> blocked by T-005, T-007, T-009

## Layer 6 (blocked by Layer 5)

- T-012 -> blocked by T-006, T-011
- T-013 -> blocked by T-002, T-008, T-011

## Layer 7 (first end-to-end access story)

- T-010 -> blocked by T-011, T-012, T-013

## Layer 8 (core household and ledger APIs)

- T-015 -> blocked by T-005, T-006, T-007, T-010
- T-018 -> blocked by T-005, T-007, T-010
- T-021 -> blocked by T-005, T-007, T-010
- T-030 -> blocked by T-005, T-007, T-010
- T-037 -> blocked by T-005, T-007, T-010

## Layer 9 (UI slices and transaction/transfer write APIs)

- T-016 -> blocked by T-008, T-015
- T-019 -> blocked by T-008, T-018
- T-022 -> blocked by T-008, T-021
- T-024 -> blocked by T-005, T-007, T-010, T-015, T-021
- T-027 -> blocked by T-005, T-007, T-010, T-015, T-021
- T-031 -> blocked by T-005, T-007, T-010, T-015, T-021, T-030
- T-038 -> blocked by T-008, T-037

## Layer 10 (story closure and remaining UI work)

- T-014 -> blocked by T-010, T-015, T-016
- T-017 -> blocked by T-010, T-018, T-019
- T-020 -> blocked by T-010, T-021, T-022
- T-025 -> blocked by T-015, T-022, T-024
- T-028 -> blocked by T-008, T-015, T-021, T-027, T-037
- T-032 -> blocked by T-008, T-015, T-021, T-030, T-031, T-037
- T-034 -> blocked by T-005, T-007, T-010, T-021, T-024, T-027, T-031
- T-036 -> blocked by T-010, T-037, T-038

## Layer 11 (higher-value finance stories and final ledger UI)

- T-023 -> blocked by T-014, T-020, T-024, T-025
- T-026 -> blocked by T-014, T-020, T-027, T-028
- T-029 -> blocked by T-014, T-020, T-030, T-031, T-032
- T-035 -> blocked by T-008, T-015, T-021, T-028, T-032, T-034, T-037

## Layer 12 (final history story)

- T-033 -> blocked by T-023, T-026, T-029, T-034, T-035

## Parallelizable Groups

- Group A: T-002, T-003, T-009
- Group B: T-006 and T-007 once T-005 and T-004 are ready
- Group C: T-015, T-018, T-021, T-030, T-037 after T-010 closes
- Group D: T-016, T-019, T-022, T-024, T-027, T-031, T-038
- Group E: T-014, T-017, T-020, T-025, T-028, T-032, T-034, T-036
- Group F: T-023, T-026, T-029, T-035

## Critical Path

A likely critical path for delivering the most complete usable ledger is:

`T-001 -> T-003 -> T-004 -> T-005 -> T-007 -> T-011 -> T-012 -> T-010 -> T-037 -> T-021 -> T-030 -> T-031 -> T-032 -> T-035 -> T-033`

This path is likely to dominate because it carries infrastructure setup, auth, category readiness, account readiness, origin handling, and the final unified transaction-history experience.

A second near-critical branch is:

`T-001 -> T-003 -> T-004 -> T-005 -> T-007 -> T-011 -> T-012 -> T-010 -> T-037 -> T-015 -> T-027 -> T-028 -> T-035 -> T-033`

This means the history experience depends on both the income/origin/category branch and the people/expense/category branch maturing in parallel.

## Summary

- Total tickets: 38
- Epics: 5
- Stories: 9
- Tasks: 22
- Chores: 6
- Spikes: 2
- Earliest meaningful user-facing milestone: T-010 (invited sign-in works)
- First core finance milestone: T-020 + T-026 + T-029
- Final proof-of-model milestone: T-033
