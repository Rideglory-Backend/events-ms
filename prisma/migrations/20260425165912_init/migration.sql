/*
  Warnings:

  - You are about to drop the column `createdDate` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `updatedDate` on the `Event` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Event" DROP COLUMN "createdDate",
DROP COLUMN "updatedDate";
