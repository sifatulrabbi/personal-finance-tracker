# Preserve historical revisions while introducing categories

Categories share one table with an income or expense type and stable IDs. Names are stored as entered, without case conversion, trimming, or slug generation. Blank names and names longer than 120 bytes are rejected; exact duplicate names within a type conflict. There is no rename, delete, or nested-category API in this version.

New income and expense revisions store one validated category ID. Old payloads remain byte-for-byte unchanged and resolve missing categories to their type's Others category when read. This preserves the existing audit evidence instead of fabricating historical user edits during migration. Transfers, openings, and adjustments remain uncategorized. Recurring occurrences snapshot the schedule's category so changing a schedule cannot reclassify an already-due bill.

Monthly spending uses only current, non-voided expense revisions and their saved BDT amounts. It never sums wallet entries, because reversals, transfers, and openings are not new spending. Aggregation and rounded percentage calculations use integer arithmetic, including arbitrary-precision totals to avoid overflow across many valid transactions. Independently rounded category percentages may not sum to exactly 100.00%.

The first read of a month initializes its target from the immediately preceding month's saved target, if available. This copy is persisted once and does not follow later edits to the preceding month. No target is distinct from a zero target. Explicit target changes require a version and request key and record the actor in the audit log.
