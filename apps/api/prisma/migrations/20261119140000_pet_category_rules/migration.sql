-- ABA-833: a pet's category rules and who set each pet cost.
ALTER TABLE "pets" ADD COLUMN "category_rules" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "pet_costs" ADD COLUMN "source" TEXT;
