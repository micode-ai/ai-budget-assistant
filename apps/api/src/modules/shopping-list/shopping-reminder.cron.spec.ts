import { Test } from '@nestjs/testing';
import { ShoppingReminderCron } from './shopping-reminder.cron';
import { ShoppingListService } from './shopping-list.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../../database/prisma.service';
import { ShoppingNotificationLedger } from './shopping-notification-ledger.service';

const MEMBER = { userId: 'u1', user: { id: 'u1', notifyShoppingReminders: true, notifyShoppingDeals: true, pushToken: 'tok', isActive: true } };

function build(overrides: {
  restock?: any[];
  deals?: any[];
  withinFloor?: jest.Mock;
  tryRecord?: jest.Mock;
}) {
  const prisma = {
    account: { findMany: jest.fn().mockResolvedValue([{ id: 'a1' }]) },
    accountMember: { findMany: jest.fn().mockResolvedValue([MEMBER]) },
  };
  const svc = {
    getRestockSuggestions: jest.fn().mockResolvedValue(overrides.restock ?? []),
    getDeals: jest.fn().mockResolvedValue(overrides.deals ?? []),
  };
  const notif = { sendToUser: jest.fn().mockResolvedValue(true) };
  const ledger = {
    withinFloor: overrides.withinFloor ?? jest.fn().mockResolvedValue(false),
    tryRecord: overrides.tryRecord ?? jest.fn().mockResolvedValue(true),
    deleteOlderThan: jest.fn().mockResolvedValue(0),
  };
  return { prisma, svc, notif, ledger };
}

async function make(parts: ReturnType<typeof build>) {
  const mod = await Test.createTestingModule({
    providers: [
      ShoppingReminderCron,
      { provide: ShoppingListService, useValue: parts.svc },
      { provide: NotificationsService, useValue: parts.notif },
      { provide: PrismaService, useValue: parts.prisma },
      { provide: ShoppingNotificationLedger, useValue: parts.ledger },
    ],
  }).compile();
  return mod.get(ShoppingReminderCron);
}

describe('ShoppingReminderCron', () => {
  it('sends one shopping_reminder and records the per-cycle dedup key', async () => {
    const parts = build({ restock: [{ canonicalName: 'Bread', lastPurchase: '2026-07-13', dueInDays: -2 }, { canonicalName: 'Eggs', lastPurchase: '2026-07-14', dueInDays: -1 }] });
    const cron = await make(parts);
    await cron.handleShoppingReminders();
    expect(parts.ledger.tryRecord).toHaveBeenCalledWith('a1', 'shopping_reminder', 'restock:Bread:2026-07-13');
    expect(parts.notif.sendToUser).toHaveBeenCalledTimes(1);
    expect(parts.notif.sendToUser.mock.calls[0][4]).toBe('shopping_reminder');
  });

  it('does NOT send when the key was already recorded this cycle (tryRecord=false)', async () => {
    const parts = build({ restock: [{ canonicalName: 'Bread', lastPurchase: '2026-07-13', dueInDays: -2 }], tryRecord: jest.fn().mockResolvedValue(false) });
    const cron = await make(parts);
    await cron.handleShoppingReminders();
    expect(parts.notif.sendToUser).not.toHaveBeenCalled();
  });

  it('does NOT send (and does not record) when within the global floor', async () => {
    const parts = build({ restock: [{ canonicalName: 'Bread', lastPurchase: '2026-07-13', dueInDays: -2 }], withinFloor: jest.fn().mockResolvedValue(true) });
    const cron = await make(parts);
    await cron.handleShoppingReminders();
    expect(parts.ledger.tryRecord).not.toHaveBeenCalled();
    expect(parts.notif.sendToUser).not.toHaveBeenCalled();
  });

  it('sends a shopping_deal keyed by product+merchant+week', async () => {
    const parts = build({ deals: [{ canonicalName: 'Milk', merchant: 'Lidl', dropPct: 20, price: 4, avgPrice: 5, currency: 'PLN' }] });
    const cron = await make(parts);
    await cron.handleShoppingReminders();
    const dealCall = parts.ledger.tryRecord.mock.calls.find((c: unknown[]) => c[1] === 'shopping_deal');
    expect(dealCall[2]).toMatch(/^deal:Milk:Lidl:\d{4}-\d{2}-\d{2}$/);
    expect(parts.notif.sendToUser.mock.calls[0][4]).toBe('shopping_deal');
  });

  it('sends nothing when there are no due products and no deals', async () => {
    const parts = build({});
    const cron = await make(parts);
    await cron.handleShoppingReminders();
    expect(parts.notif.sendToUser).not.toHaveBeenCalled();
    expect(parts.ledger.tryRecord).not.toHaveBeenCalled();
  });

  it('does not pre-filter members by notifyShoppingReminders (deal-only opt-ins are eligible)', async () => {
    const parts = build({ deals: [{ canonicalName: 'Milk', merchant: 'Lidl', dropPct: 20, price: 4, avgPrice: 5, currency: 'PLN' }] });
    const cron = await make(parts);
    await cron.handleShoppingReminders();
    const call = (parts.prisma.accountMember.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.user).not.toHaveProperty('notifyShoppingReminders');
    expect(call.where.user).toEqual(expect.objectContaining({ pushToken: { not: null }, isActive: true }));
  });

  it('cleanupOldLogs delegates to the ledger with a 90-day window', async () => {
    const parts = build({});
    const cron = await make(parts);
    await cron.cleanupOldLogs();
    expect(parts.ledger.deleteOlderThan).toHaveBeenCalledWith(90);
  });
});
