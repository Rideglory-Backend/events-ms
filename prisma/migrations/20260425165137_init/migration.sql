/*
  Warnings:

  - Added the required column `city` to the `Event` table without a default value. This is not possible if the table is not empty.
  - Added the required column `destination` to the `Event` table without a default value. This is not possible if the table is not empty.
  - Added the required column `difficulty` to the `Event` table without a default value. This is not possible if the table is not empty.
  - Added the required column `eventType` to the `Event` table without a default value. This is not possible if the table is not empty.
  - Added the required column `meetingPoint` to the `Event` table without a default value. This is not possible if the table is not empty.
  - Added the required column `meetingTime` to the `Event` table without a default value. This is not possible if the table is not empty.
  - Added the required column `ownerId` to the `Event` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startDate` to the `Event` table without a default value. This is not possible if the table is not empty.
  - Added the required column `state` to the `Event` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('offRoad', 'onRoad', 'exhibition', 'charitable');

-- CreateEnum
CREATE TYPE "EventDifficulty" AS ENUM ('one', 'two', 'three', 'four', 'five');

-- CreateEnum
CREATE TYPE "EventState" AS ENUM ('scheduled', 'inProgress', 'cancelled', 'finished');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "allowedBrands" TEXT[],
ADD COLUMN     "city" TEXT NOT NULL,
ADD COLUMN     "createdDate" TIMESTAMP(3),
ADD COLUMN     "destination" TEXT NOT NULL,
ADD COLUMN     "difficulty" "EventDifficulty" NOT NULL,
ADD COLUMN     "endDate" TIMESTAMP(3),
ADD COLUMN     "eventType" "EventType" NOT NULL,
ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "meetingPoint" TEXT NOT NULL,
ADD COLUMN     "meetingTime" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "ownerId" TEXT NOT NULL,
ADD COLUMN     "price" DECIMAL(65,30),
ADD COLUMN     "startDate" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "state" "EventState" NOT NULL,
ADD COLUMN     "updatedDate" TIMESTAMP(3);
