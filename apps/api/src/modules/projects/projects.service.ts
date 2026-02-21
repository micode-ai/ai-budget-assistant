import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateProjectDto, UpdateProjectDto } from './dto';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(accountId: string, includeArchived?: boolean) {
    const whereClause: any = {
      accountId,
      isDeleted: false,
    };

    if (includeArchived === false) {
      whereClause.isArchived = false;
    }

    return this.prisma.project.findMany({
      where: whereClause,
      include: {
        _count: {
          select: {
            projectExpenses: true,
            projectIncomes: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(accountId: string, id: string) {
    const project = await this.prisma.project.findFirst({
      where: {
        id,
        accountId,
        isDeleted: false,
      },
      include: {
        projectExpenses: {
          where: {
            isDeleted: false,
          },
          include: {
            expense: true,
          },
        },
        projectIncomes: {
          where: {
            isDeleted: false,
          },
          include: {
            income: true,
          },
        },
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }

  async create(accountId: string, userId: string, dto: CreateProjectDto) {
    const data: any = {
      accountId,
      name: dto.name,
      description: dto.description,
      color: dto.color,
      icon: dto.icon,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      budget: dto.budget,
      currencyCode: dto.currencyCode,
    };

    return this.prisma.project.upsert({
      where: {
        accountId_clientId: {
          accountId,
          clientId: dto.localId,
        },
      },
      create: {
        ...data,
        clientId: dto.localId,
      },
      update: data,
    });
  }

  async update(accountId: string, id: string, dto: UpdateProjectDto) {
    const project = await this.prisma.project.findFirst({
      where: {
        id,
        accountId,
        isDeleted: false,
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const data: any = {};

    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.color !== undefined) data.color = dto.color;
    if (dto.icon !== undefined) data.icon = dto.icon;
    if (dto.startDate !== undefined)
      data.startDate = new Date(dto.startDate);
    if (dto.endDate !== undefined) data.endDate = new Date(dto.endDate);
    if (dto.budget !== undefined) data.budget = dto.budget;
    if (dto.currencyCode !== undefined) data.currencyCode = dto.currencyCode;
    if (dto.isArchived !== undefined) data.isArchived = dto.isArchived;

    return this.prisma.project.update({
      where: { id },
      data,
    });
  }

  async remove(accountId: string, id: string) {
    const project = await this.prisma.project.findFirst({
      where: {
        id,
        accountId,
        isDeleted: false,
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return this.prisma.project.update({
      where: { id },
      data: { isDeleted: true },
    });
  }

  async addExpense(accountId: string, projectId: string, expenseId: string) {
    // Verify project belongs to account
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        accountId,
        isDeleted: false,
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Verify expense belongs to account
    const expense = await this.prisma.expense.findFirst({
      where: {
        id: expenseId,
        accountId,
        isDeleted: false,
      },
    });

    if (!expense) {
      throw new NotFoundException('Expense not found');
    }

    return this.prisma.projectExpense.upsert({
      where: {
        projectId_expenseId: {
          projectId,
          expenseId,
        },
      },
      create: {
        projectId,
        expenseId,
      },
      update: {
        isDeleted: false,
      },
    });
  }

  async removeExpense(
    accountId: string,
    projectId: string,
    expenseId: string,
  ) {
    // Verify project belongs to account
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        accountId,
        isDeleted: false,
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const projectExpense = await this.prisma.projectExpense.findUnique({
      where: {
        projectId_expenseId: {
          projectId,
          expenseId,
        },
      },
    });

    if (!projectExpense) {
      throw new NotFoundException('Project expense association not found');
    }

    return this.prisma.projectExpense.update({
      where: {
        projectId_expenseId: {
          projectId,
          expenseId,
        },
      },
      data: { isDeleted: true },
    });
  }

  async addIncome(accountId: string, projectId: string, incomeId: string) {
    // Verify project belongs to account
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        accountId,
        isDeleted: false,
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Verify income belongs to account
    const income = await this.prisma.income.findFirst({
      where: {
        id: incomeId,
        accountId,
        isDeleted: false,
      },
    });

    if (!income) {
      throw new NotFoundException('Income not found');
    }

    return this.prisma.projectIncome.upsert({
      where: {
        projectId_incomeId: {
          projectId,
          incomeId,
        },
      },
      create: {
        projectId,
        incomeId,
      },
      update: {
        isDeleted: false,
      },
    });
  }

  async removeIncome(accountId: string, projectId: string, incomeId: string) {
    // Verify project belongs to account
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        accountId,
        isDeleted: false,
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const projectIncome = await this.prisma.projectIncome.findUnique({
      where: {
        projectId_incomeId: {
          projectId,
          incomeId,
        },
      },
    });

    if (!projectIncome) {
      throw new NotFoundException('Project income association not found');
    }

    return this.prisma.projectIncome.update({
      where: {
        projectId_incomeId: {
          projectId,
          incomeId,
        },
      },
      data: { isDeleted: true },
    });
  }

  async getAnalytics(accountId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        accountId,
        isDeleted: false,
      },
      include: {
        projectExpenses: {
          where: {
            isDeleted: false,
          },
          include: {
            expense: {
              include: {
                category: true,
              },
            },
          },
        },
        projectIncomes: {
          where: {
            isDeleted: false,
          },
          include: {
            income: true,
          },
        },
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Calculate totals
    type ProjectExpenseItem = typeof project.projectExpenses[number];
    type ProjectIncomeItem = typeof project.projectIncomes[number];

    const totalExpenses = project.projectExpenses.reduce(
      (sum: number, pe: ProjectExpenseItem) => sum + Number(pe.expense.amount),
      0,
    );

    const totalIncome = project.projectIncomes.reduce(
      (sum: number, pi: ProjectIncomeItem) => sum + Number(pi.income.amount),
      0,
    );

    const netAmount = totalIncome - totalExpenses;
    const expenseCount = project.projectExpenses.length;
    const incomeCount = project.projectIncomes.length;

    // Calculate budget remaining if budget exists
    let budgetRemaining: number | null = null;
    if (project.budget !== null) {
      budgetRemaining = Number(project.budget) - totalExpenses;
    }

    // Group expenses by category
    const expensesByCategory: Record<
      string,
      { categoryName: string; amount: number; count: number }
    > = {};

    project.projectExpenses.forEach((pe: ProjectExpenseItem) => {
      const categoryId = pe.expense.categoryId || 'uncategorized';
      const categoryName = pe.expense.category?.name || 'Uncategorized';

      if (!expensesByCategory[categoryId]) {
        expensesByCategory[categoryId] = {
          categoryName,
          amount: 0,
          count: 0,
        };
      }

      expensesByCategory[categoryId].amount += Number(pe.expense.amount);
      expensesByCategory[categoryId].count += 1;
    });

    // Create timeline (group by date)
    const timelineMap: Record<
      string,
      { date: string; expenses: number; income: number }
    > = {};

    project.projectExpenses.forEach((pe: ProjectExpenseItem) => {
      const dateKey = pe.expense.date.toISOString().split('T')[0];
      if (!timelineMap[dateKey]) {
        timelineMap[dateKey] = { date: dateKey, expenses: 0, income: 0 };
      }
      timelineMap[dateKey].expenses += Number(pe.expense.amount);
    });

    project.projectIncomes.forEach((pi: ProjectIncomeItem) => {
      const dateKey = pi.income.date.toISOString().split('T')[0];
      if (!timelineMap[dateKey]) {
        timelineMap[dateKey] = { date: dateKey, expenses: 0, income: 0 };
      }
      timelineMap[dateKey].income += Number(pi.income.amount);
    });

    const timeline = Object.values(timelineMap).sort((a, b) =>
      a.date.localeCompare(b.date),
    );

    return {
      totalExpenses,
      totalIncome,
      netAmount,
      expenseCount,
      incomeCount,
      budgetRemaining,
      expensesByCategory: Object.entries(expensesByCategory).map(
        ([categoryId, data]) => ({
          categoryId,
          categoryName: data.categoryName,
          amount: data.amount,
          count: data.count,
        }),
      ),
      timeline,
    };
  }
}
