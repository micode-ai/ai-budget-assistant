import { IsString, Matches } from 'class-validator';

export class CreateCheckoutSessionDto {
  /** A price env KEY as handed out by GET /subscriptions/plans, not a Stripe price id. */
  @IsString()
  @Matches(/^STRIPE_(PRO|BUSINESS)_(MONTHLY|YEARLY)_PRICE_ID_[A-Z]{3}$/)
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
