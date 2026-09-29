-- Shopping list item price: price per unit the user types in, in the account currency.
ALTER TABLE "shopping_list_items" ADD COLUMN "unit_price" DECIMAL(12,2);
