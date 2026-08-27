import { IsEmail, IsString, MinLength, MaxLength, IsOptional, Matches, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Where a signup came from — read off the CTA query string the marketing generators
 * put on every link into the app (`app_url()` in build_landing.py / build_blog.py).
 *
 * Deliberately validated by CHARSET AND LENGTH, not by an allow-list of the values we
 * emit today: an allow-list would mean that the first time marketing adds a new section
 * name, every registration carrying it fails validation and the signup is lost. Losing
 * the attribution of a signup is acceptable; losing the signup is not. The tight charset
 * is what protects the column and the admin group-by, and cardinality is bounded because
 * only our own generators produce these links.
 */
export class AcquisitionDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^[A-Za-z0-9_-]*$/)
  src?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^[A-Za-z0-9_-]*$/)
  loc?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^[A-Za-z0-9_-]*$/)
  lang?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^[A-Za-z0-9_-]*$/)
  plan?: string;
}

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
  })
  password: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  currencyCode?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9]{4,10}$/, { message: 'Invalid referral code format' })
  referralCode?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AcquisitionDto)
  acquisition?: AcquisitionDto;
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  password: string;
}

export class RefreshTokenDto {
  @IsString()
  refreshToken: string;
}

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

export class VerifyEmailDto {
  @IsEmail()
  email: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'Code must be 6 digits' })
  code: string;
}

export class ChangeEmailRequestDto {
  @IsEmail()
  newEmail: string;

  @IsString()
  @MinLength(1)
  currentPassword: string;
}

export class ChangeEmailConfirmDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Code must be 6 digits' })
  code: string;
}

export class GoogleAuthDto {
  @IsString()
  @MinLength(1)
  idToken: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  currencyCode?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9]{4,10}$/, { message: 'Invalid referral code format' })
  referralCode?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AcquisitionDto)
  acquisition?: AcquisitionDto;
}
