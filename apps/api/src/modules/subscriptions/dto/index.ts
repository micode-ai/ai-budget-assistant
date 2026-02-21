import { IsString } from 'class-validator';

export class CreateCheckoutSessionDto {
  @IsString()
  priceId: string;

  @IsString()
  successUrl: string;

  @IsString()
  cancelUrl: string;
}

export class CreatePortalSessionDto {
  @IsString()
  returnUrl: string;
}
