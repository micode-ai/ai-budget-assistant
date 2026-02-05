import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string) {
    // Get system categories and user's custom categories
    return this.prisma.category.findMany({
      where: {
        OR: [
          { isSystem: true },
          { userId },
        ],
        isDeleted: false,
      },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
  }

  async create(userId: string, dto: any) {
    return this.prisma.category.create({
      data: {
        userId,
        name: dto.name,
        icon: dto.icon,
        color: dto.color,
        type: dto.type,
        parentId: dto.parentId,
      },
    });
  }

  async update(userId: string, id: string, dto: any) {
    return this.prisma.category.update({
      where: { id },
      data: dto,
    });
  }

  async remove(userId: string, id: string) {
    return this.prisma.category.update({
      where: { id },
      data: { isDeleted: true },
    });
  }
}
