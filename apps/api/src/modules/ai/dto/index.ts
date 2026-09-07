import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

// Same gap `SettleUpPayDto` (modules/trip-settle-up/dto/index.ts) documents:
// a bare shared-types interface carries no class-validator decorators, so
// NestJS's global ValidationPipe (whitelist + forbidNonWhitelisted) silently
// skips it — there is no metatype to reflect on. This local decorated class
// is the one actually bound in the controller's @Body().
export class UpdateConversationTitleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title: string;
}
