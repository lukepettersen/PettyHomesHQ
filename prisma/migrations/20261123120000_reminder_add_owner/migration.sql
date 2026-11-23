-- Event reminders: the owner's cell joins as a group text (owner request 2026-11-23); on for existing reminders too.
ALTER TABLE "EventReminder" ADD COLUMN "addOwner" BOOLEAN NOT NULL DEFAULT true;
