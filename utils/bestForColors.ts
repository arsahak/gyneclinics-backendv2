// The background gradients a Best For entry's card can have — the same
// twelve the storefront's homepage "shop by need" cards are drawn with, each
// running top-left → bottom-right. The dashboard offers these to pick from
// (it keeps its own copy in lib/bestForColors.ts — keep the two the same).
export const BEST_FOR_COLOR_PAIRS: [from: string, to: string][] = [
  ["#ff7aa2", "#d10043"],
  ["#ff0052", "#7a0030"],
  ["#f59e7a", "#b4375a"],
  ["#9d4edd", "#3c096c"],
  ["#5ec4c0", "#1f6f78"],
  ["#6b7280", "#1d1d1b"],
  ["#ff4d86", "#1d1d1b"],
  ["#e0b354", "#8a5a00"],
  ["#b08968", "#5e3a1e"],
  ["#64748b", "#1e293b"],
  ["#f9a8d4", "#db2777"],
  ["#ff7aa2", "#ff0052"],
];

// The icon a card shows when it has no picture: the name of one of the
// storefront's icons (the list the dashboard's icon pickers offer). This one
// stands in for an entry that was never given its own.
export const DEFAULT_BEST_FOR_ICON = "sparkles";
export const BEST_FOR_ICON_NAME = /^[a-z0-9-]{1,40}$/;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export const isBestForColorPair = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length === 2 &&
  value.every((color) => typeof color === "string" && HEX_COLOR.test(color));

/** One of the gradients, picked at random — what a new entry gets by default. */
export const randomBestForColors = (): string[] => [
  ...BEST_FOR_COLOR_PAIRS[
    Math.floor(Math.random() * BEST_FOR_COLOR_PAIRS.length)
  ],
];

/**
 * One of the gradients, always the same one for the same key — for entries
 * saved before colors existed, so each still shows a steady color.
 */
export const bestForColorsFor = (key: string): string[] => {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return [...BEST_FOR_COLOR_PAIRS[hash % BEST_FOR_COLOR_PAIRS.length]];
};

/**
 * Reads the form's `colors` field — a JSON-encoded pair of #rrggbb colors,
 * gradient start then end — into a lowercase pair. Returns undefined when
 * the field wasn't sent; throws an Error, whose message is fit to show, when
 * it is malformed.
 */
export const parseBestForColors = (raw: unknown): string[] | undefined => {
  if (raw === undefined || raw === null || raw === "") return undefined;

  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("colors must be a JSON-encoded pair of #rrggbb colors");
    }
  }
  if (!isBestForColorPair(parsed)) {
    throw new Error("colors must be a pair of #rrggbb colors");
  }
  return parsed.map((color) => color.toLowerCase());
};
