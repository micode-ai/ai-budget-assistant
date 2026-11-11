/** The OCR prompt's canonicalName rules, shared with leaflet reading so both name products the same way. */
export const CANONICAL_NAME_RULES = `canonicalName rules — brand/product name with size discriminators, for price-history tracking across purchases:
- KEEP: weight/volume per single unit (500g, 1L, 250ml, 130g), fat/alcohol/content percentage (3,2%, 4,7%), flavour/variant descriptors (Truskawkowy, Naturalny)
- STRIP: pack-quantity multipliers (6SZT, ×6, 4×, 4x130G — but extract the unit "130g" from it), product codes, PLU numbers
- canonicalName examples:
  "MLEKO 3,2% ŁACIATE 1L 6SZT"       → "Mleko Łaciate 3,2% 1L"     (keep fat% + volume, strip 6SZT)
  "CHLEB RAZOWY WIEJSKI 500G"         → "Chleb Razowy Wiejski 500g"  (keep weight)
  "PIWO TYSKIE 0,5L 4,7%"            → "Tyskie 0,5l 4,7%"           (keep volume + alcohol%)
  "SERK DANIO TRUSKAWKOWY 4×130G"    → "Danio Truskawkowy 130g"      (extract per-unit size from multiplier)
  "JOGURT ACTIVIA BRZOSKWINIA 150G"  → "Activia Brzoskwinia 150g"
- Use title case (first letter of each word capitalised)`;
