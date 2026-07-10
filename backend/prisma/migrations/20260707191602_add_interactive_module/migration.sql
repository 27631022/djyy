-- CreateTable
CREATE TABLE "InteractiveEvent" (
    "id" TEXT NOT NULL,
    "roomCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "configJson" TEXT NOT NULL DEFAULT '{}',
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "InteractiveEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InteractiveManager" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'collaborator',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InteractiveManager_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InteractivePlayer" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "teamId" TEXT,
    "teamName" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InteractivePlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InteractiveGame" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "gameType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "orderIdx" INTEGER NOT NULL DEFAULT 0,
    "configJson" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InteractiveGame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InteractiveRound" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "resultJson" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "InteractiveRound_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InteractiveEvent_roomCode_key" ON "InteractiveEvent"("roomCode");

-- CreateIndex
CREATE INDEX "InteractiveEvent_createdById_status_idx" ON "InteractiveEvent"("createdById", "status");

-- CreateIndex
CREATE INDEX "InteractiveEvent_status_idx" ON "InteractiveEvent"("status");

-- CreateIndex
CREATE INDEX "InteractiveManager_userId_idx" ON "InteractiveManager"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "InteractiveManager_eventId_userId_key" ON "InteractiveManager"("eventId", "userId");

-- CreateIndex
CREATE INDEX "InteractivePlayer_eventId_idx" ON "InteractivePlayer"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "InteractivePlayer_eventId_deviceId_key" ON "InteractivePlayer"("eventId", "deviceId");

-- CreateIndex
CREATE INDEX "InteractiveGame_eventId_orderIdx_idx" ON "InteractiveGame"("eventId", "orderIdx");

-- CreateIndex
CREATE INDEX "InteractiveRound_gameId_idx" ON "InteractiveRound"("gameId");

-- AddForeignKey
ALTER TABLE "InteractiveManager" ADD CONSTRAINT "InteractiveManager_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "InteractiveEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteractivePlayer" ADD CONSTRAINT "InteractivePlayer_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "InteractiveEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteractiveGame" ADD CONSTRAINT "InteractiveGame_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "InteractiveEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteractiveRound" ADD CONSTRAINT "InteractiveRound_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "InteractiveGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;
