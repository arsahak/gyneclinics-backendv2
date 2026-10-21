import type { ProductColorOption, ProductSizePrice } from "./productOptions";

/** The product fields needed to price and check an ordered variation. */
export interface VariantProduct {
  title: string;
  price: number;
  discountPrice?: number | null;
  featureImage: string;
  sizes: string[];
  colors: ProductColorOption[];
  sizePrices: ProductSizePrice[];
}

export interface ResolvedVariant {
  /** The color's name as stored on the product, or "" when none applies. */
  color: string;
  /** The size as stored on the product, or "" when none applies. */
  size: string;
  /** Unit price for this variation (base price ± the size's adjustment). */
  price: number;
  /** The chosen color's photo when it has one, else the feature image. */
  image: string;
}

const clean = (value: unknown): string =>
  typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";

const sameText = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Checks an ordered color/size against what the product actually offers and
 * works out its price. The price always comes from the product here — never
 * from the client.
 *
 * With `requireChoice` (storefront checkout) a product that has colors or
 * sizes must have them chosen. Without it (staff-entered orders) they may be
 * left out, and the item is then priced at the base price.
 *
 * Throws an Error with a customer-facing message when the choice isn't valid.
 */
export const resolveOrderVariant = (
  product: VariantProduct,
  rawColor: unknown,
  rawSize: unknown,
  { requireChoice }: { requireChoice: boolean }
): ResolvedVariant => {
  const wantedColor = clean(rawColor);
  const wantedSize = clean(rawSize);
  const colors = product.colors ?? [];

  let color: ProductColorOption | undefined;
  if (wantedColor) {
    color = colors.find((option) => sameText(option.name, wantedColor));
    if (!color) {
      throw new Error(
        `"${product.title}" is not available in ${wantedColor}. Please choose again.`
      );
    }
  } else if (colors.length > 0 && requireChoice) {
    throw new Error(`Please choose a color for "${product.title}".`);
  }

  // A chosen color narrows the sizes to the ones it comes in.
  const offeredSizes = color ? color.sizes : (product.sizes ?? []);
  let size = "";
  if (wantedSize) {
    const match = offeredSizes.find((option) => sameText(option, wantedSize));
    if (!match) {
      throw new Error(
        color
          ? `"${product.title}" in ${color.name} is not available in size ${wantedSize}. Please choose again.`
          : `"${product.title}" is not available in size ${wantedSize}. Please choose again.`
      );
    }
    size = match;
  } else if (offeredSizes.length > 0 && requireChoice) {
    throw new Error(`Please choose a size for "${product.title}".`);
  }

  const base = product.discountPrice ?? product.price;
  const adjustment = size
    ? (product.sizePrices ?? []).find((entry) => sameText(entry.size, size))
        ?.adjustment ?? 0
    : 0;

  return {
    color: color?.name ?? "",
    size,
    price: Math.max(0, Math.round((base + adjustment) * 100) / 100),
    image: color?.images?.[0] || product.featureImage,
  };
};
