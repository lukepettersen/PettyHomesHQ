-- Owner's phone format (2026-10-14): show every 10-digit US number as 952-250-4114.
-- Only the display text changes; "normalized" (digits, used for matching) is untouched.
UPDATE "Phone"
SET "number" = substr("normalized", 1, 3) || '-' || substr("normalized", 4, 3) || '-' || substr("normalized", 7, 4)
WHERE length("normalized") = 10 AND "normalized" ~ '^[0-9]{10}$';
