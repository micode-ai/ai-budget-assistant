import type { UserPaymentMethod } from '../entities';

/** Body for `PUT /users/me/payment-methods` — replaces the caller's whole payment-method
 * list in one call (what a list-editing UI wants), rather than one endpoint per method. */
export interface ReplaceUserPaymentMethodsDto {
  paymentMethods: UserPaymentMethod[];
}
