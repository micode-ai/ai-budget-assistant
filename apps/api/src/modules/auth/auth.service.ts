import { Injectable, UnauthorizedException, ConflictException, BadRequestException, HttpException, HttpStatus, Inject, forwardRef } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/users.service';
import { AccountsService } from '../accounts/accounts.service';
import { TelegramService } from '../telegram/telegram.service';
import { AdminGateway } from '../admin/admin.gateway';
import { RegisterDto, LoginDto } from './dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly accountsService: AccountsService,
    private readonly telegramService: TelegramService,
    private readonly mailService: MailService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => AdminGateway))
    private readonly adminGateway: AdminGateway,
  ) {}

  private resetRequestAttempts = new Map<string, number[]>();
  private resetVerifyAttempts = new Map<string, number[]>();

  private checkRateLimit(map: Map<string, number[]>, key: string, maxAttempts: number): void {
    const now = Date.now();
    const windowMs = 15 * 60 * 1000; // 15 minutes
    const attempts = (map.get(key) || []).filter((t) => now - t < windowMs);
    if (attempts.length >= maxAttempts) {
      throw new HttpException('Too many attempts. Please try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }
    attempts.push(now);
    map.set(key, attempts);
  }

  async register(dto: RegisterDto) {
    // Check if user exists
    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(dto.password, 12);

    // Create user
    const user = await this.usersService.create({
      email: dto.email,
      passwordHash,
      name: dto.name,
      currencyCode: dto.currencyCode,
      timezone: dto.timezone,
    });

    // Notify about new registration
    this.telegramService.notifyNewUser(user.name, user.email);
    this.adminGateway.emitNewUser({
      userId: user.id,
      name: user.name,
      email: user.email,
      createdAt: new Date().toISOString(),
    });

    // Create default personal account
    const defaultAccount = await this.accountsService.createDefaultAccount(
      user.id,
      dto.currencyCode || 'USD',
    );

    // Generate tokens
    const tokens = await this.generateTokens(user.id, user.email);

    // Load all accounts
    const accounts = await this.accountsService.findAllForUser(user.id);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        currencyCode: user.currencyCode,
        defaultAccountId: defaultAccount.id,
      },
      accounts,
    };
  }

  async login(dto: LoginDto) {
    // Find user
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if user is active
    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    // Update last active timestamp
    this.usersService.updateLastSync(user.id).catch(() => null);

    // Generate tokens
    const tokens = await this.generateTokens(user.id, user.email);

    // Load all accounts
    const accounts = await this.accountsService.findAllForUser(user.id);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        currencyCode: user.currencyCode,
        defaultAccountId: user.defaultAccountId,
      },
      accounts,
    };
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });

      const user = await this.usersService.findById(payload.sub);
      if (!user || !user.isActive) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Update last active timestamp on token refresh (biometric login)
      this.usersService.updateLastSync(user.id).catch(() => null);

      const tokens = await this.generateTokens(user.id, user.email);

      return {
        accessToken: tokens.accessToken,
      };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async forgotPassword(email: string) {
    // Rate limit before user lookup to prevent enumeration via timing
    this.checkRateLimit(this.resetRequestAttempts, email, 3);

    const user = await this.usersService.findByEmail(email);

    // Always return success to prevent email enumeration
    if (!user || !user.isActive) {
      return { message: 'If this email is registered, a reset code has been sent' };
    }

    // Generate 6-digit code
    const code = randomInt(100000, 999999).toString();
    const codeHash = await bcrypt.hash(code, 12);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    // Save to user record
    await this.usersService.updatePasswordReset(user.id, {
      passwordResetCode: codeHash,
      passwordResetExpiresAt: expiresAt,
    });

    // Send email
    await this.mailService.sendMail(
      email,
      'Your password reset code — AI Budget',
      `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <h2 style="color: #1a1a1a; margin-bottom: 24px;">AI Budget</h2>
          <p style="color: #333; font-size: 16px; margin-bottom: 8px;">Your password reset code:</p>
          <div style="background: #f5f5f5; border-radius: 12px; padding: 24px; text-align: center; margin: 16px 0;">
              <span style="font-family: 'SF Mono', Monaco, 'Courier New', monospace; font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #1a1a1a;">${code}</span>
          </div>
          <p style="color: #666; font-size: 14px;">This code expires in 30 minutes.</p>
          <p style="color: #999; font-size: 12px; margin-top: 32px;">If you didn't request this, you can safely ignore this email.</p>
      </div>
      `,
    );

    return { message: 'If this email is registered, a reset code has been sent' };
  }

  async resetPassword(email: string, code: string, newPassword: string) {
    const user = await this.usersService.findByEmail(email);

    if (!user || !user.isActive || !user.passwordResetCode || !user.passwordResetExpiresAt) {
      throw new BadRequestException('Invalid or expired code');
    }

    // Check expiry
    if (new Date() > user.passwordResetExpiresAt) {
      throw new BadRequestException('Invalid or expired code');
    }

    this.checkRateLimit(this.resetVerifyAttempts, email, 5);

    // Verify code
    const isCodeValid = await bcrypt.compare(code, user.passwordResetCode);
    if (!isCodeValid) {
      throw new BadRequestException('Invalid or expired code');
    }

    // Hash new password and update
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.usersService.updatePasswordReset(user.id, {
      passwordHash,
      passwordResetCode: null,
      passwordResetExpiresAt: null,
    });

    return { message: 'Password reset successfully' };
  }

  private async generateTokens(userId: string, email: string) {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub: userId, email },
        {
          secret: this.configService.get<string>('JWT_SECRET'),
          expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '7d'),
        },
      ),
      this.jwtService.signAsync(
        { sub: userId, email },
        {
          secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
          expiresIn: '30d',
        },
      ),
    ]);

    return { accessToken, refreshToken };
  }
}
