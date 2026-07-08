import { Test } from '@nestjs/testing';
import { ShoppingReminderCron } from './shopping-reminder.cron';
import { ShoppingListService } from './shopping-list.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../../database/prisma.service';

describe('ShoppingReminderCron', () => {
  it('sends one shopping_reminder to each eligible member when there are due products', async () => {
    const prisma = {
      account: { findMany: jest.fn().mockResolvedValue([{ id: 'a1' }]) },
      accountMember: { findMany: jest.fn().mockResolvedValue([{ userId: 'u1', user: { id: 'u1', notifyShoppingReminders: true, notifyShoppingDeals: true, pushToken: 'tok', isActive: true } }]) },
    };
    const svc = {
      getRestockSuggestions: jest.fn().mockResolvedValue([{ canonicalName: 'Milk', dueInDays: -2 }, { canonicalName: 'Eggs', dueInDays: -1 }]),
      getDeals: jest.fn().mockResolvedValue([]),
    };
    const notif = { sendToUser: jest.fn().mockResolvedValue(true) };
    const mod = await Test.createTestingModule({
      providers: [
        ShoppingReminderCron,
        { provide: ShoppingListService, useValue: svc },
        { provide: NotificationsService, useValue: notif },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    await mod.get(ShoppingReminderCron).handleShoppingReminders();
    expect(notif.sendToUser).toHaveBeenCalledTimes(1);
    expect(notif.sendToUser.mock.calls[0][4]).toBe('shopping_reminder'); // notificationType arg
  });

  it('sends nothing when there are no due products and no deals', async () => {
    const prisma = {
      account: { findMany: jest.fn().mockResolvedValue([{ id: 'a1' }]) },
      accountMember: { findMany: jest.fn().mockResolvedValue([{ userId: 'u1', user: { id: 'u1', notifyShoppingReminders: true, notifyShoppingDeals: true, pushToken: 'tok', isActive: true } }]) },
    };
    const svc = {
      getRestockSuggestions: jest.fn().mockResolvedValue([]),
      getDeals: jest.fn().mockResolvedValue([]),
    };
    const notif = { sendToUser: jest.fn() };
    const mod = await Test.createTestingModule({
      providers: [ShoppingReminderCron, { provide: ShoppingListService, useValue: svc }, { provide: NotificationsService, useValue: notif }, { provide: PrismaService, useValue: prisma }],
    }).compile();
    await mod.get(ShoppingReminderCron).handleShoppingReminders();
    expect(notif.sendToUser).not.toHaveBeenCalled();
  });

  it('sends a shopping_deal push when there is a deal, even with no due products', async () => {
    const prisma = {
      account: { findMany: jest.fn().mockResolvedValue([{ id: 'a1' }]) },
      accountMember: { findMany: jest.fn().mockResolvedValue([{ userId: 'u1', user: { id: 'u1', notifyShoppingReminders: true, notifyShoppingDeals: true, pushToken: 'tok', isActive: true } }]) },
    };
    const svc = {
      getRestockSuggestions: jest.fn().mockResolvedValue([]),
      getDeals: jest.fn().mockResolvedValue([{ canonicalName: 'Milk', merchant: 'Lidl', dropPct: 20, price: 4, avgPrice: 5, currency: 'PLN' }]),
    };
    const notif = { sendToUser: jest.fn().mockResolvedValue(true) };
    const mod = await Test.createTestingModule({
      providers: [
        ShoppingReminderCron,
        { provide: ShoppingListService, useValue: svc },
        { provide: NotificationsService, useValue: notif },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    await mod.get(ShoppingReminderCron).handleShoppingReminders();
    expect(notif.sendToUser).toHaveBeenCalledTimes(1);
    expect(notif.sendToUser.mock.calls[0][4]).toBe('shopping_deal'); // notificationType arg
    expect(notif.sendToUser.mock.calls.some((c: unknown[]) => c[4] === 'shopping_reminder')).toBe(false);
  });

  it('does not pre-filter members by notifyShoppingReminders (deal-only opt-ins are eligible)', async () => {
    const prisma = {
      account: { findMany: jest.fn().mockResolvedValue([{ id: 'a1' }]) },
      accountMember: { findMany: jest.fn().mockResolvedValue([{ userId: 'u1', user: { id: 'u1', notifyShoppingReminders: false, notifyShoppingDeals: true, pushToken: 'tok', isActive: true } }]) },
    };
    const svc = {
      getRestockSuggestions: jest.fn().mockResolvedValue([]),
      getDeals: jest.fn().mockResolvedValue([{ canonicalName: 'Milk', merchant: 'Lidl', dropPct: 20, price: 4, avgPrice: 5, currency: 'PLN' }]),
    };
    const notif = { sendToUser: jest.fn().mockResolvedValue(true) };
    const mod = await Test.createTestingModule({
      providers: [
        ShoppingReminderCron,
        { provide: ShoppingListService, useValue: svc },
        { provide: NotificationsService, useValue: notif },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    const cron = mod.get(ShoppingReminderCron);
    await cron.handleShoppingReminders();
    const call = (prisma.accountMember.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.user).not.toHaveProperty('notifyShoppingReminders');
    expect(call.where.user).toEqual(expect.objectContaining({ pushToken: { not: null }, isActive: true }));
  });
});
