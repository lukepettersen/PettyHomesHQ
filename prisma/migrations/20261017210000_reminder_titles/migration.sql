-- Owner (2026-10-14): reminder names start each word with a capital ("Send Homeiversary Card").
UPDATE "DateReminder" SET "title" = initcap("title");
