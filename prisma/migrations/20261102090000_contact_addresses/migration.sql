-- Several labelled addresses per contact, one marked mailing (owner request 2026-10-27). Additive: Person.address
-- stays (it holds the mailing or only address) and each existing address becomes the contact's first row.
CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "value" TEXT NOT NULL,
    "mailing" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Address_personId_idx" ON "Address"("personId");
ALTER TABLE "Address" ADD CONSTRAINT "Address_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Address" ("id", "personId", "label", "value", "mailing", "position")
SELECT 'addr_' || md5("id"), "id", '', trim("address"), false, 0 FROM "Person" WHERE "address" IS NOT NULL AND trim("address") <> '';
