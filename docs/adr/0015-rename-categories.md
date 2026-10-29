# Rename a category in place

This replaces the "no rename" sentence of ADR 0005. A household needs to fix a typo or rename a category once its meaning settles, and recreating it would split one category's history across two IDs.

`PUT /categories/{id}` changes only the name. The ID and type never change, so every record, revision, schedule, and bill that names the category shows the new name, and monthly shares keep their history. Stored revision payloads hold only the ID and stay byte-for-byte unchanged; the audit log keeps the old and new names. This is relabelling, not reclassification: moving a record to a different category is still a correction of that record.

Categories carry a `version`, and a rename must send the version it read, so two people renaming at once cannot silently overwrite each other. Names follow the creation rules: kept exactly as entered, not blank, at most 120 bytes, and unique within the type. The Others defaults can be renamed too; they stay the default because the default is chosen by ID.

The repeatable default-category seed now ignores any conflict, not only a name conflict, so rerunning `seed` after renaming a seeded category neither fails on its ID nor recreates the old name. There is still no category delete.
