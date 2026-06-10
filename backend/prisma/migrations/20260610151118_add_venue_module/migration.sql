-- CreateTable
CREATE TABLE "MeetingRoom" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "photoFileIds" TEXT,
    "facilities" TEXT,
    "orgId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "VenueLayout" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "layoutJson" TEXT NOT NULL,
    "thumbnail" TEXT,
    "width" INTEGER NOT NULL DEFAULT 1200,
    "height" INTEGER NOT NULL DEFAULT 800,
    "gridSize" INTEGER NOT NULL DEFAULT 20,
    "seatCount" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'published',
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VenueLayout_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "MeetingRoom" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SeatingPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "layoutId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "eventDate" DATETIME,
    "rosterJson" TEXT NOT NULL DEFAULT '[]',
    "rulesJson" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "layoutSnapshotJson" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SeatingPlan_layoutId_fkey" FOREIGN KEY ("layoutId") REFERENCES "VenueLayout" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SeatingAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "seatId" TEXT NOT NULL,
    "attendeeId" TEXT,
    "attendeeName" TEXT,
    "unit" TEXT,
    "position" TEXT,
    "score" REAL,
    "source" TEXT NOT NULL DEFAULT 'auto',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SeatingAssignment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SeatingPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MeetingRoom_active_idx" ON "MeetingRoom"("active");

-- CreateIndex
CREATE INDEX "MeetingRoom_orgId_idx" ON "MeetingRoom"("orgId");

-- CreateIndex
CREATE INDEX "VenueLayout_roomId_idx" ON "VenueLayout"("roomId");

-- CreateIndex
CREATE INDEX "VenueLayout_active_idx" ON "VenueLayout"("active");

-- CreateIndex
CREATE INDEX "SeatingPlan_layoutId_idx" ON "SeatingPlan"("layoutId");

-- CreateIndex
CREATE INDEX "SeatingPlan_status_idx" ON "SeatingPlan"("status");

-- CreateIndex
CREATE INDEX "SeatingAssignment_planId_idx" ON "SeatingAssignment"("planId");

-- CreateIndex
CREATE INDEX "SeatingAssignment_unit_idx" ON "SeatingAssignment"("unit");

-- CreateIndex
CREATE INDEX "SeatingAssignment_position_idx" ON "SeatingAssignment"("position");

-- CreateIndex
CREATE INDEX "SeatingAssignment_attendeeId_idx" ON "SeatingAssignment"("attendeeId");

-- CreateIndex
CREATE UNIQUE INDEX "SeatingAssignment_planId_seatId_key" ON "SeatingAssignment"("planId", "seatId");
