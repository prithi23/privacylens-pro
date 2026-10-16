-- Initial PostgreSQL schema. Prisma generates cuid IDs and updatedAt in the client.
CREATE TABLE "User" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "email" VARCHAR(254) NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "Device" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "displayName" VARCHAR(100) NOT NULL,
  "credentialHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3)
);
CREATE TABLE "Scan" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "hostname" VARCHAR(253) NOT NULL,
  "privacyScore" INTEGER NOT NULL,
  "concernLevel" VARCHAR(16) NOT NULL,
  "httpsStatus" VARCHAR(16) NOT NULL,
  "thirdPartyDomainCount" INTEGER NOT NULL,
  "trackerMatchCount" INTEGER NOT NULL,
  "scannedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Scan_score_range" CHECK ("privacyScore" BETWEEN 0 AND 100),
  CONSTRAINT "Scan_nonnegative_counts" CHECK ("thirdPartyDomainCount" BETWEEN 0 AND 10000 AND "trackerMatchCount" BETWEEN 0 AND 10000),
  CONSTRAINT "Scan_concern_values" CHECK ("concernLevel" IN ('low', 'moderate', 'high')),
  CONSTRAINT "Scan_https_values" CHECK ("httpsStatus" IN ('https', 'http', 'unknown'))
);
CREATE TABLE "Finding" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "scanId" TEXT NOT NULL,
  "category" VARCHAR(32) NOT NULL,
  "severity" VARCHAR(16) NOT NULL,
  "description" VARCHAR(500) NOT NULL,
  "evidenceHostname" VARCHAR(253) NOT NULL,
  CONSTRAINT "Finding_category_values" CHECK ("category" IN ('analytics','advertising','social','session-replay','other')),
  CONSTRAINT "Finding_severity_values" CHECK ("severity" IN ('info','low','medium','high'))
);
CREATE TABLE "TrackerProvider" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "category" VARCHAR(32) NOT NULL,
  "description" TEXT NOT NULL,
  CONSTRAINT "TrackerProvider_category_values" CHECK ("category" IN ('analytics','advertising','social','session-replay','other'))
);
CREATE TABLE "TrackerDomain" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "providerId" TEXT NOT NULL,
  "domain" VARCHAR(253) NOT NULL
);
CREATE TABLE "UserPreference" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "syncEnabled" BOOLEAN NOT NULL DEFAULT false,
  "retentionDays" INTEGER NOT NULL DEFAULT 30,
  CONSTRAINT "UserPreference_retention_range" CHECK ("retentionDays" BETWEEN 1 AND 365)
);
CREATE TABLE "Session" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "PairingCode" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Device_credentialHash_key" ON "Device"("credentialHash");
CREATE INDEX "Device_userId_revokedAt_idx" ON "Device"("userId", "revokedAt");
CREATE INDEX "Scan_userId_scannedAt_idx" ON "Scan"("userId", "scannedAt");
CREATE INDEX "Scan_userId_hostname_scannedAt_idx" ON "Scan"("userId", "hostname", "scannedAt");
CREATE INDEX "Finding_scanId_idx" ON "Finding"("scanId");
CREATE UNIQUE INDEX "TrackerProvider_name_key" ON "TrackerProvider"("name");
CREATE UNIQUE INDEX "TrackerDomain_domain_key" ON "TrackerDomain"("domain");
CREATE INDEX "TrackerDomain_providerId_idx" ON "TrackerDomain"("providerId");
CREATE UNIQUE INDEX "UserPreference_userId_key" ON "UserPreference"("userId");
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE UNIQUE INDEX "PairingCode_codeHash_key" ON "PairingCode"("codeHash");
CREATE INDEX "PairingCode_userId_idx" ON "PairingCode"("userId");
CREATE INDEX "PairingCode_expiresAt_idx" ON "PairingCode"("expiresAt");
ALTER TABLE "Device" ADD CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Scan" ADD CONSTRAINT "Scan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrackerDomain" ADD CONSTRAINT "TrackerDomain_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "TrackerProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PairingCode" ADD CONSTRAINT "PairingCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
