-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN "next_insurance_date" DATE,
ADD COLUMN "next_inspection_date" DATE,
ADD COLUMN "next_service_date" DATE,
ADD COLUMN "next_service_odometer" INTEGER,
ADD COLUMN "service_odometer_nudged_for" INTEGER;
