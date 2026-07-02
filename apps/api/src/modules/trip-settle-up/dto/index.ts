import { IsUUID, IsNumber, IsPositive } from 'class-validator';
import type { AccountMemberPaymentInfoDto } from '@budget/shared-types';

export type { AccountMemberPaymentInfoDto };

// Fix 5: the shared-types SettleUpPayDto is a plain interface with no class-validator
// decorators, so NestJS's ValidationPipe silently skips it (same gap Task 6 fixed for
// AccountMemberPaymentInfoDto). This local decorated class is the one actually bound in
// the controller's @Body(). The shared-types export is kept for other consumers (mobile).
export class SettleUpPayDto {
  @IsUUID()
  fromUserId: string;

  @IsUUID()
  toUserId: string;

  @IsNumber()
  @IsPositive()
  amount: number;
}
