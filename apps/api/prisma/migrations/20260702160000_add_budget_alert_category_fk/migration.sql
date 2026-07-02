-- AddForeignKey
ALTER TABLE "budget_alerts" ADD CONSTRAINT "budget_alerts_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
