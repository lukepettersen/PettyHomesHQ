-- Owner decision 2026-10-16: the Assistant role (Alyssa) sees commissions and BAC.
UPDATE "Role" SET "permissions" = array_append("permissions", 'seeCommissions')
WHERE "name" = 'Assistant' AND NOT ('seeCommissions' = ANY("permissions"));
