import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST');
    const user = this.config.get<string>('SMTP_USER');

    if (host && user) {
      this.transporter = nodemailer.createTransport({
        host,
        port: this.config.get<number>('SMTP_PORT', 587),
        secure: this.config.get<number>('SMTP_PORT', 587) === 465,
        auth: {
          user,
          pass: this.config.get<string>('SMTP_PASS'),
        },
      });
      this.logger.log(`Mail transport configured (${host})`);
    } else {
      this.logger.warn('SMTP not configured — emails will not be sent');
    }
  }

  private get from(): string {
    return this.config.get<string>('SMTP_FROM', 'AI Budget <noreply@example.com>');
  }

  async sendMail(to: string, subject: string, html: string): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn(`Mail skipped (no SMTP): to=${to}, subject=${subject}`);
      return false;
    }

    try {
      await this.transporter.sendMail({ from: this.from, to, subject, html });
      this.logger.log(`Mail sent: to=${to}, subject=${subject}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send mail to ${to}: ${error}`);
      return false;
    }
  }

  async sendInvitationEmail(params: {
    to: string;
    inviterName: string;
    accountName: string;
    inviteCode: string;
    role: string;
    expiresAt: Date;
  }): Promise<boolean> {
    const { to, inviterName, accountName, inviteCode, role, expiresAt } = params;

    const expiresFormatted = expiresAt.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const roleLabel = role === 'editor' ? 'Editor' : 'Viewer';

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background:#4ECDC4;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:600;">
                You're invited!
              </h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;">
              <p style="margin:0 0 16px;color:#333;font-size:16px;line-height:1.5;">
                <strong>${inviterName}</strong> invited you to join the account
                <strong>&ldquo;${accountName}&rdquo;</strong> as <strong>${roleLabel}</strong>.
              </p>

              <p style="margin:0 0 8px;color:#999;font-size:13px;text-align:center;">
                Your invite code:
              </p>
              <div style="background:#f5f5f5;border-radius:8px;padding:16px;text-align:center;margin:0 0 24px;">
                <span style="font-size:32px;font-weight:700;color:#333;letter-spacing:4px;">
                  ${inviteCode}
                </span>
              </div>

              <p style="margin:0 0 24px;color:#666;font-size:14px;line-height:1.5;">
                Open the app &rarr; Accounts &rarr; Join account, and enter this code.
              </p>

              <p style="margin:0;color:#999;font-size:12px;">
                This invitation expires on <strong>${expiresFormatted}</strong>.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #eee;text-align:center;">
              <p style="margin:0;color:#ccc;font-size:12px;">
                AI Budget Assistant
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    return this.sendMail(
      to,
      `${inviterName} invited you to "${accountName}" — AI Budget`,
      html,
    );
  }
}
