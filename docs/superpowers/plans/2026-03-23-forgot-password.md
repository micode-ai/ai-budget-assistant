# Forgot Password Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a complete forgot/reset password flow using 6-digit email codes.

**Architecture:** Two new public API endpoints (forgot-password, reset-password) with in-memory rate limiting and bcrypt-hashed codes stored on the User model. Two new mobile screens following existing auth screen patterns. Shared types and Zod schemas for validation.

**Tech Stack:** NestJS, Prisma, bcrypt, Nodemailer, React Native/Expo Router, Zustand, Zod, i18next

**Spec:** `docs/superpowers/specs/2026-03-23-forgot-password-design.md`
**Issue:** [#65](https://github.com/micode-ai/ai-budget-assistant/issues/65)

---

### Task 1: Shared Types — Add Password Reset DTOs

**Files:**
- Modify: `packages/shared-types/src/dto/index.ts:30` (after AuthResponse)

- [ ] **Step 1: Add ForgotPasswordDto and ResetPasswordDto interfaces**

After the `AuthResponse` interface (line 30), add:

```typescript
export interface ForgotPasswordDto {
  email: string;
}

export interface ResetPasswordDto {
  email: string;
  code: string;
  newPassword: string;
}

export interface MessageResponse {
  message: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/shared-types/src/dto/index.ts
git commit -m "feat(shared-types): add password reset DTOs #65"
```

---

### Task 2: Shared Utils — Add Zod Validation Schemas

**Files:**
- Modify: `packages/shared-utils/src/validation/index.ts:27` (after LoginSchema)

- [ ] **Step 1: Add ForgotPasswordSchema and ResetPasswordSchema**

After the `LoginSchema` (line 27), add:

```typescript
export const ForgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export const ResetPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
  code: z.string().length(6, 'Code must be 6 digits').regex(/^\d{6}$/, 'Code must be 6 digits'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});
```

- [ ] **Step 2: Commit**

```bash
git add packages/shared-utils/src/validation/index.ts
git commit -m "feat(shared-utils): add password reset Zod schemas #65"
```

---

### Task 3: Prisma — Add Password Reset Fields to User Model

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (User model, after `lastSyncAt` field)

- [ ] **Step 1: Add fields to User model**

In the User model, after the `lastSyncAt` field, add:

```prisma
passwordResetCode      String?   @map("password_reset_code")
passwordResetExpiresAt DateTime? @map("password_reset_expires_at")
```

- [ ] **Step 2: Generate migration**

Run from `apps/api/`:

```bash
npx prisma migrate dev --name add_password_reset_fields
```

Expected: Migration created successfully, Prisma client regenerated.

- [ ] **Step 3: Commit**

```bash
git add apps/api/prisma/
git commit -m "feat(api): add password reset fields to User model #65"
```

---

### Task 4: API — Add Password Reset Method to UsersService

**Files:**
- Modify: `apps/api/src/modules/users/users.service.ts`

- [ ] **Step 1: Add updatePasswordReset method**

After the `update` method (line 46), add:

```typescript
async updatePasswordReset(id: string, data: {
    passwordResetCode: string | null;
    passwordResetExpiresAt: Date | null;
    passwordHash?: string;
}) {
    return this.prisma.user.update({
        where: { id },
        data,
    });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/users/users.service.ts
git commit -m "feat(api): add updatePasswordReset method to UsersService #65"
```

---

### Task 5: API — Add Password Reset DTOs

**Files:**
- Modify: `apps/api/src/modules/auth/dto/index.ts:40` (after RefreshTokenDto)

- [ ] **Step 1: Add ForgotPasswordDto and ResetPasswordDto classes**

After `RefreshTokenDto` (line 40), add:

```typescript
export class ForgotPasswordDto {
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @IsEmail()
  email: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'Code must be 6 digits' })
  code: string;

  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
  })
  newPassword: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/auth/dto/index.ts
git commit -m "feat(api): add password reset DTOs #65"
```

---

### Task 6: API — Add MailModule to AuthModule

**Files:**
- Modify: `apps/api/src/modules/auth/auth.module.ts:12-13` (imports array)

- [ ] **Step 1: Import MailModule**

Add `MailModule` import at the top:

```typescript
import { MailModule } from '../mail/mail.module';
```

Add `MailModule` to the `imports` array (after `AccountsModule`):

```typescript
imports: [
    UsersModule,
    AccountsModule,
    MailModule,
    forwardRef(() => AdminModule),
    // ... rest
],
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/auth/auth.module.ts
git commit -m "feat(api): add MailModule to AuthModule imports #65"
```

---

### Task 7: API — Implement forgotPassword and resetPassword in AuthService

**Files:**
- Modify: `apps/api/src/modules/auth/auth.service.ts`

- [ ] **Step 1: Add imports and inject MailService**

Add to imports at top of file:

```typescript
import { Injectable, UnauthorizedException, ConflictException, BadRequestException, HttpException, HttpStatus, Inject, forwardRef } from '@nestjs/common';
import { randomInt } from 'crypto';
import { MailService } from '../mail/mail.service';
```

Add `MailService` to constructor:

```typescript
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
```

- [ ] **Step 2: Add rate limiting maps and helper**

After the constructor, add:

```typescript
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
```

- [ ] **Step 3: Implement forgotPassword method**

After the `checkRateLimit` method, add:

```typescript
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
```

- [ ] **Step 4: Implement resetPassword method**

After `forgotPassword`, add:

```typescript
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
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/auth/auth.service.ts
git commit -m "feat(api): implement forgotPassword and resetPassword methods #65"
```

---

### Task 8: API — Add Controller Endpoints

**Files:**
- Modify: `apps/api/src/modules/auth/auth.controller.ts`

- [ ] **Step 1: Update imports and add endpoints**

Update the import line to include new DTOs:

```typescript
import { RegisterDto, LoginDto, RefreshTokenDto, ForgotPasswordDto, ResetPasswordDto } from './dto';
```

After the `refreshToken` method (line 24), add:

```typescript
@Post('forgot-password')
@HttpCode(HttpStatus.OK)
async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
}

@Post('reset-password')
@HttpCode(HttpStatus.OK)
async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.email, dto.code, dto.newPassword);
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/auth/auth.controller.ts
git commit -m "feat(api): add forgot-password and reset-password endpoints #65"
```

---

### Task 9: Mobile — Add API Client Methods

**Files:**
- Modify: `apps/mobile/src/services/api.ts:156` (after `register` method)

- [ ] **Step 1: Add forgotPassword and resetPassword methods**

After the `register` method (line 156), add:

```typescript
async forgotPassword(email: string) {
    return this.request<{ message: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
        skipAuth: true,
    });
}

async resetPassword(email: string, code: string, newPassword: string) {
    return this.request<{ message: string }>('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email, code, newPassword }),
        skipAuth: true,
    });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/services/api.ts
git commit -m "feat(mobile): add password reset API client methods #65"
```

---

### Task 10: Mobile — Add AuthStore Methods

**Files:**
- Modify: `apps/mobile/src/stores/authStore.ts`

- [ ] **Step 1: Add forgotPassword and resetPassword to AuthState interface**

In the `AuthState` interface (after `clearError` on line 35), add:

```typescript
forgotPassword: (email: string) => Promise<void>;
resetPassword: (email: string, code: string, newPassword: string) => Promise<void>;
```

- [ ] **Step 2: Add method implementations**

Before the `updateUser` method (line 356), add:

```typescript
forgotPassword: async (email: string) => {
    set({ isLoading: true, error: null });
    try {
        await api.forgotPassword(email);
        set({ isLoading: false });
    } catch (error) {
        set({
            error: error instanceof Error ? error.message : 'Failed to send reset code',
            isLoading: false,
        });
        throw error;
    }
},

resetPassword: async (email: string, code: string, newPassword: string) => {
    set({ isLoading: true, error: null });
    try {
        await api.resetPassword(email, code, newPassword);
        set({ isLoading: false });
    } catch (error) {
        set({
            error: error instanceof Error ? error.message : 'Password reset failed',
            isLoading: false,
        });
        throw error;
    }
},
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/stores/authStore.ts
git commit -m "feat(mobile): add forgotPassword and resetPassword store actions #65"
```

---

### Task 11: Mobile — Add i18n Keys (All 8 Locales)

**Files:**
- Modify: `apps/mobile/src/i18n/locales/en.ts` (auth section ~line 77, errors section ~line 603)
- Modify: `apps/mobile/src/i18n/locales/ru.ts`
- Modify: `apps/mobile/src/i18n/locales/ua.ts`
- Modify: `apps/mobile/src/i18n/locales/be.ts`
- Modify: `apps/mobile/src/i18n/locales/de.ts`
- Modify: `apps/mobile/src/i18n/locales/es.ts`
- Modify: `apps/mobile/src/i18n/locales/fr.ts`
- Modify: `apps/mobile/src/i18n/locales/pl.ts`

- [ ] **Step 1: Add keys to en.ts**

In `auth` section (after `language: 'Language'` on line 77), add:

```typescript
forgotPassword: 'Forgot password?',
resetPassword: 'Reset Password',
sendCode: 'Send Code',
newPassword: 'New Password',
confirmNewPassword: 'Confirm New Password',
codeSent: 'If this email is registered, a reset code has been sent.',
passwordResetSuccess: 'Password reset successfully. Please log in.',
backToLogin: 'Back to Login',
resendCode: 'Resend code',
enterResetCode: 'Enter the 6-digit code sent to your email',
enterEmail: 'Enter your email to receive a reset code',
```

In `errors` section (after `sessionExpired` line), add:

```typescript
invalidResetCode: 'Invalid or expired code',
tooManyResetAttempts: 'Too many attempts. Please try again later.',
resetFailed: 'Password reset failed. Please try again.',
```

- [ ] **Step 2: Add keys to ru.ts**

```typescript
// auth section
forgotPassword: 'Забыли пароль?',
resetPassword: 'Сбросить пароль',
sendCode: 'Отправить код',
newPassword: 'Новый пароль',
confirmNewPassword: 'Подтвердите новый пароль',
codeSent: 'Если этот email зарегистрирован, код для сброса отправлен.',
passwordResetSuccess: 'Пароль успешно сброшен. Пожалуйста, войдите.',
backToLogin: 'Назад к входу',
resendCode: 'Отправить код повторно',
enterResetCode: 'Введите 6-значный код, отправленный на вашу почту',
enterEmail: 'Введите email для получения кода сброса',

// errors section
invalidResetCode: 'Неверный или просроченный код',
tooManyResetAttempts: 'Слишком много попыток. Попробуйте позже.',
resetFailed: 'Не удалось сбросить пароль. Попробуйте снова.',
```

- [ ] **Step 3: Add keys to ua.ts**

```typescript
// auth section
forgotPassword: 'Забули пароль?',
resetPassword: 'Скинути пароль',
sendCode: 'Надіслати код',
newPassword: 'Новий пароль',
confirmNewPassword: 'Підтвердіть новий пароль',
codeSent: 'Якщо цей email зареєстрований, код для скидання надіслано.',
passwordResetSuccess: 'Пароль успішно скинуто. Будь ласка, увійдіть.',
backToLogin: 'Назад до входу',
resendCode: 'Надіслати код повторно',
enterResetCode: 'Введіть 6-значний код, надісланий на вашу пошту',
enterEmail: 'Введіть email для отримання коду скидання',

// errors section
invalidResetCode: 'Невірний або прострочений код',
tooManyResetAttempts: 'Забагато спроб. Спробуйте пізніше.',
resetFailed: 'Не вдалося скинути пароль. Спробуйте знову.',
```

- [ ] **Step 4: Add keys to be.ts**

```typescript
// auth section
forgotPassword: 'Забылі пароль?',
resetPassword: 'Скінуць пароль',
sendCode: 'Адправіць код',
newPassword: 'Новы пароль',
confirmNewPassword: 'Пацвердзіце новы пароль',
codeSent: 'Калі гэты email зарэгістраваны, код для скіду адпраўлены.',
passwordResetSuccess: 'Пароль паспяхова скінуты. Калі ласка, увайдзіце.',
backToLogin: 'Назад да ўваходу',
resendCode: 'Адправіць код паўторна',
enterResetCode: 'Увядзіце 6-значны код, адпраўлены на вашу пошту',
enterEmail: 'Увядзіце email для атрымання коду скіду',

// errors section
invalidResetCode: 'Няправільны або пратэрмінаваны код',
tooManyResetAttempts: 'Занадта шмат спроб. Паспрабуйце пазней.',
resetFailed: 'Не ўдалося скінуць пароль. Паспрабуйце зноў.',
```

- [ ] **Step 5: Add keys to de.ts**

```typescript
// auth section
forgotPassword: 'Passwort vergessen?',
resetPassword: 'Passwort zurücksetzen',
sendCode: 'Code senden',
newPassword: 'Neues Passwort',
confirmNewPassword: 'Neues Passwort bestätigen',
codeSent: 'Wenn diese E-Mail registriert ist, wurde ein Zurücksetzungscode gesendet.',
passwordResetSuccess: 'Passwort erfolgreich zurückgesetzt. Bitte melden Sie sich an.',
backToLogin: 'Zurück zur Anmeldung',
resendCode: 'Code erneut senden',
enterResetCode: 'Geben Sie den 6-stelligen Code ein, der an Ihre E-Mail gesendet wurde',
enterEmail: 'Geben Sie Ihre E-Mail-Adresse ein, um einen Zurücksetzungscode zu erhalten',

// errors section
invalidResetCode: 'Ungültiger oder abgelaufener Code',
tooManyResetAttempts: 'Zu viele Versuche. Bitte versuchen Sie es später erneut.',
resetFailed: 'Passwort konnte nicht zurückgesetzt werden. Bitte versuchen Sie es erneut.',
```

- [ ] **Step 6: Add keys to es.ts**

```typescript
// auth section
forgotPassword: '¿Olvidaste tu contraseña?',
resetPassword: 'Restablecer contraseña',
sendCode: 'Enviar código',
newPassword: 'Nueva contraseña',
confirmNewPassword: 'Confirmar nueva contraseña',
codeSent: 'Si este correo está registrado, se ha enviado un código de restablecimiento.',
passwordResetSuccess: 'Contraseña restablecida correctamente. Por favor, inicia sesión.',
backToLogin: 'Volver al inicio de sesión',
resendCode: 'Reenviar código',
enterResetCode: 'Ingresa el código de 6 dígitos enviado a tu correo',
enterEmail: 'Ingresa tu correo para recibir un código de restablecimiento',

// errors section
invalidResetCode: 'Código inválido o expirado',
tooManyResetAttempts: 'Demasiados intentos. Por favor, inténtalo más tarde.',
resetFailed: 'No se pudo restablecer la contraseña. Inténtalo de nuevo.',
```

- [ ] **Step 7: Add keys to fr.ts**

```typescript
// auth section
forgotPassword: 'Mot de passe oublié ?',
resetPassword: 'Réinitialiser le mot de passe',
sendCode: 'Envoyer le code',
newPassword: 'Nouveau mot de passe',
confirmNewPassword: 'Confirmer le nouveau mot de passe',
codeSent: 'Si cet email est enregistré, un code de réinitialisation a été envoyé.',
passwordResetSuccess: 'Mot de passe réinitialisé avec succès. Veuillez vous connecter.',
backToLogin: 'Retour à la connexion',
resendCode: 'Renvoyer le code',
enterResetCode: 'Entrez le code à 6 chiffres envoyé à votre email',
enterEmail: 'Entrez votre email pour recevoir un code de réinitialisation',

// errors section
invalidResetCode: 'Code invalide ou expiré',
tooManyResetAttempts: 'Trop de tentatives. Veuillez réessayer plus tard.',
resetFailed: 'Échec de la réinitialisation du mot de passe. Veuillez réessayer.',
```

- [ ] **Step 8: Add keys to pl.ts**

```typescript
// auth section
forgotPassword: 'Zapomniałeś hasła?',
resetPassword: 'Zresetuj hasło',
sendCode: 'Wyślij kod',
newPassword: 'Nowe hasło',
confirmNewPassword: 'Potwierdź nowe hasło',
codeSent: 'Jeśli ten email jest zarejestrowany, kod resetujący został wysłany.',
passwordResetSuccess: 'Hasło zostało zresetowane. Zaloguj się ponownie.',
backToLogin: 'Powrót do logowania',
resendCode: 'Wyślij kod ponownie',
enterResetCode: 'Wprowadź 6-cyfrowy kod wysłany na Twój email',
enterEmail: 'Podaj swój email, aby otrzymać kod resetujący',

// errors section
invalidResetCode: 'Nieprawidłowy lub wygasły kod',
tooManyResetAttempts: 'Zbyt wiele prób. Spróbuj ponownie później.',
resetFailed: 'Nie udało się zresetować hasła. Spróbuj ponownie.',
```

- [ ] **Step 9: Commit**

```bash
git add apps/mobile/src/i18n/locales/
git commit -m "feat(mobile): add password reset i18n keys for all 8 locales #65"
```

---

### Task 12: Mobile — Add Auth Layout Screens

**Files:**
- Modify: `apps/mobile/app/(auth)/_layout.tsx:16` (after register screen)

- [ ] **Step 1: Add Stack.Screen entries**

After `<Stack.Screen name="register" />` (line 16), add:

```tsx
<Stack.Screen name="forgot-password" />
<Stack.Screen name="reset-password" />
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/app/(auth)/_layout.tsx
git commit -m "feat(mobile): register forgot/reset password screens in auth layout #65"
```

---

### Task 13: Mobile — Add "Forgot password?" Link to Login Screen

**Files:**
- Modify: `apps/mobile/app/(auth)/login.tsx`

- [ ] **Step 1: Add forgot password link**

After the password container closing `</View>` (line 146) and before the login button `<TouchableOpacity` (line 148), add:

```tsx
<TouchableOpacity
    onPress={() => router.push('/(auth)/forgot-password')}
    style={styles.forgotPassword}
>
    <Text style={styles.forgotPasswordText}>{t('auth.forgotPassword')}</Text>
</TouchableOpacity>
```

- [ ] **Step 2: Add styles**

In the `createStyles` function, add after the `eyeButton` style (line 261):

```typescript
forgotPassword: {
    alignSelf: 'flex-end' as const,
    marginTop: -theme.spacing[2],
},
forgotPasswordText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.primary,
},
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/(auth)/login.tsx
git commit -m "feat(mobile): add forgot password link to login screen #65"
```

---

### Task 14: Mobile — Create Forgot Password Screen

**Files:**
- Create: `apps/mobile/app/(auth)/forgot-password.tsx`

- [ ] **Step 1: Create the forgot-password screen**

```tsx
import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { useTheme, useStyles, type Theme } from '@/theme';

const API_ERROR_MAP: Record<string, string> = {
  'Too many attempts. Please try again later.': 'errors.tooManyResetAttempts',
};

function mapApiError(message: string, t: (key: string) => string): string {
  const i18nKey = API_ERROR_MAP[message];
  return i18nKey ? t(i18nKey) : t('errors.resetFailed');
}

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const { forgotPassword, isLoading } = useAuthStore();

  const handleSendCode = async () => {
    if (!email) {
      setError(t('validation.fillAllFields'));
      return;
    }

    setError(null);

    try {
      await forgotPassword(email);
      router.push({ pathname: '/(auth)/reset-password', params: { email } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setError(mapApiError(msg, t));
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.content}
      >
        <View style={styles.header}>
          <Text style={styles.title}>{t('auth.forgotPassword')}</Text>
          <Text style={styles.subtitle}>{t('auth.enterEmail')}</Text>
        </View>

        <View style={styles.form}>
          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TextInput
            style={styles.input}
            placeholder={t('auth.email')}
            placeholderTextColor={theme.colors.textTertiary}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
          />

          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleSendCode}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color={theme.colors.textInverse} />
            ) : (
              <Text style={styles.buttonText}>{t('auth.sendCode')}</Text>
            )}
          </TouchableOpacity>

          <View style={styles.footer}>
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.linkText}>{t('auth.backToLogin')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center' as const,
    paddingHorizontal: theme.spacing[6],
  },
  header: {
    alignItems: 'center' as const,
    marginBottom: theme.spacing[12],
  },
  title: {
    fontSize: 36,
    fontFamily: theme.fonts.bold,
    color: theme.colors.primary,
    marginBottom: theme.spacing[2],
  },
  subtitle: {
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
    paddingHorizontal: theme.spacing[4],
  },
  form: {
    gap: theme.spacing[4],
  },
  errorContainer: {
    backgroundColor: theme.colors.dangerLight,
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.danger,
  },
  errorText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.danger,
    textAlign: 'center' as const,
  },
  input: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textPrimary,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  button: {
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing[4],
    borderRadius: theme.borderRadius.lg,
    alignItems: 'center' as const,
    marginTop: theme.spacing[2],
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    ...theme.textStyles.h3,
    color: theme.colors.textInverse,
  },
  footer: {
    alignItems: 'center' as const,
    marginTop: theme.spacing[6],
  },
  linkText: {
    ...theme.textStyles.bodySm,
    fontWeight: '600' as const,
    color: theme.colors.primary,
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/app/(auth)/forgot-password.tsx
git commit -m "feat(mobile): create forgot-password screen #65"
```

---

### Task 15: Mobile — Create Reset Password Screen

**Files:**
- Create: `apps/mobile/app/(auth)/reset-password.tsx`

- [ ] **Step 1: Create the reset-password screen**

```tsx
import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { useTheme, useStyles, type Theme } from '@/theme';

const API_ERROR_MAP: Record<string, string> = {
  'Invalid or expired code': 'errors.invalidResetCode',
  'Too many attempts. Please try again later.': 'errors.tooManyResetAttempts',
};

function mapApiError(message: string, t: (key: string) => string): string {
  const i18nKey = API_ERROR_MAP[message];
  return i18nKey ? t(i18nKey) : t('errors.resetFailed');
}

export default function ResetPasswordScreen() {
  const { t } = useTranslation();
  const { email } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const { resetPassword, forgotPassword, isLoading } = useAuthStore();

  const validate = (): string | null => {
    if (!code || !newPassword || !confirmPassword) {
      return t('validation.fillAllFields');
    }
    if (code.length !== 6) {
      return t('errors.invalidResetCode');
    }
    if (newPassword.length < 8) {
      return t('validation.passwordMin8');
    }
    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return t('validation.passwordLatin');
    }
    if (newPassword !== confirmPassword) {
      return t('validation.passwordsNoMatch');
    }
    return null;
  };

  const handleResetPassword = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);

    try {
      await resetPassword(email!, code, newPassword);
      Alert.alert('', t('auth.passwordResetSuccess'));
      router.replace('/(auth)/login');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setError(mapApiError(msg, t));
    }
  };

  const handleResendCode = async () => {
    setError(null);
    setResendMessage(null);
    try {
      await forgotPassword(email!);
      setResendMessage(t('auth.codeSent'));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setError(mapApiError(msg, t));
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.content}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.title}>{t('auth.resetPassword')}</Text>
            <Text style={styles.subtitle}>{t('auth.enterResetCode')}</Text>
          </View>

          <View style={styles.form}>
            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {resendMessage && (
              <View style={styles.successContainer}>
                <Text style={styles.successText}>{resendMessage}</Text>
              </View>
            )}

            <TextInput
              style={styles.codeInput}
              placeholder="000000"
              placeholderTextColor={theme.colors.textTertiary}
              value={code}
              onChangeText={(text) => setCode(text.replace(/[^0-9]/g, '').slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              textAlign="center"
              autoFocus
            />

            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder={t('auth.newPassword')}
                placeholderTextColor={theme.colors.textTertiary}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword(!showPassword)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={theme.colors.textTertiary}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder={t('auth.confirmNewPassword')}
                placeholderTextColor={theme.colors.textTertiary}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={theme.colors.textTertiary}
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.button, isLoading && styles.buttonDisabled]}
              onPress={handleResetPassword}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={theme.colors.textInverse} />
              ) : (
                <Text style={styles.buttonText}>{t('auth.resetPassword')}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleResendCode}
              disabled={isLoading}
              style={styles.resendButton}
            >
              <Text style={styles.linkText}>{t('auth.resendCode')}</Text>
            </TouchableOpacity>

            <View style={styles.footer}>
              <TouchableOpacity onPress={() => router.replace('/(auth)/login')}>
                <Text style={styles.linkText}>{t('auth.backToLogin')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center' as const,
    paddingHorizontal: theme.spacing[6],
  },
  header: {
    alignItems: 'center' as const,
    marginBottom: theme.spacing[12],
  },
  title: {
    fontSize: 36,
    fontFamily: theme.fonts.bold,
    color: theme.colors.primary,
    marginBottom: theme.spacing[2],
  },
  subtitle: {
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
    paddingHorizontal: theme.spacing[4],
  },
  form: {
    gap: theme.spacing[4],
  },
  errorContainer: {
    backgroundColor: theme.colors.dangerLight,
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.danger,
  },
  errorText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.danger,
    textAlign: 'center' as const,
  },
  successContainer: {
    backgroundColor: theme.colors.successLight,
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.success,
  },
  successText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.success,
    textAlign: 'center' as const,
  },
  codeInput: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[4],
    borderRadius: theme.borderRadius.lg,
    fontSize: 28,
    fontFamily: theme.fonts.bold,
    letterSpacing: 8,
    color: theme.colors.textPrimary,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  passwordContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3.5],
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textPrimary,
  },
  eyeButton: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3.5],
  },
  button: {
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing[4],
    borderRadius: theme.borderRadius.lg,
    alignItems: 'center' as const,
    marginTop: theme.spacing[2],
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    ...theme.textStyles.h3,
    color: theme.colors.textInverse,
  },
  resendButton: {
    alignItems: 'center' as const,
  },
  footer: {
    alignItems: 'center' as const,
    marginTop: theme.spacing[4],
  },
  linkText: {
    ...theme.textStyles.bodySm,
    fontWeight: '600' as const,
    color: theme.colors.primary,
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/app/(auth)/reset-password.tsx
git commit -m "feat(mobile): create reset-password screen #65"
```

---

### Task 16: Manual Testing

- [ ] **Step 1: Start API server**

```bash
cd apps/api && npm run start:dev
```

- [ ] **Step 2: Test forgot-password endpoint**

```bash
curl -X POST http://localhost:3000/api/v1/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

Expected: `{ "message": "If this email is registered, a reset code has been sent" }`

- [ ] **Step 3: Test reset-password endpoint with wrong code**

```bash
curl -X POST http://localhost:3000/api/v1/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","code":"000000","newPassword":"NewPass123"}'
```

Expected: 400 `{ "message": "Invalid or expired code" }`

- [ ] **Step 4: Test rate limiting**

Send 4 forgot-password requests for the same email rapidly.
Expected: 4th request returns 429.

- [ ] **Step 5: Start mobile app and test full flow**

```bash
cd apps/mobile && npx expo start --web
```

Test:
1. Login screen shows "Forgot password?" link
2. Tapping it navigates to forgot-password screen
3. Entering email and tapping "Send Code" navigates to reset-password screen
4. Check email for 6-digit code
5. Enter code + new password → success → back to login
6. Login with new password works
