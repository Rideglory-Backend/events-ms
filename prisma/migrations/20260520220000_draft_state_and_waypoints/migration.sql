-- AlterEnum: add DRAFT to EventState
ALTER TYPE "EventState" ADD VALUE IF NOT EXISTS 'DRAFT';

-- AlterTable: add ordered waypoints array to Event
ALTER TABLE "Event"
  ADD COLUMN IF NOT EXISTS "waypoints" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
