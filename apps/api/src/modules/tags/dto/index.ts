import { IsString, IsOptional, MaxLength, Matches } from 'class-validator';

export class CreateTagDto {
  @IsString()
  @MaxLength(30)
  name: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;

  // The mobile client's local tag id, so the server can resolve client-supplied
  // tag ids back to its own PK (offline-first). See tags.service resolution.
  @IsOptional()
  @IsString()
  clientId?: string;
}

export class UpdateTagDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;
}
