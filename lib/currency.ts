const RATES_URL = 'https://api.frankfurter.dev/v1/latest?from=USD';
const CACHE_TTL = 24 * 60 * 60 * 1000;

let cachedRates: Record<string, number> | null = null;
let cachedAt = 0;

export async function getExchangeRates(): Promise<Record<string, number>> {
  if (cachedRates && Date.now() - cachedAt < CACHE_TTL) {
    return cachedRates;
  }

  try {
    const res = await fetch(RATES_URL);
    const data = await res.json();
    cachedRates = data.rates as Record<string, number>;
    cachedAt = Date.now();
    return cachedRates;
  } catch {
    return cachedRates ?? {};
  }
}

export function convertToUsd(
  amount: number,
  fromCurrency: string,
  rates: Record<string, number>,
): number | null {
  if (fromCurrency === 'USD') return amount;
  const rate = rates[fromCurrency];
  if (!rate) return null;
  return Math.round((amount / rate) * 100) / 100;
}
