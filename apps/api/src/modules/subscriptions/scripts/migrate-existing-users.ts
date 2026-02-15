/**
 * Migrate existing users to the subscription system.
 * Creates a free Subscription record for every user that doesn't have one.
 *
 * Usage (from apps/api/):
 *   npx ts-node src/modules/subscriptions/scripts/migrate-existing-users.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrate() {
  const usersWithoutSub = await prisma.user.findMany({
    where: { subscription: { is: null } },
    select: { id: true, email: true },
  });

  console.log(`Found ${usersWithoutSub.length} users without a subscription.\n`);

  if (usersWithoutSub.length === 0) {
    console.log('Nothing to migrate.');
    return;
  }

  const result = await prisma.subscription.createMany({
    data: usersWithoutSub.map((user: { id: string; email: string }) => ({
      userId: user.id,
      tier: 'free' as const,
      status: 'active' as const,
    })),
    skipDuplicates: true,
  });

  console.log(`Created ${result.count} subscription records.`);
  console.log('Migration complete.');
}

migrate()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
