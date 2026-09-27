export interface DigestInputs {
  currency: string;
  weekTotal: number; // last 7 days, base currency
  priorWeekTotals: number[]; // up to 8 previous 7-day windows, newest first; 0 for an empty week
  categoryWeek: { name: string; total: number }[]; // last 7 days by category
  categoryUsual: { name: string; total: number }[]; // mean per 7 days over the prior 8 windows
  safeToSpendToday: number | null;
  daysToIncome: number | null;
  shieldItem: { name: string; monthlyChangePct: number } | null;
  restockNames: string[];
  realChangePct: number | null;
}

export interface DigestFacts {
  currency: string;
  weekTotal: number;
  usualWeek: number | null; // null when fewer than 4 prior weeks had spending
  changePct: number | null; // week vs usual, integer percent
  topRise: { category: string; changePct: number } | null;
  safeToSpendToday: number | null;
  daysToIncome: number | null;
  shieldItem: { name: string; monthlyChangePct: number } | null;
  restock: string[]; // at most 3
  realChangePct: number | null;
}

function isFiniteNumber(v: number | null): boolean {
  return v !== null && Number.isFinite(v);
}

function roundToInteger(v: number): number {
  return Math.round(v);
}

function normalizeNegativeZero(v: number): number {
  // Normalize -0 to 0
  if (v === 0 && Object.is(v, -0)) {
    return 0;
  }
  return v;
}

export function assembleDigestFacts(i: DigestInputs): DigestFacts | null {
  // Rule: weekTotal <= 0 → null
  if (!isFiniteNumber(i.weekTotal) || i.weekTotal <= 0) {
    return null;
  }

  // Calculate usualWeek from prior weeks with spending > 0
  const activeWeeks = i.priorWeekTotals.filter((w) => isFiniteNumber(w) && w > 0);
  let usualWeek: number | null = null;
  let changePct: number | null = null;
  let topRise: { category: string; changePct: number } | null = null;

  if (activeWeeks.length >= 4) {
    const sum = activeWeeks.reduce((a, b) => a + b, 0);
    usualWeek = roundToInteger(sum / activeWeeks.length);

    // If rounded usualWeek is <= 0, treat as no usual week (avoid division by 0 and noise)
    if (usualWeek <= 0) {
      usualWeek = null;
      changePct = null;
      topRise = null;
    } else {
      changePct = normalizeNegativeZero(roundToInteger(((i.weekTotal / usualWeek - 1) * 100)));
    }
  }

  // Calculate topRise: largest positive change among qualifying categories
  if (usualWeek !== null && topRise === null) {
    const threshold5Percent = usualWeek * 0.05;
    let maxRise = 0;
    let maxCategory: string | null = null;

    for (const catUsual of i.categoryUsual) {
      // Skip if usual < 5% of usualWeek
      if (!isFiniteNumber(catUsual.total) || catUsual.total < threshold5Percent) {
        continue;
      }

      // Find this category's week total
      const catWeek = i.categoryWeek.find((c) => c.name === catUsual.name);
      if (!catWeek || !isFiniteNumber(catWeek.total)) {
        continue;
      }

      // Check if week total >= 1.2 * usual
      const minWeekThreshold = catUsual.total * 1.2;
      if (catWeek.total < minWeekThreshold) {
        continue;
      }

      // Calculate change percentage
      const changePctForCat = normalizeNegativeZero(roundToInteger((catWeek.total / catUsual.total - 1) * 100));

      // Track the maximum rise
      if (changePctForCat > maxRise) {
        maxRise = changePctForCat;
        maxCategory = catUsual.name;
      }
    }

    if (maxCategory !== null) {
      topRise = { category: maxCategory, changePct: maxRise };
    }
  }

  // Round and cap the rest
  const safeToSpendRounded = i.safeToSpendToday !== null && isFiniteNumber(i.safeToSpendToday)
    ? roundToInteger(i.safeToSpendToday)
    : null;

  const shieldItemRounded = i.shieldItem && isFiniteNumber(i.shieldItem.monthlyChangePct)
    ? {
        name: i.shieldItem.name,
        monthlyChangePct: normalizeNegativeZero(roundToInteger(i.shieldItem.monthlyChangePct)),
      }
    : null;

  const restockCapped = i.restockNames.slice(0, 3);

  const realChangePctRounded: number | null = i.realChangePct !== null && isFiniteNumber(i.realChangePct)
    ? normalizeNegativeZero(roundToInteger(i.realChangePct))
    : null;

  return {
    currency: i.currency,
    weekTotal: roundToInteger(i.weekTotal),
    usualWeek,
    changePct,
    topRise,
    safeToSpendToday: safeToSpendRounded,
    daysToIncome: i.daysToIncome,
    shieldItem: shieldItemRounded,
    restock: restockCapped,
    realChangePct: realChangePctRounded,
  };
}
