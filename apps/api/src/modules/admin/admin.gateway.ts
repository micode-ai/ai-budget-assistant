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
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
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

      const adminEmails = (this.configService.get<string>('ADMIN_EMAILS') || '')
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean);

      if (!adminEmails.includes(payload.email)) {
        this.logger.warn(`Unauthorized WebSocket connection attempt from: ${payload.email}`);
        client.disconnect();
        return;
      }

      await client.join(ADMIN_ROOM);
      this.logger.log(`Admin connected: ${payload.email} (${client.id})`);
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
        this.adminService.getAnalyticsOverview(),
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
