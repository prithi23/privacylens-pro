import '../src/config/env.js';
import { trackerProviders } from '@privacylens/shared';
import { datasetMetadata } from '@privacylens/shared/trackers';
import { createDatabase } from '../src/repositories/database.js';
if (!process.env.DATABASE_URL)
  throw new Error('DATABASE_URL is required to seed PostgreSQL');
const db = createDatabase(process.env.DATABASE_URL);
try {
  await db.$transaction(async (tx) => {
    for (const provider of trackerProviders) {
      await tx.trackerProvider.upsert({
        where: { id: provider.id },
        update: {
          name: provider.name,
          category: provider.category,
          description: provider.description,
          referenceMetadata: {
            datasetVersion: datasetMetadata.version,
            license: datasetMetadata.license,
            sources: [...provider.sources],
            purposes: [...provider.purposes],
            reviewedAt: provider.reviewedAt,
            rule: provider.rule,
          },
        },
        create: {
          id: provider.id,
          name: provider.name,
          category: provider.category,
          description: provider.description,
          referenceMetadata: {
            datasetVersion: datasetMetadata.version,
            license: datasetMetadata.license,
            sources: [...provider.sources],
            purposes: [...provider.purposes],
            reviewedAt: provider.reviewedAt,
            rule: provider.rule,
          },
        },
      });
      for (const domain of provider.domains)
        await tx.trackerDomain.upsert({
          where: { domain },
          update: { providerId: provider.id },
          create: { domain, providerId: provider.id },
        });
    }
  });
  console.info(
    `Seeded ${trackerProviders.length} reference providers; no users or scans created.`,
  );
} finally {
  await db.$disconnect();
}
