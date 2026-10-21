import mongoose from "mongoose";
import { BestFor } from "../models/bestFor.model";
import { ApiError } from "./ApiError";

// The most Best For options one product can be tagged with.
export const MAX_PRODUCT_BEST_FOR = 30;

/**
 * Reads the product form's `bestFor` field into a list of ids, each once.
 * The field arrives in a multipart body, so it is a JSON-encoded array of
 * option ids ("[]" to clear them). Returns undefined when the field wasn't
 * sent at all; throws an Error, whose message is fit to show, when it is
 * malformed.
 */
export const parseBestForIds = (raw: unknown): string[] | undefined => {
  if (raw === undefined || raw === null || raw === "") return undefined;

  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("bestFor must be a JSON-encoded array of ids");
    }
  }
  if (!Array.isArray(parsed)) {
    throw new Error("bestFor must be a JSON-encoded array of ids");
  }

  const ids = [...new Set(parsed.map((id) => String(id)))];
  if (ids.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
    throw new Error("bestFor contains an invalid id");
  }
  if (ids.length > MAX_PRODUCT_BEST_FOR) {
    throw new Error(
      `A product can have at most ${MAX_PRODUCT_BEST_FOR} Best For options`,
    );
  }
  return ids;
};

/**
 * Checks that every id is a Best For option that exists — a group can't be
 * put on a product — and returns them as ObjectIds.
 */
export const resolveBestForOptions = async (
  ids: string[],
): Promise<mongoose.Types.ObjectId[]> => {
  if (ids.length === 0) return [];

  const found = await BestFor.find(
    { _id: { $in: ids } },
    { _id: 1, parent: 1 },
  ).lean();
  if (found.length !== ids.length) {
    throw new ApiError(422, "A Best For option was not found");
  }
  if (found.some((entry) => !entry.parent)) {
    throw new ApiError(
      422,
      "Pick Best For options, not the groups they belong to",
    );
  }
  return ids.map((id) => new mongoose.Types.ObjectId(id));
};

/**
 * How a product's Best For options are filled in when it is read: each with
 * its name and slug, and its group's.
 */
export const BEST_FOR_POPULATE = {
  path: "bestFor",
  select: "name slug parent icon image colors isActive sortOrder",
  populate: { path: "parent", select: "name slug isActive sortOrder" },
};

/**
 * What a product listing filtered by a Best For entry looks for: the entry
 * itself and, when it is a group, every option in it — so "Skin Type" lists
 * the products tagged Dry, Oily and the rest.
 */
export const bestForWithOptions = async (
  id: string,
): Promise<mongoose.Types.ObjectId[]> => {
  const options = await BestFor.find({ parent: id }, { _id: 1 }).lean();
  return [
    new mongoose.Types.ObjectId(id),
    ...options.map((option) => option._id as mongoose.Types.ObjectId),
  ];
};
