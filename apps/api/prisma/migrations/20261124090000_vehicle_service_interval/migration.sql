-- Service every N km: the interval and the odometer at the last service.
ALTER TABLE "vehicles" ADD COLUMN "service_interval_km" INTEGER;
ALTER TABLE "vehicles" ADD COLUMN "last_service_km" INTEGER;
