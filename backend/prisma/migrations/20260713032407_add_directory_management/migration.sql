-- AlterTable
ALTER TABLE "User" ADD COLUMN     "directoryHidden" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "UserOrganization" ADD COLUMN     "directorySort" INTEGER NOT NULL DEFAULT 0;
