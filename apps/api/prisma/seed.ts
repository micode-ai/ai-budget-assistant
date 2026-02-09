import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// ============ TEST CREDENTIALS ============
// User 1: alice@test.com / TestPass123
// User 2: bob@test.com   / TestPass456
// ==========================================

async function main() {
  console.log('Seeding test data...\n');

  // --- Diagnostic: show all existing account memberships ---
  const allMembers = await prisma.accountMember.findMany({
    include: {
      user: { select: { email: true } },
      account: { select: { name: true, id: true } },
    },
  });
  console.log('=== Existing account_members ===');
  for (const m of allMembers) {
    console.log(`  ${m.user.email} -> ${m.account.name} (${m.account.id}) [${m.role}]`);
  }
  console.log(`  Total: ${allMembers.length}\n`);

  // --- Cleanup: remove ALL data for test accounts ---
  console.log('Cleaning up old test data...');
  // Delete stray memberships — any user linked to test accounts
  await prisma.accountMember.deleteMany({
    where: { accountId: { in: ['alice-account', 'bob-account'] } },
  });
  // Delete test expenses, budgets, wallet balances, categories
  await prisma.expense.deleteMany({
    where: { accountId: { in: ['alice-account', 'bob-account'] } },
  });
  await prisma.budget.deleteMany({
    where: { accountId: { in: ['alice-account', 'bob-account'] } },
  });
  await prisma.walletBalance.deleteMany({
    where: { accountId: { in: ['alice-account', 'bob-account'] } },
  });
  await prisma.category.deleteMany({
    where: { accountId: { in: ['alice-account', 'bob-account'] } },
  });
  // Delete test accounts themselves
  await prisma.account.deleteMany({
    where: { id: { in: ['alice-account', 'bob-account'] } },
  });
  // Delete test users
  await prisma.user.deleteMany({
    where: { email: { in: ['alice@test.com', 'bob@test.com'] } },
  });
  console.log('Cleanup done.\n');

  const passwordAlice = await bcrypt.hash('TestPass123', 12);
  const passwordBob = await bcrypt.hash('TestPass456', 12);

  // --- Users (fresh create after cleanup) ---
  const alice = await prisma.user.create({
    data: {
      email: 'alice@test.com',
      passwordHash: passwordAlice,
      name: 'Alice Johnson',
      currencyCode: 'USD',
      timezone: 'America/New_York',
    },
  });

  const bob = await prisma.user.create({
    data: {
      email: 'bob@test.com',
      passwordHash: passwordBob,
      name: 'Bob Smith',
      currencyCode: 'EUR',
      timezone: 'Europe/Berlin',
    },
  });

  console.log(`Created users: ${alice.email}, ${bob.email}`);

  // --- Accounts (fresh create after cleanup) ---
  const aliceAccount = await prisma.account.create({
    data: {
      id: 'alice-account',
      name: 'Alice Personal',
      type: 'personal',
      currencyCode: 'USD',
      ownerId: alice.id,
    },
  });

  const bobAccount = await prisma.account.create({
    data: {
      id: 'bob-account',
      name: 'Bob Personal',
      type: 'personal',
      currencyCode: 'EUR',
      ownerId: bob.id,
    },
  });

  // Set default accounts
  await prisma.user.update({ where: { id: alice.id }, data: { defaultAccountId: aliceAccount.id } });
  await prisma.user.update({ where: { id: bob.id }, data: { defaultAccountId: bobAccount.id } });

  // --- Account Members (only owner for each) ---
  await prisma.accountMember.create({
    data: { accountId: aliceAccount.id, userId: alice.id, role: 'owner' },
  });

  await prisma.accountMember.create({
    data: { accountId: bobAccount.id, userId: bob.id, role: 'owner' },
  });

  // --- System Categories ---
  const categoryNames = [
    'Food & Dining',
    'Transportation',
    'Shopping',
    'Entertainment',
    'Health & Fitness',
    'Bills & Utilities',
    'Education',
    'Travel',
    'Groceries',
    'Coffee & Drinks',
    'Subscriptions',
    'Clothing',
    'Personal Care',
  ];

  const categories: Record<string, string> = {};

  for (const name of categoryNames) {
    const cat = await prisma.category.upsert({
      where: { accountId_name_type: { accountId: aliceAccount.id, name, type: 'expense' } },
      update: {},
      create: {
        accountId: aliceAccount.id,
        userId: alice.id,
        name,
        type: 'expense',
        isSystem: false,
      },
    });
    categories[name] = cat.id;
  }

  // Also for Bob
  const bobCategories: Record<string, string> = {};
  for (const name of categoryNames) {
    const cat = await prisma.category.upsert({
      where: { accountId_name_type: { accountId: bobAccount.id, name, type: 'expense' } },
      update: {},
      create: {
        accountId: bobAccount.id,
        userId: bob.id,
        name,
        type: 'expense',
        isSystem: false,
      },
    });
    bobCategories[name] = cat.id;
  }

  console.log(`Created ${categoryNames.length} categories per account`);

  // --- Helper: generate expenses ---
  function generateExpenses(
    accountId: string,
    userId: string,
    cats: Record<string, string>,
    currency: string,
    months: number,
  ) {
    const expenses: Array<{
      accountId: string;
      userId: string;
      clientId: string;
      categoryId: string;
      amount: number;
      currencyCode: string;
      description: string;
      date: Date;
      source: string;
    }> = [];

    const now = new Date();

    // Spending patterns per category (avg monthly amount, with variance)
    const patterns: Array<{
      category: string;
      monthlyAvg: number;
      variance: number; // +/- percentage
      descriptions: string[];
      countPerMonth: [number, number]; // min-max transactions
    }> = [
      {
        category: 'Food & Dining',
        monthlyAvg: 450,
        variance: 0.2,
        descriptions: ['McDonald\'s', 'Sushi Bar', 'Italian Restaurant', 'Thai Takeout', 'Pizza Hut', 'Burger King', 'Chinese Restaurant'],
        countPerMonth: [8, 14],
      },
      {
        category: 'Groceries',
        monthlyAvg: 380,
        variance: 0.15,
        descriptions: ['Walmart', 'Whole Foods', 'Trader Joe\'s', 'Costco', 'Target Groceries', 'Aldi'],
        countPerMonth: [5, 9],
      },
      {
        category: 'Transportation',
        monthlyAvg: 200,
        variance: 0.25,
        descriptions: ['Uber', 'Gas Station', 'Metro Card', 'Lyft', 'Parking', 'Car Wash'],
        countPerMonth: [6, 12],
      },
      {
        category: 'Coffee & Drinks',
        monthlyAvg: 120,
        variance: 0.3,
        descriptions: ['Starbucks', 'Starbucks', 'Local Coffee Shop', 'Dunkin Donuts', 'Starbucks', 'Tea House'],
        countPerMonth: [8, 16],
      },
      {
        category: 'Shopping',
        monthlyAvg: 250,
        variance: 0.4,
        descriptions: ['Amazon', 'Best Buy', 'IKEA', 'Target', 'Etsy', 'eBay'],
        countPerMonth: [3, 7],
      },
      {
        category: 'Entertainment',
        monthlyAvg: 100,
        variance: 0.35,
        descriptions: ['Netflix', 'Movie Theater', 'Concert Tickets', 'Spotify', 'Steam Games', 'Bowling'],
        countPerMonth: [2, 5],
      },
      {
        category: 'Health & Fitness',
        monthlyAvg: 80,
        variance: 0.2,
        descriptions: ['Gym Membership', 'Pharmacy', 'Vitamins', 'Yoga Class'],
        countPerMonth: [2, 4],
      },
      {
        category: 'Bills & Utilities',
        monthlyAvg: 300,
        variance: 0.1,
        descriptions: ['Electric Bill', 'Water Bill', 'Internet', 'Phone Bill', 'Gas Bill'],
        countPerMonth: [3, 5],
      },
      {
        category: 'Subscriptions',
        monthlyAvg: 60,
        variance: 0.1,
        descriptions: ['Netflix', 'Spotify', 'iCloud', 'YouTube Premium', 'ChatGPT Plus'],
        countPerMonth: [3, 5],
      },
      {
        category: 'Clothing',
        monthlyAvg: 120,
        variance: 0.5,
        descriptions: ['Zara', 'H&M', 'Nike Store', 'Uniqlo', 'Adidas'],
        countPerMonth: [1, 4],
      },
    ];

    let expenseIdx = 0;

    for (let m = months - 1; m >= 0; m--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - m, 1);
      const isCurrentMonth = m === 0;

      for (const pattern of patterns) {
        const catId = cats[pattern.category];
        if (!catId) continue;

        // For current month: spike Food & Dining and Coffee by 50%+ to trigger anomalies
        let multiplier = 1 + (Math.random() * pattern.variance * 2 - pattern.variance);
        if (isCurrentMonth && (pattern.category === 'Food & Dining' || pattern.category === 'Coffee & Drinks')) {
          multiplier = 1.5 + Math.random() * 0.3; // 50-80% above normal
        }

        const monthlyTotal = pattern.monthlyAvg * multiplier;
        const txCount = pattern.countPerMonth[0] + Math.floor(Math.random() * (pattern.countPerMonth[1] - pattern.countPerMonth[0] + 1));

        for (let t = 0; t < txCount; t++) {
          const dayOfMonth = 1 + Math.floor(Math.random() * 27);
          const txDate = new Date(monthDate.getFullYear(), monthDate.getMonth(), dayOfMonth);

          // Don't create future expenses
          if (txDate > now) continue;

          const amount = Math.round((monthlyTotal / txCount) * (0.5 + Math.random()) * 100) / 100;
          const desc = pattern.descriptions[Math.floor(Math.random() * pattern.descriptions.length)];

          expenses.push({
            accountId,
            userId,
            clientId: `seed-${accountId}-${expenseIdx++}`,
            categoryId: catId,
            amount,
            currencyCode: currency,
            description: desc,
            date: txDate,
            source: 'manual',
          });
        }
      }
    }

    return expenses;
  }

  // --- Generate 3 months of expenses for Alice ---
  const aliceExpenses = generateExpenses(aliceAccount.id, alice.id, categories, 'USD', 3);

  // Batch insert
  let created = 0;
  for (const exp of aliceExpenses) {
    await prisma.expense.upsert({
      where: { accountId_clientId: { accountId: exp.accountId, clientId: exp.clientId } },
      update: {},
      create: exp,
    });
    created++;
  }
  console.log(`Created ${created} expenses for Alice (3 months)`);

  // --- Generate 3 months of expenses for Bob ---
  const bobExpenses = generateExpenses(bobAccount.id, bob.id, bobCategories, 'EUR', 3);

  created = 0;
  for (const exp of bobExpenses) {
    await prisma.expense.upsert({
      where: { accountId_clientId: { accountId: exp.accountId, clientId: exp.clientId } },
      update: {},
      create: exp,
    });
    created++;
  }
  console.log(`Created ${created} expenses for Bob (3 months)`);

  // --- Budgets for Alice ---
  await prisma.budget.upsert({
    where: { accountId_clientId: { accountId: aliceAccount.id, clientId: 'seed-budget-alice-overall' } },
    update: {},
    create: {
      accountId: aliceAccount.id,
      userId: alice.id,
      clientId: 'seed-budget-alice-overall',
      name: 'Monthly Overall',
      amount: 2000,
      currencyCode: 'USD',
      period: 'monthly',
      startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      alertThreshold: 80,
    },
  });

  await prisma.budget.upsert({
    where: { accountId_clientId: { accountId: aliceAccount.id, clientId: 'seed-budget-alice-food' } },
    update: {},
    create: {
      accountId: aliceAccount.id,
      userId: alice.id,
      clientId: 'seed-budget-alice-food',
      name: 'Food & Dining',
      amount: 500,
      currencyCode: 'USD',
      period: 'monthly',
      startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      categoryId: categories['Food & Dining'],
      alertThreshold: 80,
    },
  });

  await prisma.budget.upsert({
    where: { accountId_clientId: { accountId: aliceAccount.id, clientId: 'seed-budget-alice-coffee' } },
    update: {},
    create: {
      accountId: aliceAccount.id,
      userId: alice.id,
      clientId: 'seed-budget-alice-coffee',
      name: 'Coffee & Drinks',
      amount: 100,
      currencyCode: 'USD',
      period: 'monthly',
      startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      categoryId: categories['Coffee & Drinks'],
      alertThreshold: 75,
    },
  });

  console.log('Created 3 budgets for Alice');

  // --- Budgets for Bob ---
  await prisma.budget.upsert({
    where: { accountId_clientId: { accountId: bobAccount.id, clientId: 'seed-budget-bob-overall' } },
    update: {},
    create: {
      accountId: bobAccount.id,
      userId: bob.id,
      clientId: 'seed-budget-bob-overall',
      name: 'Monthly Total',
      amount: 1800,
      currencyCode: 'EUR',
      period: 'monthly',
      startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      alertThreshold: 80,
    },
  });

  await prisma.budget.upsert({
    where: { accountId_clientId: { accountId: bobAccount.id, clientId: 'seed-budget-bob-groceries' } },
    update: {},
    create: {
      accountId: bobAccount.id,
      userId: bob.id,
      clientId: 'seed-budget-bob-groceries',
      name: 'Groceries',
      amount: 400,
      currencyCode: 'EUR',
      period: 'monthly',
      startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      categoryId: bobCategories['Groceries'],
      alertThreshold: 80,
    },
  });

  console.log('Created 2 budgets for Bob');

  // --- Wallet Balances ---
  await prisma.walletBalance.upsert({
    where: { accountId_currencyCode: { accountId: aliceAccount.id, currencyCode: 'USD' } },
    update: {},
    create: {
      accountId: aliceAccount.id,
      userId: alice.id,
      clientId: 'seed-wallet-alice-usd',
      currencyCode: 'USD',
      initialAmount: 5000,
    },
  });

  await prisma.walletBalance.upsert({
    where: { accountId_currencyCode: { accountId: bobAccount.id, currencyCode: 'EUR' } },
    update: {},
    create: {
      accountId: bobAccount.id,
      userId: bob.id,
      clientId: 'seed-wallet-bob-eur',
      currencyCode: 'EUR',
      initialAmount: 4500,
    },
  });

  console.log('Created wallet balances');

  // --- Summary ---
  console.log('\n========================================');
  console.log('  TEST ACCOUNTS READY');
  console.log('========================================');
  console.log('');
  console.log('  User 1: alice@test.com / TestPass123');
  console.log(`          Account ID: ${aliceAccount.id}`);
  console.log('          Currency: USD');
  console.log('          3 budgets, ~150+ expenses (3 months)');
  console.log('          Food & Coffee spiked this month (+50-80%)');
  console.log('');
  console.log('  User 2: bob@test.com / TestPass456');
  console.log(`          Account ID: ${bobAccount.id}`);
  console.log('          Currency: EUR');
  console.log('          2 budgets, ~150+ expenses (3 months)');
  console.log('          Food & Coffee spiked this month (+50-80%)');
  console.log('');
  console.log('========================================');
  console.log('');
  console.log('Test these endpoints:');
  console.log('  GET /insights            -> anomalies + predictions');
  console.log('  GET /budgets/:id/progress -> exhaustion date');
  console.log('  GET /ai/suggest-category?description=Starbucks');
  console.log('========================================');

  // --- Final diagnostic: verify no cross-user memberships ---
  const finalMembers = await prisma.accountMember.findMany({
    include: {
      user: { select: { email: true } },
      account: { select: { name: true, id: true } },
    },
  });
  console.log('\n=== Final account_members (all users) ===');
  for (const m of finalMembers) {
    console.log(`  ${m.user.email} -> ${m.account.name} (${m.account.id}) [${m.role}]`);
  }
  console.log(`  Total: ${finalMembers.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
