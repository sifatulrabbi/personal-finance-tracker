# Inherit a monthly target from the latest earlier saved month, on read

This replaces the target-initialization paragraph of ADR 0005. Previously the first read of a month persisted a copy of the immediately preceding month's saved target. A month nobody opened broke the chain (January set, February unread, March showed no target), and peeking at a later month froze it as "no target" even after the months before it were set. A `GET` also wrote to the database.

A month's target is now its own saved target if one exists, otherwise the latest earlier month's saved target, computed on every read and never stored. The response names the source month in `inherited_from`. A month without its own target reports `version` 1, and its first explicit target is saved as version 2, so concurrent first saves still conflict. Editing an earlier month flows into later months that have no target of their own and stops at the first month that does. No target is still distinct from a zero target, and zero is inherited like any other amount.

Migration 008 removes rows the old initialization wrote with no amount and version 1, since nobody set them; those months now inherit. Initialized rows that carry an amount remain as saved snapshots, so upgrading does not change a target a user has already seen.
