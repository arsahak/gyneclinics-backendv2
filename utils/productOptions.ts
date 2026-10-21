// Size + color options for a product. Both arrive from the dashboard as JSON
// strings inside multipart form data, so parsing and validation live here and
// are shared by the request validator and the controller.

export const MAX_PRODUCT_SIZES = 30;
export const MAX_PRODUCT_COLORS = 30;
export const MAX_SIZE_LENGTH = 20;
export const MAX_COLOR_NAME_LENGTH = 40;
/** Each color has a single photo of the product in that color. */
export const MAX_IMAGES_PER_COLOR = 1;
/** Cap on color photos in one create/update request: one per color. */
export const MAX_COLOR_IMAGE_UPLOADS = MAX_PRODUCT_COLORS * MAX_IMAGES_PER_COLOR;
export const MAX_COLOR_IMAGE_BYTES = 5 * 1024 * 1024;

export const HEX_COLOR_REGEX = /^#[0-9a-f]{6}$/;

/** A color as sent by the client. */
export interface ProductColorInput {
  /** Display name the shopper sees, e.g. "Navy Blue". */
  name: string;
  /** Swatch color as lowercase #rrggbb. */
  hex: string;
  /** Which of the product's sizes this color comes in. */
  sizes: string[];
  /**
   * Already-uploaded image URLs the client wants this color to keep (edit
   * only). New photos arrive as files — see groupColorImageFiles.
   */
  images: string[];
}

/** A color as stored on the product. */
export interface ProductColorOption extends ProductColorInput {
  /** Parallel to `images` — each one's storage key, for deletion. */
  imageKeys: string[];
}

export interface ProductOptions {
  sizes: string[];
  colors: ProductColorInput[];
}

/**
 * A size that costs more or less than the product's base price. The
 * adjustment is added to both `price` and `discountPrice` — positive for a
 * dearer size, negative for a cheaper one. Sizes without an entry cost the
 * base price.
 */
export interface ProductSizePrice {
  size: string;
  adjustment: number;
}

export const MAX_SIZE_PRICE_ADJUSTMENT = 10_000_000;

// Multipart fields are strings; JSON API callers may send real arrays.
const parseArray = (raw: unknown, field: string): unknown[] => {
  if (raw === undefined || raw === null || raw === "") return [];
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error(`${field} must be a valid JSON array`);
    }
  }
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return value;
};

// Trims, drops blanks, and removes case-insensitive duplicates ("xl" / "XL")
// while keeping the first spelling and the given order.
const cleanSizes = (values: unknown[], field: string): string[] => {
  const seen = new Set<string>();
  const sizes: string[] = [];
  for (const value of values) {
    if (typeof value !== "string" && typeof value !== "number") {
      throw new Error(`${field} must contain only text or numbers`);
    }
    const size = String(value).trim().replace(/\s+/g, " ");
    if (!size) continue;
    if (size.length > MAX_SIZE_LENGTH) {
      throw new Error(
        `Size "${size}" is too long (max ${MAX_SIZE_LENGTH} characters)`
      );
    }
    const key = size.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    sizes.push(size);
  }
  return sizes;
};

// Accepts #rgb or #rrggbb in any case; returns lowercase #rrggbb.
const cleanHex = (raw: unknown, colorName: string): string => {
  let hex = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (/^#[0-9a-f]{3}$/.test(hex)) {
    hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  if (!HEX_COLOR_REGEX.test(hex)) {
    throw new Error(
      `Color "${colorName}" needs a valid hex value like #1a2b3c`
    );
  }
  return hex;
};

/**
 * Parses and normalizes the `sizes` / `colors` request fields.
 *
 * `sizes` is the product's master size list. Each color lists the sizes it's
 * available in; any size named only on a color is added to the master list,
 * so the two can never disagree. Throws an Error with a user-facing message
 * when the input is malformed.
 */
export const normalizeProductOptions = (
  rawSizes: unknown,
  rawColors: unknown
): ProductOptions => {
  const sizes = cleanSizes(parseArray(rawSizes, "sizes"), "sizes");
  const sizeByKey = new Map(sizes.map((size) => [size.toLowerCase(), size]));

  const seenNames = new Set<string>();
  // An uploaded image belongs to one color only.
  const claimedImages = new Set<string>();
  const colors: ProductColorInput[] = parseArray(rawColors, "colors").map(
    (entry, index) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new Error(`Color #${index + 1} is not a valid color`);
      }
      const {
        name: rawName,
        hex: rawHex,
        sizes: rawColorSizes,
        images: rawImages,
      } = entry as {
        name?: unknown;
        hex?: unknown;
        sizes?: unknown;
        images?: unknown;
      };

      const name =
        typeof rawName === "string" ? rawName.trim().replace(/\s+/g, " ") : "";
      if (!name) throw new Error(`Color #${index + 1} needs a name`);
      if (name.length > MAX_COLOR_NAME_LENGTH) {
        throw new Error(
          `Color name "${name}" is too long (max ${MAX_COLOR_NAME_LENGTH} characters)`
        );
      }
      if (seenNames.has(name.toLowerCase())) {
        throw new Error(`Color "${name}" is listed more than once`);
      }
      seenNames.add(name.toLowerCase());

      const colorSizes = cleanSizes(
        parseArray(rawColorSizes, `Sizes for color "${name}"`),
        `Sizes for color "${name}"`
      ).map((size) => {
        // Reuse the master list's spelling; register sizes it didn't have.
        const key = size.toLowerCase();
        const known = sizeByKey.get(key);
        if (known) return known;
        sizeByKey.set(key, size);
        sizes.push(size);
        return size;
      });

      const images: string[] = [];
      for (const url of parseArray(rawImages, `Images for color "${name}"`)) {
        if (typeof url !== "string" || !url.trim()) {
          throw new Error(`Images for color "${name}" must be image URLs`);
        }
        if (claimedImages.has(url)) continue;
        claimedImages.add(url);
        images.push(url);
      }

      return { name, hex: cleanHex(rawHex, name), sizes: colorSizes, images };
    }
  );

  if (sizes.length > MAX_PRODUCT_SIZES) {
    throw new Error(`A product can have at most ${MAX_PRODUCT_SIZES} sizes`);
  }
  if (colors.length > MAX_PRODUCT_COLORS) {
    throw new Error(`A product can have at most ${MAX_PRODUCT_COLORS} colors`);
  }

  return { sizes, colors };
};

/**
 * Sorts the uploaded color photos into one list per color.
 *
 * Multipart can't nest files under a color, so they all arrive in a single
 * `colorImages` field alongside `colorImageIndexes` — a JSON array the same
 * length as the files, where entry i is the index (in `colors`) of the color
 * file i belongs to. Throws an Error with a user-facing message when the two
 * don't line up.
 */
export const groupColorImageFiles = <F extends { size: number }>(
  files: F[],
  rawIndexes: unknown,
  colorCount: number
): F[][] => {
  const groups: F[][] = Array.from({ length: colorCount }, () => []);
  if (files.length === 0) return groups;

  if (files.length > MAX_COLOR_IMAGE_UPLOADS) {
    throw new Error(
      `You can upload at most ${MAX_COLOR_IMAGE_UPLOADS} color images at once`
    );
  }

  const indexes = parseArray(rawIndexes, "colorImageIndexes");
  if (indexes.length !== files.length) {
    throw new Error("Each color image must say which color it belongs to");
  }

  files.forEach((file, i) => {
    const index = Number(indexes[i]);
    if (!Number.isInteger(index) || index < 0 || index >= colorCount) {
      throw new Error("A color image was sent for a color that doesn't exist");
    }
    if (file.size > MAX_COLOR_IMAGE_BYTES) {
      throw new Error("Each color image must be 5MB or smaller");
    }
    groups[index].push(file);
  });

  return groups;
};

/**
 * Parses the `sizePrices` request field (a JSON array of
 * `{ size, adjustment }`) and checks its shape. Entries with a zero
 * adjustment are dropped — "same price" is simply the absence of an entry.
 * Throws an Error with a user-facing message when the input is malformed.
 */
export const parseSizePrices = (rawSizePrices: unknown): ProductSizePrice[] => {
  const seen = new Set<string>();
  const sizePrices: ProductSizePrice[] = [];

  for (const entry of parseArray(rawSizePrices, "sizePrices")) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("Each size price needs a size and an amount");
    }
    const { size: rawSize, adjustment: rawAdjustment } = entry as {
      size?: unknown;
      adjustment?: unknown;
    };

    const size =
      typeof rawSize === "string" || typeof rawSize === "number"
        ? String(rawSize).trim().replace(/\s+/g, " ")
        : "";
    if (!size) throw new Error("Each size price needs a size");

    const adjustment =
      typeof rawAdjustment === "string" && rawAdjustment.trim() !== ""
        ? Number(rawAdjustment)
        : rawAdjustment;
    if (typeof adjustment !== "number" || !Number.isFinite(adjustment)) {
      throw new Error(`The price difference for size "${size}" must be a number`);
    }
    if (Math.abs(adjustment) > MAX_SIZE_PRICE_ADJUSTMENT) {
      throw new Error(`The price difference for size "${size}" is too large`);
    }

    const key = size.toLowerCase();
    if (seen.has(key)) {
      throw new Error(`Size "${size}" has more than one price difference`);
    }
    seen.add(key);

    // Money: keep two decimals at most.
    const rounded = Math.round(adjustment * 100) / 100;
    if (rounded !== 0) sizePrices.push({ size, adjustment: rounded });
  }

  return sizePrices;
};

/**
 * `parseSizePrices`, then keeps only entries for sizes the product actually
 * has (using the size list's spelling) — a price for a removed size is
 * silently dropped rather than rejected.
 */
export const normalizeSizePrices = (
  rawSizePrices: unknown,
  sizes: string[]
): ProductSizePrice[] => {
  const sizeByKey = new Map(sizes.map((size) => [size.toLowerCase(), size]));
  return parseSizePrices(rawSizePrices).flatMap(({ size, adjustment }) => {
    const known = sizeByKey.get(size.toLowerCase());
    return known ? [{ size: known, adjustment }] : [];
  });
};
