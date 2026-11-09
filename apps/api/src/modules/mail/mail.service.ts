import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { APP_CONNECTED_LANGS, appConnectedCopy } from './app-connected-email-i18n';
import { onboardingEmailCopy } from './onboarding-email-i18n';

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

  /**
   * @param unsubscribeUrl adds `List-Unsubscribe` + `List-Unsubscribe-Post` (RFC 8058), so mail
   *   clients show their own one-click unsubscribe. Only for optional mail (ABA-738), never for
   *   account or security mail.
   */
  async sendMail(to: string, subject: string, html: string, unsubscribeUrl?: string): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn(`Mail skipped (no SMTP): to=${to}, subject=${subject}`);
      return false;
    }

    try {
      const headers = unsubscribeUrl
        ? { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
        : undefined;
      await this.transporter.sendMail({ from: this.from, to, subject, html, ...(headers ? { headers } : {}) });
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
<body style="margin:0;padding:0;background:#F8FAFB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFB;padding:40px 20px;">
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

  async sendVerificationEmail(to: string, code: string): Promise<boolean> {
    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F8FAFB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFB;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          <!-- Header -->
          <tr>
            <td style="background:#E37F2B;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">
                Verify Your Email
              </h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 24px;color:#1A1D26;font-size:16px;line-height:1.6;text-align:center;">
                Thank you for joining <strong>AI Budget</strong>! <br/>
                Please use the code below to verify your email address.
              </p>

              <div style="background:#FDF0E4;border: 2px dashed #E37F2B;border-radius:12px;padding:24px;text-align:center;margin:0 0 32px;">
                <span style="font-size:42px;font-weight:800;color:#E37F2B;letter-spacing:10px;font-family: 'Courier New', Courier, monospace;">
                  ${code}
                </span>
              </div>

              <p style="margin:0 0 8px;color:#5E6272;font-size:14px;line-height:1.5;text-align:center;">
                This code will expire in <strong>24 hours</strong>.
              </p>
              <p style="margin:0;color:#9CA3B4;font-size:13px;line-height:1.5;text-align:center;">
                If you didn't create an account, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;background:#F8FAFB;border-top:1px solid #EEF0F4;text-align:center;">
              <p style="margin:0;color:#9CA3B4;font-size:12px;font-weight:500;text-transform:uppercase;letter-spacing:1px;">
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
      `Verify your email — AI Budget`,
      html,
    );
  }

  async sendWeeklyReport(params: {
    to: string;
    userName: string;
    accountName: string;
    periodLabel: string;
    totalIncome: number;
    totalExpenses: number;
    savingsRate: number;
    topCategories: Array<{ name: string; amount: number; percentage: number }>;
    currencyCode: string;
  }): Promise<boolean> {
    const { to, userName, accountName, periodLabel, totalIncome, totalExpenses, savingsRate, topCategories, currencyCode } = params;
    const netSavings = totalIncome - totalExpenses;
    const fmt = (n: number) => n.toFixed(2);

    const categoryRows = topCategories.slice(0, 5).map(c => `
      <tr>
        <td style="padding:10px 12px;color:#1A1D26;font-size:14px;border-bottom:1px solid #EEF0F4;">${c.name}</td>
        <td style="padding:10px 12px;color:#1A1D26;font-size:14px;font-weight:600;text-align:right;border-bottom:1px solid #EEF0F4;">${currencyCode} ${fmt(c.amount)}</td>
        <td style="padding:10px 12px;color:#9CA3B4;font-size:13px;text-align:right;border-bottom:1px solid #EEF0F4;">${c.percentage.toFixed(1)}%</td>
      </tr>
    `).join('');

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F8FAFB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFB;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          <tr>
            <td style="background:#E37F2B;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Weekly Financial Summary</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.9);font-size:14px;">${periodLabel}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              <p style="margin:0 0 24px;color:#5E6272;font-size:15px;line-height:1.6;">Hi ${userName}, here's your weekly summary for <strong style="color:#1A1D26;">${accountName}</strong>.</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td style="padding:16px;background:#E8F5E9;border-radius:12px;text-align:center;width:33%;">
                    <div style="color:#9CA3B4;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Income</div>
                    <div style="color:#4CAF50;font-size:18px;font-weight:700;">${currencyCode} ${fmt(totalIncome)}</div>
                  </td>
                  <td style="width:8px;"></td>
                  <td style="padding:16px;background:#FFE5E5;border-radius:12px;text-align:center;width:33%;">
                    <div style="color:#9CA3B4;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Expenses</div>
                    <div style="color:#FF6B6B;font-size:18px;font-weight:700;">${currencyCode} ${fmt(totalExpenses)}</div>
                  </td>
                  <td style="width:8px;"></td>
                  <td style="padding:16px;background:#FDF0E4;border-radius:12px;text-align:center;width:33%;">
                    <div style="color:#9CA3B4;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Savings</div>
                    <div style="color:${netSavings >= 0 ? '#4CAF50' : '#FF6B6B'};font-size:18px;font-weight:700;">${currencyCode} ${fmt(netSavings)}</div>
                  </td>
                </tr>
              </table>
              ${topCategories.length > 0 ? `
              <p style="margin:0 0 12px;color:#1A1D26;font-size:15px;font-weight:600;">Top Categories</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid #EEF0F4;border-radius:12px;overflow:hidden;">
                <tr style="background:#F2F4F7;">
                  <th style="padding:10px 12px;text-align:left;color:#9CA3B4;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Category</th>
                  <th style="padding:10px 12px;text-align:right;color:#9CA3B4;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Amount</th>
                  <th style="padding:10px 12px;text-align:right;color:#9CA3B4;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Share</th>
                </tr>
                ${categoryRows}
              </table>` : ''}
              <div style="background:#F8FAFB;border-radius:12px;padding:14px;text-align:center;">
                <span style="color:#5E6272;font-size:13px;">Savings rate: </span>
                <span style="color:#1A1D26;font-size:15px;font-weight:700;">${savingsRate.toFixed(1)}%</span>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px;background:#F8FAFB;border-top:1px solid #EEF0F4;text-align:center;">
              <p style="margin:0;color:#9CA3B4;font-size:12px;font-weight:500;text-transform:uppercase;letter-spacing:1px;">AI Budget Assistant</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    return this.sendMail(to, `Weekly Summary: ${periodLabel} — AI Budget`, html);
  }

  async sendMonthlyDigest(params: {
    to: string;
    userName: string;
    accountName: string;
    periodLabel: string;
    totalIncome: number;
    totalExpenses: number;
    savingsRate: number;
    topCategories: Array<{ name: string; amount: number; percentage: number }>;
    incomeChange: number;
    expenseChange: number;
    currencyCode: string;
  }): Promise<boolean> {
    const { to, userName, accountName, periodLabel, totalIncome, totalExpenses, savingsRate, topCategories, incomeChange, expenseChange, currencyCode } = params;
    const fmt = (n: number) => n.toFixed(2);
    const changeIcon = (v: number) => v > 0 ? '&#9650;' : v < 0 ? '&#9660;' : '&#9644;';
    const changeColor = (v: number, invert = false) => {
      const positive = invert ? v < 0 : v > 0;
      return positive ? '#4CAF50' : v === 0 ? '#9CA3B4' : '#FF6B6B';
    };

    const categoryBars = topCategories.slice(0, 5).map(c => `
      <tr>
        <td style="padding:7px 0;color:#1A1D26;font-size:13px;width:120px;">${c.name}</td>
        <td style="padding:7px 8px;">
          <div style="background:#FDF0E4;border-radius:6px;height:18px;width:100%;">
            <div style="background:#E37F2B;border-radius:6px;height:18px;width:${Math.min(c.percentage, 100)}%;"></div>
          </div>
        </td>
        <td style="padding:7px 0;color:#1A1D26;font-size:13px;font-weight:600;text-align:right;width:100px;">${currencyCode} ${fmt(c.amount)}</td>
      </tr>
    `).join('');

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F8FAFB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFB;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          <tr>
            <td style="background:#E37F2B;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Monthly Digest</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.9);font-size:15px;">${periodLabel} &middot; ${accountName}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              <p style="margin:0 0 24px;color:#5E6272;font-size:15px;line-height:1.6;">Hi ${userName}, here's your monthly overview.</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
                <tr>
                  <td style="padding:20px;background:#E8F5E9;border-radius:12px;text-align:center;" width="50%">
                    <div style="color:#9CA3B4;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Income</div>
                    <div style="color:#4CAF50;font-size:22px;font-weight:700;">${currencyCode} ${fmt(totalIncome)}</div>
                    <div style="color:${changeColor(incomeChange)};font-size:12px;margin-top:4px;">${changeIcon(incomeChange)} ${Math.abs(incomeChange).toFixed(1)}% vs last month</div>
                  </td>
                  <td style="width:12px;"></td>
                  <td style="padding:20px;background:#FFE5E5;border-radius:12px;text-align:center;" width="50%">
                    <div style="color:#9CA3B4;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Expenses</div>
                    <div style="color:#FF6B6B;font-size:22px;font-weight:700;">${currencyCode} ${fmt(totalExpenses)}</div>
                    <div style="color:${changeColor(expenseChange, true)};font-size:12px;margin-top:4px;">${changeIcon(expenseChange)} ${Math.abs(expenseChange).toFixed(1)}% vs last month</div>
                  </td>
                </tr>
              </table>
              <div style="text-align:center;background:#FDF0E4;border-radius:12px;padding:14px;margin:16px 0;">
                <span style="color:#5E6272;font-size:13px;">Savings rate: </span>
                <span style="color:${savingsRate >= 0 ? '#4CAF50' : '#FF6B6B'};font-size:16px;font-weight:700;">${savingsRate.toFixed(1)}%</span>
              </div>
              ${topCategories.length > 0 ? `
              <p style="margin:0 0 12px;color:#1A1D26;font-size:15px;font-weight:600;">Spending by Category</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                ${categoryBars}
              </table>` : ''}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px;background:#F8FAFB;border-top:1px solid #EEF0F4;text-align:center;">
              <p style="margin:0;color:#9CA3B4;font-size:12px;font-weight:500;text-transform:uppercase;letter-spacing:1px;">AI Budget Assistant</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    return this.sendMail(to, `Monthly Digest: ${periodLabel} — AI Budget`, html);
  }

  /**
   * "An app was connected to your account" (Public API, spec §9). Localized by the recipient's
   * `user.language` (nine app languages, English fallback). `appName` comes from a third-party
   * developer, so every interpolated value is HTML-escaped.
   */
  async sendAppConnectedEmail(params: {
    to: string;
    lang: string | null | undefined;
    appName: string;
    accountNames: string[];
    connectedByName: string;
    manageUrl: string;
  }): Promise<boolean> {
    const copy = appConnectedCopy(params.lang);
    const [open, close] = copy.quote;
    const quoted = params.accountNames.map((n) => `${open}${escapeHtml(n)}${close}`);
    // The Intl locale follows the copy actually selected: an unknown code (or `xx`) must not fall
    // through to the host default, and the app's `ua` is `uk` in BCP-47.
    const known = params.lang && APP_CONNECTED_LANGS.includes(params.lang) ? params.lang : 'en';
    const accounts = new Intl.ListFormat(known === 'ua' ? 'uk' : known, { type: 'conjunction' }).format(quoted);
    const esc = {
      appName: escapeHtml(params.appName),
      accounts,
      count: params.accountNames.length,
      connectedByName: escapeHtml(params.connectedByName),
    };
    const manageUrl = escapeHtml(params.manageUrl);

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F8FAFB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFB;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="background:#E37F2B;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:600;">${escapeHtml(copy.heading)}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              <p style="margin:0 0 16px;color:#1A1D26;font-size:16px;line-height:1.5;">${copy.body(esc)}</p>
              <p style="margin:0 0 24px;color:#5E6272;font-size:14px;line-height:1.5;">${escapeHtml(copy.warning)}</p>
              <div style="text-align:center;">
                <a href="${manageUrl}" style="display:inline-block;background:#E37F2B;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:8px;">${escapeHtml(copy.manage)}</a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #eee;text-align:center;">
              <p style="margin:0;color:#ccc;font-size:12px;">AI Budget Assistant</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    return this.sendMail(params.to, copy.subject({ appName: params.appName, accounts: '', count: params.accountNames.length, connectedByName: params.connectedByName }), html);
  }

  /**
   * ABA-738: the one "how to start" e-mail to a user who has logged nothing three days after
   * signing up. Carries a signed unsubscribe link in the body and in `List-Unsubscribe`.
   */
  async sendActivationEmail(params: {
    to: string;
    lang: string | null | undefined;
    name: string;
    ctaUrl: string;
    unsubscribeUrl: string;
  }): Promise<boolean> {
    const copy = onboardingEmailCopy(params.lang);
    const ctaUrl = escapeHtml(params.ctaUrl);
    const unsubscribeUrl = escapeHtml(params.unsubscribeUrl);
    const tips = copy.tips
      .map((tip) => `<li style="margin:0 0 10px;">${escapeHtml(tip)}</li>`)
      .join('');

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F8FAFB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFB;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="background:#E37F2B;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:600;">${escapeHtml(copy.heading)}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              <p style="margin:0 0 12px;color:#1A1D26;font-size:16px;line-height:1.5;">${escapeHtml(copy.greeting(params.name))}</p>
              <p style="margin:0 0 16px;color:#5E6272;font-size:15px;line-height:1.6;">${escapeHtml(copy.intro)}</p>
              <ul style="margin:0 0 24px;padding-left:20px;color:#1A1D26;font-size:15px;line-height:1.5;">${tips}</ul>
              <div style="text-align:center;">
                <a href="${ctaUrl}" style="display:inline-block;background:#E37F2B;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:8px;">${escapeHtml(copy.cta)}</a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #eee;text-align:center;">
              <p style="margin:0 0 8px;color:#9CA3B4;font-size:12px;line-height:1.5;">${escapeHtml(copy.footer)}</p>
              <p style="margin:0;font-size:12px;"><a href="${unsubscribeUrl}" style="color:#9CA3B4;">${escapeHtml(copy.unsubscribe)}</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    return this.sendMail(params.to, copy.subject, html, params.unsubscribeUrl);
  }
}

function escapeHtml(v: string): string {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
