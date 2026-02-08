import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(accountId: string) {
    // Get system categories and account's custom categories
    return this.prisma.category.findMany({
      where: {
        OR: [
          { isSystem: true },
          { accountId },
        ],
        isDeleted: false,
      },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
  }

  async create(accountId: string, userId: string, dto: any) {
    return this.prisma.category.create({
      data: {
        accountId,
        userId,
        name: dto.name,
        icon: dto.icon,
        color: dto.color,
        type: dto.type,
        parentId: dto.parentId,
      },
    });
  }

  async update(accountId: string, id: string, dto: any) {
    const category = await this.prisma.category.findFirst({
      where: { id, accountId },
    });
    if (!category) throw new Error('Category not found');
    return this.prisma.category.update({
      where: { id },
      data: dto,
    });
  }

  async remove(accountId: string, id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, accountId },
    });
    if (!category) throw new Error('Category not found');
    return this.prisma.category.update({
      where: { id },
      data: { isDeleted: true },
    });
  }
}
