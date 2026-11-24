import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import * as vi18n from '../notifications/vehicle-renewal-i18n';
import { paginateById } from '../../common/utils/paginate';
import { logFireAndForget } from '../../common/utils/fire-and-forget';
import { dueRenewals, odometerNudgeDue } from './vehicle-renewal.util';
import { serviceForecast, serviceTargetKm } from './service-interval.util';

const BATCH_SIZE = 500;

/** Daily push 14 and 2 days before a vehicle's insurance, inspection or service date, plus an odometer nudge (ABA-827). */
@Injectable()
export class VehicleRenewalCron {
  private readonly logger = new Logger(VehicleRenewalCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('0 8 * * *')
  async run(): Promise<void> {
    const today = new Date();
    const pages = paginateById(
      (cursor) =>
        this.prisma.vehicle.findMany({
          where: {
            isDeleted: false,
            OR: [
              { nextInsuranceDate: { not: null } },
              { nextInspectionDate: { not: null } },
              { nextServiceDate: { not: null } },
              { nextServiceOdometer: { not: null } },
              { serviceIntervalKm: { not: null }, lastServiceKm: { not: null } },
            ],
          },
          select: {
            id: true,
            userId: true,
            name: true,
            nextInsuranceDate: true,
            nextInspectionDate: true,
            nextServiceDate: true,
            nextServiceOdometer: true,
            serviceIntervalKm: true,
            lastServiceKm: true,
            serviceOdometerNudgedFor: true,
          },
          take: BATCH_SIZE,
          orderBy: { id: 'asc' },
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        }),
      BATCH_SIZE,
    );

    let sent = 0;
    for await (const vehicles of pages) {
      const latest = await this.prisma.fuelLog.groupBy({
        by: ['vehicleId'],
        where: { vehicleId: { in: vehicles.map((v) => v.id) }, expense: { isDeleted: false } },
        _max: { odometerKm: true },
      });
      const kmByVehicle = new Map(latest.map((r) => [r.vehicleId, r._max.odometerKm]));
      // Interval vehicles are nudged on the estimated mileage, which needs the readings' dates.
      const intervalIds = vehicles.filter((v) => v.serviceIntervalKm != null && v.lastServiceKm != null).map((v) => v.id);
      const logs = intervalIds.length
        ? await this.prisma.fuelLog.findMany({
            where: { vehicleId: { in: intervalIds }, expense: { isDeleted: false } },
            select: { vehicleId: true, odometerKm: true, expense: { select: { date: true } } },
          })
        : [];

      for (const v of vehicles) {
        const { id, userId, name } = v;
        for (const { kind, days } of dueRenewals(v, today)) {
          sent++;
          this.notifications
            .sendToUser(
              userId,
              (lang) => vi18n.vehicleRenewalTitle(lang, { name, kind, days }),
              (lang) => vi18n.vehicleRenewalBody(lang, { kind }),
              { vehicleId: id, renewalKind: kind },
              'subscription_renewal',
            )
            .catch(logFireAndForget(this.logger, 'VehicleRenewalCron.sendToUser#date'));
        }

        let km = kmByVehicle.get(id) ?? null;
        const target = serviceTargetKm({
          intervalKm: v.serviceIntervalKm,
          lastServiceKm: v.lastServiceKm,
          legacyTargetKm: v.nextServiceOdometer,
        });
        if (v.serviceIntervalKm != null && v.lastServiceKm != null) {
          const f = serviceForecast({
            intervalKm: v.serviceIntervalKm,
            lastServiceKm: v.lastServiceKm,
            legacyTargetKm: v.nextServiceOdometer,
            readings: logs.filter((l) => l.vehicleId === id).map((l) => ({ date: l.expense.date, odometerKm: l.odometerKm })),
            today,
          });
          km = f ? f.estimatedKm : km;
        }
        if (target != null && odometerNudgeDue(target, km, v.serviceOdometerNudgedFor)) {
          // Stamp first: a lost push is better than a daily repeat.
          await this.prisma.vehicle.update({ where: { id }, data: { serviceOdometerNudgedFor: target } });
          const left = Math.max(0, target - (km ?? target));
          sent++;
          this.notifications
            .sendToUser(
              userId,
              (lang) => vi18n.vehicleServiceOdometerTitle(lang, { name }),
              (lang) => vi18n.vehicleServiceOdometerBody(lang, { km: left }),
              { vehicleId: id, renewalKind: 'service' },
              'subscription_renewal',
            )
            .catch(logFireAndForget(this.logger, 'VehicleRenewalCron.sendToUser#odometer'));
        }
      }
    }
    this.logger.log(`vehicle renewal reminders: ${sent} sent`);
  }
}
