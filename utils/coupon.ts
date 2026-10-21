import { Coupon, type ICoupon } from "../models/coupon.model";
import { ApiError } from "./ApiError";

// Looks a coupon code up and works out what it takes off an order whose
// products add up to `subtotal` — or throws the reason it can't be used.
// Shared by the checkout preview and by order creation, so the customer is
// charged exactly what they were shown.
export const applyCoupon = async (
  rawCode: unknown,
  subtotal: number
): Promise<{ coupon: ICoupon; discount: number }> => {
  const code = String(rawCode ?? "").trim().toUpperCase();
  const coupon = code ? await Coupon.findOne({ code }) : null;

  if (!coupon || !coupon.isActive) {
    throw new ApiError(404, "Invalid coupon code");
  }
  if (coupon.expiresAt && coupon.expiresAt.getTime() < Date.now()) {
    throw new ApiError(400, "This coupon has expired");
  }
  if (subtotal < coupon.minOrderAmount) {
    throw new ApiError(
      400,
      `This coupon needs an order of at least ৳${coupon.minOrderAmount}`
    );
  }

  // Never more than the products themselves cost.
  const discount =
    coupon.discountType === "percent"
      ? Math.round((subtotal * coupon.discountValue) / 100)
      : Math.min(coupon.discountValue, subtotal);

  return { coupon, discount };
};
