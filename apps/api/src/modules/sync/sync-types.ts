import { Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ExpensesService } from '../expenses/expenses.service';
import { IncomesService } from '../incomes/incomes.service';
import { CommunityPriceService } from '../community-prices/community-price.service';

export interface SyncResult {
  entityId: string;
  status: 'success' | 'conflict' | 'error';
  serverVersion?: number;
  serverId?: string;
  serverData?: unknown;
  error?: string;
}

export interface ExpenseRecord {
  clientId: string;
  isDeleted: boolean;
  syncVersion: number;
  updatedAt: Date;
}

export interface BudgetRecord {
  clientId: string;
  isDeleted: boolean;
  syncVersion: number;
  updatedAt: Date;
}

export interface CategoryRecord {
  id: string;
  isDeleted: boolean;
  syncVersion: number;
  updatedAt: Date;
}

/**
 * Shared dependencies every per-entity sync handler needs. Built once by
 * SyncService and threaded through — handlers stay plain functions instead
 * of Nest-injectable classes so they can be unit-tested with a bare object.
 */
export interface SyncHandlerContext {
  prisma: PrismaService;
  expensesService: ExpensesService;
  incomesService: IncomesService;
  communityPrices?: CommunityPriceService;
  logger: Logger;
}
