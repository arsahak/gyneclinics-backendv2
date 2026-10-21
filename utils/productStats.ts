import mongoose from "mongoose";
import { Order } from "../models/order.model";
import { Review } from "../models/review.model";

// What customers have actually done with a product — worked out from the
// reviews and orders themselves, so the storefront never shows made-up
// figures. A product nobody has reviewed or bought is simply 0 / 0 / 0.
export interface ProductStats {
  /** Mean of the approved reviews' ratings, to one decimal; 0 with none. */
  averageRating: number;
  /** Approved reviews. */
  reviewCount: number;
  /** Units ordered, across every order that wasn't cancelled. */
  soldCount: number;
}

const NO_STATS: ProductStats = { averageRating: 0, reviewCount: 0, soldCount: 0 };

/** The figures for a set of products, keyed by product id. */
export const getProductStats = async (
  productIds: mongoose.Types.ObjectId[],
): Promise<Map<string, ProductStats>> => {
  const stats = new Map<string, ProductStats>();
  if (productIds.length === 0) return stats;

  const [reviews, sales] = await Promise.all([
    Review.aggregate<{ _id: unknown; averageRating: number; count: number }>([
      { $match: { product: { $in: productIds }, status: "approved" } },
      {
        $group: {
          _id: "$product",
          averageRating: { $avg: "$rating" },
          count: { $sum: 1 },
        },
      },
    ]),
    Order.aggregate<{ _id: unknown; sold: number }>([
      {
        $match: {
          orderStatus: { $ne: "cancelled" },
          "items.product": { $in: productIds },
        },
      },
      { $unwind: "$items" },
      { $match: { "items.product": { $in: productIds } } },
      { $group: { _id: "$items.product", sold: { $sum: "$items.quantity" } } },
    ]),
  ]);

  const entry = (id: unknown) => {
    const key = String(id);
    if (!stats.has(key)) stats.set(key, { ...NO_STATS });
    return stats.get(key) as ProductStats;
  };
  for (const review of reviews) {
    const target = entry(review._id);
    target.averageRating = Number(review.averageRating.toFixed(1));
    target.reviewCount = review.count;
  }
  for (const sale of sales) entry(sale._id).soldCount = sale.sold;

  return stats;
};

/**
 * Products as plain objects with their real rating, review count and units
 * sold added (`averageRating`, `reviewCount`, `soldCount`).
 */
export const withProductStats = async <
  T extends { _id: unknown; toJSON: () => Record<string, unknown> },
>(
  products: T[],
) => {
  const stats = await getProductStats(
    products.map(
      (product) => new mongoose.Types.ObjectId(String(product._id)),
    ),
  );
  return products.map((product) => ({
    ...product.toJSON(),
    ...(stats.get(String(product._id)) ?? NO_STATS),
  }));
};
