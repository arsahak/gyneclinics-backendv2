// Pricing regions, same as the webapp (webapp/lib/locale/regions.ts). Used to
// send an announcement to one region, from each user's stored country.

export const REGION_NAMES = {
  europe: "Europe & UK",
  north_america: "North America",
  middle_east: "Middle East",
  asia_pacific: "East Asia & Pacific",
  latin_america: "Latin America",
  africa: "Africa",
  south_asia: "South Asia",
} as const;
export type RegionId = keyof typeof REGION_NAMES;
export const REGION_IDS = Object.keys(REGION_NAMES) as RegionId[];

export const COUNTRY_REGION: Record<RegionId, string[]> = {
  europe: [
    "GB", "IE", "FR", "DE", "ES", "PT", "IT", "NL", "BE", "LU", "CH", "AT", "DK", "SE", "NO",
    "FI", "IS", "PL", "CZ", "SK", "HU", "SI", "HR", "RO", "BG", "GR", "CY", "MT", "EE", "LV",
    "LT", "RS", "BA", "ME", "MK", "AL", "XK", "MD", "UA", "BY", "RU", "MC", "LI", "AD", "SM",
    "VA", "GI", "IM", "JE", "GG",
  ],
  north_america: ["US", "CA", "PR", "BM", "GL"],
  latin_america: [
    "MX", "GT", "BZ", "SV", "HN", "NI", "CR", "PA", "CU", "DO", "HT", "JM", "TT", "BS", "BB",
    "CO", "VE", "EC", "PE", "BO", "BR", "PY", "UY", "AR", "CL", "GY", "SR",
  ],
  middle_east: ["AE", "SA", "QA", "KW", "BH", "OM", "YE", "IQ", "IR", "JO", "LB", "SY", "IL", "PS", "TR", "EG"],
  africa: [
    "NG", "GH", "KE", "UG", "TZ", "RW", "ET", "SO", "SD", "SS", "ZA", "ZW", "ZM", "MW", "MZ",
    "BW", "NA", "AO", "CD", "CG", "CM", "CI", "SN", "ML", "BF", "NE", "TD", "GN", "SL", "LR",
    "TG", "BJ", "GA", "MG", "MU", "MA", "DZ", "TN", "LY", "ER", "DJ", "LS", "SZ", "GM", "CV",
  ],
  south_asia: ["BD", "IN", "PK", "LK", "NP", "BT", "MV", "AF"],
  asia_pacific: [
    "CN", "HK", "MO", "TW", "JP", "KR", "MN", "SG", "MY", "TH", "VN", "PH", "ID", "KH", "LA",
    "MM", "BN", "TL", "AU", "NZ", "FJ", "PG", "KZ", "UZ", "KG", "TJ", "TM", "AZ", "GE", "AM",
  ],
};

export function regionOfCountry(country?: string): RegionId | null {
  if (!country) return null;
  const code = country.toUpperCase();
  return REGION_IDS.find((id) => COUNTRY_REGION[id].includes(code)) ?? null;
}

/** Fixed rate used to show the UK fee in USD. Not a live exchange rate. Same as the webapp. */
export const GBP_TO_USD = 1.3;

// Prices per region. A doctor's fee is set in GBP (the UK price); each region
// pays a share of it (the multiplier, set in Fees & Commission) in its currency.
export const REGION_PRICING: Record<RegionId, { currency: "GBP" | "USD"; multiplier: number }> = {
  europe: { currency: "GBP", multiplier: 1 },
  north_america: { currency: "USD", multiplier: 1 },
  middle_east: { currency: "USD", multiplier: 0.8 },
  asia_pacific: { currency: "USD", multiplier: 0.6 },
  latin_america: { currency: "USD", multiplier: 0.45 },
  africa: { currency: "USD", multiplier: 0.35 },
  south_asia: { currency: "USD", multiplier: 0.25 },
};

export type RegionMultipliers = Record<RegionId, number>;

/** The built-in multipliers, used until the team changes them. */
export const DEFAULT_MULTIPLIERS = Object.fromEntries(REGION_IDS.map((id) => [id, REGION_PRICING[id].multiplier])) as RegionMultipliers;

/** What a patient in this region pays: a whole number in the region's currency (0 = free). */
export function regionalFee(feeGBP: number, regionId: RegionId, multipliers: RegionMultipliers = DEFAULT_MULTIPLIERS): { amount: number; currency: "GBP" | "USD" } {
  const { currency } = REGION_PRICING[regionId];
  const multiplier = multipliers[regionId] ?? REGION_PRICING[regionId].multiplier;
  if (feeGBP <= 0) return { amount: 0, currency };
  const inCurrency = currency === "GBP" ? feeGBP * multiplier : feeGBP * GBP_TO_USD * multiplier;
  return { amount: Math.max(1, Math.round(inCurrency)), currency };
}
