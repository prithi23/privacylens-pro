-- Nullable only: historical records keep their exact scores and unknown methodology.
ALTER TABLE "Scan" ADD COLUMN "analysis" JSONB;
ALTER TABLE "TrackerProvider" ADD COLUMN "referenceMetadata" JSONB;
