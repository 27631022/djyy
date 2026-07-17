-- CreateTable
CREATE TABLE "AvatarPopCutout" (
    "fileId" TEXT NOT NULL,
    "popFileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvatarPopCutout_pkey" PRIMARY KEY ("fileId")
);
