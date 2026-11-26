import { IsString, MinLength } from 'class-validator';

export class LinkRefundDto {
  /** Server id or clientId of the expense being refunded. */
  @IsString()
  @MinLength(1)
  expenseId: string;
}
