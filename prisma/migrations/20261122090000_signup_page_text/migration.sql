-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "signupEmailRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "signupGamesLabel" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "signupGamesOn" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "signupThanks" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "signupTitle" TEXT NOT NULL DEFAULT '';

