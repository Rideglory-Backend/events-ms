-- Migration: update EventType enum values to match new app design
-- Old values: TOURISM, URBAN, OFF_ROAD, COMPETITION, SOLIDARITY, SHORT_DISTANCE
-- New values: ON_ROAD, OFF_ROAD, COURSE, TRACK_DAY, LEISURE, COMPETITION

-- Step 1: Add new enum values
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'ON_ROAD';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'COURSE';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'TRACK_DAY';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'LEISURE';

-- Step 2: Migrate existing data to new values
UPDATE "Event" SET "eventType" = 'ON_ROAD' WHERE "eventType" = 'TOURISM';
UPDATE "Event" SET "eventType" = 'COURSE'  WHERE "eventType" = 'URBAN';
UPDATE "Event" SET "eventType" = 'LEISURE' WHERE "eventType" IN ('SOLIDARITY', 'SHORT_DISTANCE');

-- Step 3: Remove old enum values (requires recreating the type in Postgres)
-- Postgres does not support DROP VALUE directly; we recreate the type.
ALTER TYPE "EventType" RENAME TO "EventType_old";

CREATE TYPE "EventType" AS ENUM (
  'ON_ROAD',
  'OFF_ROAD',
  'COURSE',
  'TRACK_DAY',
  'LEISURE',
  'COMPETITION'
);

ALTER TABLE "Event"
  ALTER COLUMN "eventType" TYPE "EventType"
  USING "eventType"::text::"EventType";

DROP TYPE "EventType_old";
