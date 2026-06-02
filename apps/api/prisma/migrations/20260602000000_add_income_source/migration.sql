-- AlterTable: add source column to incomes
ALTER TABLE "incomes" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'manual';
