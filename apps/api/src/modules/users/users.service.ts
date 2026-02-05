import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

interface CreateUserData {
  email: string;
  passwordHash: string;
  name: string;
  currencyCode?: string;
  timezone?: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateUserData) {
    return this.prisma.user.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        name: data.name,
        currencyCode: data.currencyCode || 'USD',
        timezone: data.timezone || 'UTC',
      },
    });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async update(id: string, data: Partial<CreateUserData>) {
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  async updateLastSync(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { lastSyncAt: new Date() },
    });
  }

  async updatePushToken(id: string, pushToken: string) {
    return this.prisma.user.update({
      where: { id },
      data: { pushToken },
    });
  }

  async deactivate(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
