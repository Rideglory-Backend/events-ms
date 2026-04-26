-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('offRoad', 'onRoad', 'exhibition', 'charitable');

-- CreateEnum
CREATE TYPE "EventDifficulty" AS ENUM ('easy', 'moderate', 'medium', 'hard', 'veryHard');

-- CreateEnum
CREATE TYPE "EventState" AS ENUM ('scheduled', 'inProgress', 'cancelled', 'finished');

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "difficulty" "EventDifficulty" NOT NULL,
    "meetingPoint" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "meetingTime" TIMESTAMP(3) NOT NULL,
    "eventType" "EventType" NOT NULL,
    "allowedBrands" TEXT[],
    "price" DOUBLE PRECISION,
    "imageUrl" TEXT,
    "state" "EventState" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);
