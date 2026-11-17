-- AlterTable: industry partners have a type and company
ALTER TABLE "Person" ADD COLUMN "company" TEXT, ADD COLUMN "partnerType" TEXT;

-- CreateTable: partner contacts picked on a purchase agreement
CREATE TABLE "PaPartner" (
    "paId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    CONSTRAINT "PaPartner_pkey" PRIMARY KEY ("paId","sectionId")
);
CREATE INDEX "PaPartner_personId_idx" ON "PaPartner"("personId");
ALTER TABLE "PaPartner" ADD CONSTRAINT "PaPartner_paId_fkey" FOREIGN KEY ("paId") REFERENCES "PurchaseAgreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaPartner" ADD CONSTRAINT "PaPartner_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- People sidebar: Realtors, Lenders and Title lists in the Partners collection (a new database gets them from the seed)
INSERT INTO "SmartList" ("id", "collectionId", "name", "position", "filters")
SELECT v.id, c."id", v.name, v.pos, v.filters::jsonb
FROM (SELECT "id" FROM "Collection" WHERE "name" = 'Partners' ORDER BY "position" LIMIT 1) c,
     (VALUES ('sl_realtors', 'Realtors', 10, '[{"field":"type","op":"is","value":"Realtor"}]'),
             ('sl_lenders', 'Lenders', 11, '[{"field":"type","op":"is","value":"Lender"}]'),
             ('sl_title', 'Title', 12, '[{"field":"type","op":"is","value":"Title"}]')) AS v(id, name, pos, filters)
WHERE NOT EXISTS (SELECT 1 FROM "SmartList" s WHERE s."collectionId" = c."id" AND s."name" = v.name);
