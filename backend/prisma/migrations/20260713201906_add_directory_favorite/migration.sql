-- CreateTable
CREATE TABLE "DirectoryFavorite" (
    "ownerId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DirectoryFavorite_pkey" PRIMARY KEY ("ownerId","targetUserId")
);

-- CreateTable
CREATE TABLE "InteractiveGameDesign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "configJson" TEXT NOT NULL DEFAULT '{}',
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InteractiveGameDesign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DirectoryFavorite_ownerId_idx" ON "DirectoryFavorite"("ownerId");

-- CreateIndex
CREATE INDEX "InteractiveGameDesign_createdAt_idx" ON "InteractiveGameDesign"("createdAt");

-- AddForeignKey
ALTER TABLE "DirectoryFavorite" ADD CONSTRAINT "DirectoryFavorite_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectoryFavorite" ADD CONSTRAINT "DirectoryFavorite_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
