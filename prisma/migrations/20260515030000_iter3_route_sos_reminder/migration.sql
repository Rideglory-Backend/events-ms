-- iter-3: add routeGeoJson, sosTriggeredAt, reminderSentAt to Event
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "routeGeoJson" JSONB;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "sosTriggeredAt" TIMESTAMP(3);
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "reminderSentAt" TIMESTAMP(3);
