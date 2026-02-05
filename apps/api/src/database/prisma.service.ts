import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async cleanDatabase() {
    if (process.env.NODE_ENV !== 'production') {
      // Order matters due to foreign key constraints
      await this.$transaction([
        this.chatMessage.deleteMany(),
        this.chatConversation.deleteMany(),
        this.budgetAlert.deleteMany(),
        this.expense.deleteMany(),
        this.budget.deleteMany(),
        this.category.deleteMany(),
        this.syncLog.deleteMany(),
        this.user.deleteMany(),
      ]);
    }
  }
}
