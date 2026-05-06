import { Controller, Get, HttpCode, HttpStatus, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../database/prisma.service';

@Controller('health')
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async check() {
    let db: 'ok' | 'fail' = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'fail';
    }

    const body = {
      status: db === 'ok' ? 'ok' : 'degraded',
      db,
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString(),
    };

    if (db === 'fail') {
      throw new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE);
    }

    return body;
  }

  @Get('ai')
  @HttpCode(HttpStatus.OK)
  async checkAi() {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    const timestamp = new Date().toISOString();

    if (!apiKey) {
      throw new HttpException(
        { status: 'fail', openai: 'unconfigured', timestamp },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const openai = new OpenAI({ apiKey, timeout: 8000, maxRetries: 0 });

    try {
      await openai.models.list();
      return { status: 'ok', openai: 'ok', timestamp };
    } catch (err) {
      const e = err as { status?: number; code?: string; message?: string };
      throw new HttpException(
        {
          status: 'fail',
          openai: 'fail',
          providerStatus: e.status ?? null,
          providerCode: e.code ?? null,
          message: (e.message ?? 'unknown').slice(0, 200),
          timestamp,
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
