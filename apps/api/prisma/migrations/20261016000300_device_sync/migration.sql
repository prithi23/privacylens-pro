-- Additive upload provenance and retry deduplication. Existing records are retained.
ALTER TABLE "Scan" ADD COLUMN "deviceId" TEXT, ADD COLUMN "clientUploadId" UUID;
CREATE UNIQUE INDEX "Scan_deviceId_clientUploadId_key" ON "Scan"("deviceId", "clientUploadId");
ALTER TABLE "Scan" ADD CONSTRAINT "Scan_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
