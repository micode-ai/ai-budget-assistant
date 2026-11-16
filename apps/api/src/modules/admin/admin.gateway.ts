import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AdminService } from './admin.service';
import { AdminAnalyticsService } from './admin-analytics.service';
import { PrismaService } from '../../database/prisma.service';
import { parseAdminEmails } from './admin-emails.util';
import { tokenVersionMatches } from '../auth/token-version.util';

const ADMIN_ROOM = 'admin';

@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/admin',
})
export class AdminGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AdminGateway.name);

  constructor(
    private readonly adminService: AdminService,
    private readonly adminAnalyticsService: AdminAnalyticsService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.headers?.authorization as string)?.replace('Bearer ', '');

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      // The user as it is NOW, not as the token remembers it (ABA-809): a deactivated user,
      // a revoked token or an address no longer on the list must not reach the admin room.
      // Compared lower-case, as AdminGuard does.
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { email: true, isActive: true, tokenVersion: true },
      });
      const adminEmails = parseAdminEmails(this.configService.get<string>('ADMIN_EMAILS'));
      if (!user || !user.isActive || !tokenVersionMatches(payload, user) || !adminEmails.includes(user.email.toLowerCase())) {
        this.logger.warn(`Unauthorized WebSocket connection attempt (${client.id})`);
        client.disconnect();
        return;
      }

      await client.join(ADMIN_ROOM);
      this.logger.log(`Admin connected (${client.id})`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('admin:subscribe')
  handleSubscribe(@ConnectedSocket() client: Socket, @MessageBody() _data: unknown) {
    client.join(ADMIN_ROOM);
    return { event: 'admin:subscribed', data: { ok: true } };
  }

  // ─── Periodic stats broadcast ─────────────────────

  @Cron(CronExpression.EVERY_30_SECONDS)
  async broadcastLiveStats() {
    const room = this.server?.in(ADMIN_ROOM);
    if (!room) return;

    try {
      const [health, overview] = await Promise.all([
        this.adminService.getSystemHealth(),
        this.adminAnalyticsService.getAnalyticsOverview(),
      ]);

      room.emit('admin:stats', {
        timestamp: new Date().toISOString(),
        health,
        newUsersToday: overview.newUsersToday,
        activeUsersToday: overview.activeUsersToday,
        mrr: overview.mrr,
      });
    } catch (err) {
      this.logger.error('Failed to broadcast live stats', err);
    }
  }

  // ─── Public emit helpers (called by other services) ──

  emitNewUser(data: { userId: string; name: string; email: string; createdAt: string }) {
    this.server?.to(ADMIN_ROOM).emit('admin:new-user', data);
  }

  emitAiRequest(data: {
    userId: string;
    featureType: string;
    costUnits: number;
    timestamp: string;
  }) {
    this.server?.to(ADMIN_ROOM).emit('admin:ai-request', data);
  }

  emitSubscriptionChange(data: {
    userId: string;
    fromTier: string;
    toTier: string;
    timestamp: string;
  }) {
    this.server?.to(ADMIN_ROOM).emit('admin:subscription-change', data);
  }

  emitError(data: { message: string; stack?: string; timestamp: string }) {
    this.server?.to(ADMIN_ROOM).emit('admin:error', data);
  }
}
