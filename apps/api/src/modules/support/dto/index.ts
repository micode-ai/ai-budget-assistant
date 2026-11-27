import { Type, Transform } from 'class-transformer';
import { IsBoolean, IsDefined, IsObject, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class SupportContextDto {
  @IsString() @IsNotEmpty() @MaxLength(100) appVersion: string;
  @IsOptional() @IsString() @MaxLength(100) buildSha?: string;
  @IsIn(['android', 'ios', 'web']) platform: 'android' | 'ios' | 'web';
  @IsOptional() @IsString() @MaxLength(100) osVersion?: string;
  @IsString() @IsNotEmpty() @MaxLength(100) locale: string;
  @IsOptional() @IsString() @MaxLength(100) tier?: string;
  @IsOptional() @IsString() @MaxLength(100) accountType?: string;
  @IsOptional() @IsString() @MaxLength(100) fromRoute?: string;
}

export class SendSupportMessageDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  body: string;

  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => SupportContextDto)
  context: SupportContextDto;
}

export class UpdateSupportThreadDto {
  @IsBoolean()
  autoTranslate: boolean;
}

export class SupportThreadQueryDto {
  @IsOptional() @IsString() before?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

export class AdminSupportReplyBodyDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  body: string;
}

export class AdminUpdateSupportThreadBodyDto {
  @IsOptional() @IsIn(['open', 'closed']) status?: 'open' | 'closed';
  @IsOptional() @IsBoolean() muted?: boolean;
}

export class AdminSupportThreadsQueryDto {
  @IsOptional() @IsIn(['open', 'closed', 'muted']) filter?: 'open' | 'closed' | 'muted';
}
