/**
 * One-off script: send weekly email report for all eligible business-tier users.
 * Usage: ts-node -r tsconfig-paths/register scripts/trigger-weekly.ts
 */
import 'reflect-metadata';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { PrismaClient } from '@prisma/client';
import * as nodemailer from 'nodemailer';

async function main() {
  const prisma = new PrismaClient();

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || 'AI Budget <noreply@example.com>';
  const port = Number(process.env.SMTP_PORT || 587);

  if (!host || !user) {
    console.error('❌ SMTP_HOST or SMTP_USER not set in .env');
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  const users = await prisma.user.findMany({
    where: { weeklyEmailEnabled: true, isActive: true },
    include: {
      subscription: true,
      accountMembers: {
        include: {
          account: { select: { id: true, name: true, currencyCode: true, encryptionTier: true } },
        },
      },
    },
  });

  console.log(`Found ${users.length} users with weeklyEmailEnabled`);

  for (const u of users) {
    if (u.subscription?.tier !== 'business') {
      console.log(`  Skip ${u.email} — tier: ${u.subscription?.tier ?? 'none'}`);
      continue;
    }

    for (const membership of u.accountMembers) {
      const account = membership.account;
      if (account.encryptionTier >= 2) {
        console.log(`  Skip account ${account.name} — E2EE tier ${account.encryptionTier}`);
        continue;
      }

      try {
        const now = new Date();
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - 7);

        const [expenseAgg, incomeAgg] = await Promise.all([
          prisma.expense.aggregate({
            where: { accountId: account.id, isDeleted: false, date: { gte: weekStart, lte: now } },
            _sum: { amount: true },
          }),
          prisma.income.aggregate({
            where: { accountId: account.id, isDeleted: false, date: { gte: weekStart, lte: now } },
            _sum: { amount: true },
          }),
        ]);

        const totalExpenses = Number(expenseAgg._sum.amount || 0);
        const totalIncome = Number(incomeAgg._sum.amount || 0);
        const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome) * 100 : 0;

        const categoryBreakdown = await prisma.expense.groupBy({
          by: ['categoryId'],
          where: { accountId: account.id, isDeleted: false, date: { gte: weekStart, lte: now } },
          _sum: { amount: true },
          orderBy: { _sum: { amount: 'desc' } },
          take: 5,
        });

        const categoryIds = categoryBreakdown.map(c => c.categoryId).filter(Boolean) as string[];
        const categoryNames = await prisma.category.findMany({
          where: { id: { in: categoryIds } },
          select: { id: true, name: true },
        });
        const nameMap = new Map(categoryNames.map(c => [c.id, c.name]));

        const topCategories = categoryBreakdown.map(c => ({
          name: nameMap.get(c.categoryId || '') || 'Uncategorized',
          amount: Number(c._sum.amount || 0),
          percentage: totalExpenses > 0 ? (Number(c._sum.amount || 0) / totalExpenses) * 100 : 0,
        }));

        const fmt = (n: number) => n.toFixed(2);
        const periodLabel = `${weekStart.toISOString().split('T')[0]} — ${now.toISOString().split('T')[0]}`;

        const categoryRows = topCategories.map(c =>
          `<tr>
            <td style="padding:8px 12px;color:#333;font-size:14px;border-bottom:1px solid #f0f0f0;">${c.name}</td>
            <td style="padding:8px 12px;color:#333;font-size:14px;text-align:right;border-bottom:1px solid #f0f0f0;">${account.currencyCode} ${fmt(c.amount)}</td>
            <td style="padding:8px 12px;color:#999;font-size:13px;text-align:right;border-bottom:1px solid #f0f0f0;">${c.percentage.toFixed(1)}%</td>
          </tr>`
        ).join('');

        const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;">
        <tr><td style="background:linear-gradient(135deg,#667eea,#764ba2);padding:32px 40px;">
          <h1 style="margin:0;color:#fff;font-size:24px;">Weekly Financial Summary</h1>
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">${account.name} · ${periodLabel}</p>
        </td></tr>
        <tr><td style="padding:32px 40px;">
          <p style="margin:0 0 24px;color:#333;font-size:16px;">Hi ${u.name},</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr>
              <td style="background:#f0fdf4;border-radius:8px;padding:16px;text-align:center;width:32%;">
                <div style="color:#16a34a;font-size:12px;font-weight:600;text-transform:uppercase;">Income</div>
                <div style="color:#15803d;font-size:22px;font-weight:700;margin-top:4px;">${account.currencyCode} ${fmt(totalIncome)}</div>
              </td>
              <td style="width:2%;"></td>
              <td style="background:#fef2f2;border-radius:8px;padding:16px;text-align:center;width:32%;">
                <div style="color:#dc2626;font-size:12px;font-weight:600;text-transform:uppercase;">Expenses</div>
                <div style="color:#b91c1c;font-size:22px;font-weight:700;margin-top:4px;">${account.currencyCode} ${fmt(totalExpenses)}</div>
              </td>
              <td style="width:2%;"></td>
              <td style="background:#eff6ff;border-radius:8px;padding:16px;text-align:center;width:32%;">
                <div style="color:#2563eb;font-size:12px;font-weight:600;text-transform:uppercase;">Savings Rate</div>
                <div style="color:#1d4ed8;font-size:22px;font-weight:700;margin-top:4px;">${Math.round(savingsRate * 10) / 10}%</div>
              </td>
            </tr>
          </table>
          ${topCategories.length > 0 ? `
          <h3 style="margin:0 0 12px;color:#111;font-size:16px;">Top Categories</h3>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f0f0f0;border-radius:8px;overflow:hidden;">
            <tr style="background:#f9fafb;">
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#666;">Category</th>
              <th style="padding:8px 12px;text-align:right;font-size:12px;color:#666;">Amount</th>
              <th style="padding:8px 12px;text-align:right;font-size:12px;color:#666;">Share</th>
            </tr>
            ${categoryRows}
          </table>` : ''}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

        await transporter.sendMail({
          from,
          to: u.email,
          subject: `Weekly Summary: ${account.name}`,
          html,
        });

        console.log(`  ✅ Sent to ${u.email} (account: ${account.name}) | income: ${totalIncome}, expenses: ${totalExpenses}`);
      } catch (err) {
        console.error(`  ❌ Failed for ${u.email} / ${account.name}:`, err);
      }
    }
  }

  await prisma.$disconnect();
  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
