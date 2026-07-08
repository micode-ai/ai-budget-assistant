import { Test } from '@nestjs/testing';
import { ShoppingReminderCron } from './shopping-reminder.cron';
import { ShoppingListService } from './shopping-list.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../../database/prisma.service';

describe('ShoppingReminderCron', () => {
  it('sends one shopping_reminder to each eligible member when there are due products', async () => {
    const prisma = {
      account: { findMany: jest.fn().mockResolvedValue([{ id: 'a1' }]) },
      accountMember: { findMany: jest.fn().mockResolvedValue([{ userId: 'u1', user: { id: 'u1', notifyShoppingReminders: true, pushToken: 'tok', isActive: true } }]) },
    };
    const svc = { getRestockSuggestions: jest.fn().mockResolvedValue([{ canonicalName: 'Milk', dueInDays: -2 }, { canonicalName: 'Eggs', dueInDays: -1 }]) };
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

  it('sends nothing when there are no due products', async () => {
    const prisma = {
      account: { findMany: jest.fn().mockResolvedValue([{ id: 'a1' }]) },
      accountMember: { findMany: jest.fn().mockResolvedValue([{ userId: 'u1', user: { id: 'u1', notifyShoppingReminders: true, pushToken: 'tok', isActive: true } }]) },
    };
    const svc = { getRestockSuggestions: jest.fn().mockResolvedValue([]) };
    const notif = { sendToUser: jest.fn() };
    const mod = await Test.createTestingModule({
      providers: [ShoppingReminderCron, { provide: ShoppingListService, useValue: svc }, { provide: NotificationsService, useValue: notif }, { provide: PrismaService, useValue: prisma }],
    }).compile();
    await mod.get(ShoppingReminderCron).handleShoppingReminders();
    expect(notif.sendToUser).not.toHaveBeenCalled();
  });
});
