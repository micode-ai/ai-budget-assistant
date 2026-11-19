import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { CacheService } from './cache/cache.service';
import { VehiclesService } from '../modules/vehicles/vehicles.service';
import type { ReceiptFuel } from '../modules/ai/utils/receipt-fuel';

/**
 * "⛽ Add to fuel log" after a scanned fuel receipt is saved from a bot (ABA-830).
 *
 * The bot counterpart of the app's `ReceiptFuelCard`: the scan already carries a
 * validated `fuel` block (`extractReceiptFuel`), so the only thing left to ask is
 * the odometer. Shared by the Telegram, WhatsApp and Slack photo handlers — each
 * renders its own buttons and passes its own key prefix (`telegram`, `wa`,
 * `slack`) and per-user key (Telegram user id, phone number, Slack user id).
 *
 * State is two Redis TTL keys, never a module-level Map (wiped on deploy):
 * - `{prefix}:fuel_offer:{offerId}` — what the button would log, for 30 min;
 * - `{prefix}:awaiting_fuel_odo:{userKey}` — the typed-input mode, for 10 min.
 * The mode is the third typed-input mode beside item-edit and date-edit; the
 * three are mutually exclusive (arming one clears the others) and it is
 * cleared on save, skip, failure and expiry, or the next chat message would be
 * swallowed by the odometer parser.
 */

export type BotFuelPrefix = 'telegram' | 'wa' | 'slack';

export const FUEL_OFFER_TTL_SEC = 1800;
export const AWAITING_FUEL_ODOMETER_TTL_SEC = 600;
/** Above this a number is a typo (or a phone number), not an odometer. */
export const MAX_ODOMETER_KM = 9_999_999;

export const fuelOfferKey = (prefix: BotFuelPrefix, offerId: string) => `${prefix}:fuel_offer:${offerId}`;
export const awaitingFuelOdometerKey = (prefix: BotFuelPrefix, userKey: string) =>
  `${prefix}:awaiting_fuel_odo:${userKey}`;

export interface FuelVehicleLike {
  id: string;
  name: string;
  fuelType: string;
}

/**
 * Which vehicle a scanned fill-up goes to — the app's `pickFuelVehicle` rule:
 * the account's only vehicle, else the one last used, else the one whose fuel
 * type matches the receipt's; still ambiguous → none, because a wrong guess
 * corrupts that car's consumption while a missing button is harmless.
 * "Last used" is the vehicle of the account's most recent fill-up.
 */
export function pickFuelVehicle<V extends FuelVehicleLike>(
  vehicles: V[],
  lastUsedVehicleId: string | null,
  fuel: Pick<ReceiptFuel, 'fuelType'>,
): V | null {
  if (vehicles.length === 0) return null;
  if (vehicles.length === 1) return vehicles[0];
  const remembered = lastUsedVehicleId ? vehicles.find((v) => v.id === lastUsedVehicleId) : undefined;
  if (remembered) return remembered;
  const sameType = vehicles.filter((v) => v.fuelType === fuel.fuelType);
  return sameType.length === 1 ? sameType[0] : null;
}

/**
 * A typed odometer reading in whole km, or null. Accepts `123456`, `123 456`,
 * `123.456`, `123,456` (thousands groups) and a trailing `km`/`км`; rejects a
 * decimal, zero and anything above `MAX_ODOMETER_KM`.
 */
export function parseOdometer(text: string): number | null {
  const cleaned = text
    .trim()
    .replace(/\s*(km|км)\.?$/i, '')
    .trim()
    // Any whitespace (a no-break or thin space as a thousands separator) reads as a space.
    .replace(/\s/g, ' ');
  if (!/^\d{1,3}([ .,]\d{3})*$|^\d+$/.test(cleaned)) return null;
  const n = Number(cleaned.replace(/\D/g, ''));
  if (!Number.isSafeInteger(n) || n <= 0 || n > MAX_ODOMETER_KM) return null;
  return n;
}

export interface FuelOffer {
  userId: string;
  accountId: string;
  /** Server PK of the saved expense the fill-up hangs on. */
  expenseId: string;
  vehicleId: string;
  vehicleName: string;
  litres: number;
  pricePerLitre: number;
  fuelType: ReceiptFuel['fuelType'];
  currencyCode: string;
}

type Translate = (key: string, lang: string | undefined, params?: Record<string, string>) => string;
const identity = (s: string) => s;
/** Keeps a long vehicle name from pushing the button past Telegram/Slack limits. */
const shortName = (name: string) => (name.length > 30 ? `${name.slice(0, 29)}…` : name);

/** The params every fuel-log message shares; `escape` is Telegram's HTML escaper (user text). */
export function fuelOfferParams(offer: FuelOffer, escape: (s: string) => string = identity): Record<string, string> {
  return {
    vehicle: escape(shortName(offer.vehicleName)),
    litres: String(offer.litres),
    price: `${offer.pricePerLitre.toFixed(2)} ${offer.currencyCode}`,
  };
}

/** The offer message under the saved receipt. */
export function buildFuelOfferText(
  offer: FuelOffer,
  translate: Translate,
  lang: string | undefined,
  escape: (s: string) => string = identity,
): string {
  return translate('fuelLogOffer', lang, fuelOfferParams(offer, escape));
}

/** The button label — full on Telegram/Slack, short on WhatsApp (20-character cap). */
export function buildFuelOfferButton(offer: FuelOffer, translate: Translate, lang: string | undefined, short = false): string {
  return short ? translate('fuelLogButtonShort', lang) : translate('fuelLogButton', lang, fuelOfferParams(offer));
}

/** The reply to a saved odometer reading. */
export function buildFuelSavedText(
  offer: FuelOffer,
  odometerKm: number,
  translate: Translate,
  lang: string | undefined,
  escape: (s: string) => string = identity,
): string {
  return translate('fuelLogSaved', lang, { ...fuelOfferParams(offer, escape), odometer: String(odometerKm) });
}

export type ArmFuelResult =
  | { status: 'armed'; offer: FuelOffer }
  | { status: 'expired' }
  /** Someone else's button (a Telegram group, a Slack channel): ignored. */
  | { status: 'not_owner' }
  | { status: 'viewer' };

export type FuelOdometerResult =
  /** Not in this mode (or the offer is gone): the message goes on to the AI chat. */
  | { status: 'idle' }
  | { status: 'invalid' }
  | { status: 'viewer' }
  | { status: 'failed' }
  | { status: 'saved'; offer: FuelOffer; odometerKm: number };

@Injectable()
export class BotReceiptFuelService {
  private readonly logger = new Logger(BotReceiptFuelService.name);

  constructor(
    private readonly vehicles: VehiclesService,
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /**
   * After a receipt with a `fuel` block was saved as an expense: the offer to
   * log it, or null when there is no fuel block or no vehicle resolves (then
   * the bot shows no button at all). Never throws — the expense is already
   * saved and a failure here must not read as a failed save.
   */
  async createOffer(
    prefix: BotFuelPrefix,
    params: { userId: string; accountId: string; expenseId: string; fuel: ReceiptFuel | null | undefined; currencyCode: string },
  ): Promise<{ offerId: string; offer: FuelOffer } | null> {
    const { fuel } = params;
    if (!fuel) return null;
    try {
      const [vehicles, lastUsed] = await Promise.all([
        this.vehicles.findAll(params.accountId),
        this.vehicles.lastFuelVehicleId(params.accountId),
      ]);
      const vehicle = pickFuelVehicle(vehicles, lastUsed, fuel);
      if (!vehicle) return null;
      const offer: FuelOffer = {
        userId: params.userId,
        accountId: params.accountId,
        expenseId: params.expenseId,
        vehicleId: vehicle.id,
        vehicleName: vehicle.name,
        litres: fuel.litres,
        pricePerLitre: fuel.pricePerLitre,
        fuelType: fuel.fuelType,
        currencyCode: params.currencyCode,
      };
      const offerId = randomUUID().slice(0, 8);
      await this.cache.set<FuelOffer>(fuelOfferKey(prefix, offerId), offer, FUEL_OFFER_TTL_SEC);
      return { offerId, offer };
    } catch (e) {
      this.logger.warn(`fuel-log offer failed: ${e}`);
      return null;
    }
  }

  /**
   * The button: arms the odometer prompt. `otherModeKeys` are the platform's
   * item-edit and date-edit keys for this user — cleared here, because the
   * typed-input modes are mutually exclusive.
   */
  async arm(
    prefix: BotFuelPrefix,
    userKey: string,
    offerId: string,
    userId: string,
    otherModeKeys: string[],
  ): Promise<ArmFuelResult> {
    const offer = await this.cache.get<FuelOffer>(fuelOfferKey(prefix, offerId));
    if (!offer) return { status: 'expired' };
    if (offer.userId !== userId) return { status: 'not_owner' };
    if (!(await this.canWrite(offer.accountId, offer.userId))) return { status: 'viewer' };
    if (otherModeKeys.length) await this.cache.del(...otherModeKeys);
    await this.cache.set(awaitingFuelOdometerKey(prefix, userKey), offerId, AWAITING_FUEL_ODOMETER_TTL_SEC);
    return { status: 'armed', offer };
  }

  /** "Skip": drops the offer, and the prompt if it is armed for this offer. */
  async skip(prefix: BotFuelPrefix, userKey: string, offerId: string, userId: string): Promise<boolean> {
    const offer = await this.cache.get<FuelOffer>(fuelOfferKey(prefix, offerId));
    if (offer && offer.userId !== userId) return false;
    await this.cache.del(fuelOfferKey(prefix, offerId));
    const modeKey = awaitingFuelOdometerKey(prefix, userKey);
    if ((await this.cache.get<string>(modeKey)) === offerId) await this.cache.del(modeKey);
    return true;
  }

  /**
   * A chat message while the prompt may be armed. A message with no digit at
   * all leaves the mode and goes on to the chat (`idle`): the user moved on,
   * and swallowing it would be the failure this mode must never cause. A
   * number that is not a valid reading keeps the mode for a retry.
   */
  async consumeOdometer(prefix: BotFuelPrefix, userKey: string, text: string): Promise<FuelOdometerResult> {
    const modeKey = awaitingFuelOdometerKey(prefix, userKey);
    const offerId = await this.cache.get<string>(modeKey);
    if (!offerId) return { status: 'idle' };
    const offer = await this.cache.get<FuelOffer>(fuelOfferKey(prefix, offerId));
    if (!offer) {
      await this.cache.del(modeKey);
      return { status: 'idle' };
    }
    if (!/\d/.test(text)) {
      await this.cache.del(modeKey);
      return { status: 'idle' };
    }
    const odometerKm = parseOdometer(text);
    if (odometerKm === null) return { status: 'invalid' };

    // Whatever happens next, the prompt is over.
    await this.cache.del(modeKey, fuelOfferKey(prefix, offerId));
    if (!(await this.canWrite(offer.accountId, offer.userId))) return { status: 'viewer' };
    try {
      await this.vehicles.upsertFuelLog(offer.accountId, offer.vehicleId, offer.expenseId, {
        liters: offer.litres,
        odometerKm,
        isFullTank: true,
      });
      return { status: 'saved', offer, odometerKm };
    } catch (e) {
      this.logger.warn(`bot fuel log write failed: ${e}`);
      return { status: 'failed' };
    }
  }

  /** Re-checked at every step: the role may have changed since the receipt was saved. */
  private async canWrite(accountId: string, userId: string): Promise<boolean> {
    const member = await this.prisma.accountMember.findFirst({
      where: { accountId, userId },
      select: { role: true },
    });
    return !!member && member.role !== 'viewer';
  }
}
