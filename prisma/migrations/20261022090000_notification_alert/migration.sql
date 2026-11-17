-- Notifications that pop up with a chime, like a submitted offer (owner request 2026-10-19).
ALTER TABLE "Notification" ADD COLUMN "alert" BOOLEAN NOT NULL DEFAULT false;
