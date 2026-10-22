import type { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../middleware/asyncHandler";
import { Content, type IContent } from "../models/content.model";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { cleanContentHtml, contentExcerpt, estimateReadTime } from "../utils/contentHtml";

const SORTS: Record<string, Record<string, 1 | -1>> = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  title_asc: { title: 1 },
  title_desc: { title: -1 },
};

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** "What is a “normal” cycle?" → "what-is-a-normal-cycle" */
const slugify = (title: string) =>
  title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "") || "article";

/** A slug no other content uses: "title", then "title-2", "title-3", … */
export async function uniqueSlug(title: string) {
  const base = slugify(title);
  const taken = new Set(
    (await Content.find({ slug: new RegExp(`^${escapeRegex(base)}(-\\d+)?$`) }).distinct("slug")) as string[]
  );
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

async function contentOr404(id: string) {
  const content = await Content.findById(id);
  if (!content) throw new ApiError(404, "Content not found");
  return content;
}

const withAuthor = (id: unknown) => Content.findById(id).populate("author", "fullName").populate("updatedBy", "fullName");

/** Applies body fields to a content item (not saved). Cleans the HTML and keeps excerpt / read time in step. */
function applyFields(content: IContent, b: Record<string, unknown>) {
  if (b.title !== undefined) content.title = String(b.title).trim();
  if (b.format !== undefined) content.set("format", b.format);
  if (b.imageUrl !== undefined) content.imageUrl = b.imageUrl ? String(b.imageUrl).trim() : undefined;
  if (b.category !== undefined) content.set("category", String(b.category).trim());
  if (b.authorName !== undefined) content.authorName = String(b.authorName).trim() || "GyneClinics Editorial Team";
  if (b.authorRole !== undefined) content.authorRole = String(b.authorRole).trim();
  if (b.visibility !== undefined) content.set("visibility", b.visibility);
  if (b.sponsored !== undefined) content.sponsored = Boolean(b.sponsored);
  if (b.sponsorName !== undefined) content.sponsorName = b.sponsorName ? String(b.sponsorName).trim() : undefined;

  if (b.body !== undefined) {
    const html = cleanContentHtml(String(b.body));
    if (!contentExcerpt(html) && !/<img/i.test(html)) throw new ApiError(422, "Write the content");
    content.body = html;
  }
  // A written summary is kept; an empty one goes back to the start of the body.
  if (typeof b.excerpt === "string" && b.excerpt.trim()) {
    content.excerpt = b.excerpt.trim();
    content.excerptEstimated = false;
  } else if (b.excerpt !== undefined) {
    content.excerptEstimated = true;
  }
  if (content.excerptEstimated) content.excerpt = contentExcerpt(content.body);
  if (typeof b.readTimeMinutes === "number") {
    content.readTimeMinutes = b.readTimeMinutes;
    content.readTimeEstimated = false;
  } else if (b.readTimeMinutes === null) {
    content.readTimeEstimated = true;
  }
  if (content.readTimeEstimated) content.readTimeMinutes = estimateReadTime(content.body);

  if (content.format === "image" && !content.imageUrl) throw new ApiError(422, "An image post needs an image");
}

// ── Staff ───────────────────────────────────────────────────────────────────

/** All content with search, filters, sort, page, plus counts and the category list. */
export const listContent = asyncHandler(async (req: Request, res: Response) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 10);
  const status = String(req.query.status ?? "all");
  const sort = SORTS[String(req.query.sort ?? "newest")] ?? SORTS.newest;
  const search = String(req.query.search ?? "").trim();

  const filter: Record<string, unknown> = {};
  if (["published", "draft", "hidden"].includes(status)) filter.visibility = status;
  if (status === "sponsored") filter.sponsored = true;
  if (req.query.category) filter.category = String(req.query.category);
  if (search) {
    const pattern = new RegExp(escapeRegex(search), "i");
    filter.$or = [{ title: pattern }, { category: pattern }, { sponsorName: pattern }, { authorName: pattern }];
  }

  const [contents, total, counts, sponsored, categories] = await Promise.all([
    Content.find(filter)
      .select("-body")
      .sort(sort)
      .collation({ locale: "en" })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("author", "fullName"),
    Content.countDocuments(filter),
    Content.aggregate<{ _id: string; n: number }>([{ $group: { _id: "$visibility", n: { $sum: 1 } } }]),
    Content.countDocuments({ sponsored: true }),
    Content.distinct("category"),
  ]);
  const count = (visibility: string) => counts.find((c) => c._id === visibility)?.n ?? 0;

  return ApiResponse(res, 200, "Content fetched successfully", {
    contents,
    pagination: { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) },
    stats: {
      total: counts.reduce((sum, c) => sum + c.n, 0),
      published: count("published"),
      draft: count("draft"),
      hidden: count("hidden"),
      sponsored,
    },
    categories: (categories as string[]).sort((a, b) => a.localeCompare(b)),
  });
});

export const getContent = asyncHandler(async (req: Request, res: Response) => {
  const content = await withAuthor(req.params.id);
  if (!content) throw new ApiError(404, "Content not found");
  return ApiResponse(res, 200, "Content fetched successfully", content);
});

export const createContent = asyncHandler(async (req: Request, res: Response) => {
  const content = new Content({ author: req.user!._id, body: "" });
  applyFields(content, req.body);
  // Fixed once, so links and bookmarks keep working if the title changes.
  content.slug = await uniqueSlug(content.title);
  await content.save();
  return ApiResponse(res, 201, "Content created", await withAuthor(content._id));
});

/** Send only what changes. `readTimeMinutes: null` goes back to the estimate. */
export const updateContent = asyncHandler(async (req: Request, res: Response) => {
  const content = await contentOr404(req.params.id);
  applyFields(content, req.body);
  content.updatedBy = req.user!._id as mongoose.Types.ObjectId;
  await content.save();
  return ApiResponse(res, 200, "Content updated", await withAuthor(content._id));
});

export const deleteContent = asyncHandler(async (req: Request, res: Response) => {
  const content = await contentOr404(req.params.id);
  await content.deleteOne();
  return ApiResponse(res, 200, "Content deleted");
});

// ── Patients and doctors: the Learn feed ────────────────────────────────────

const FEED_FIELDS =
  "slug title excerpt format imageUrl category readTimeMinutes sponsored sponsorName publishedAt authorName authorRole";

/** Published content, newest first, with the categories that have something in them. */
export const listFeed = asyncHandler(async (req: Request, res: Response) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 20);
  const filter: Record<string, unknown> = { visibility: "published" };
  if (req.query.category) filter.category = String(req.query.category);

  const [contents, total, categories] = await Promise.all([
    Content.find(filter).select(FEED_FIELDS).sort({ publishedAt: -1 }).skip((page - 1) * limit).limit(limit),
    Content.countDocuments(filter),
    Content.distinct("category", { visibility: "published" }),
  ]);
  return ApiResponse(res, 200, "Feed fetched successfully", {
    contents,
    pagination: { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) },
    categories: (categories as string[]).sort((a, b) => a.localeCompare(b)),
  });
});

/** One published item with its full body, by slug or id. */
export const getFeedItem = asyncHandler(async (req: Request, res: Response) => {
  const key = req.params.slug;
  const match = mongoose.isValidObjectId(key) ? { $or: [{ _id: key }, { slug: key }] } : { slug: key };
  const content = await Content.findOne({ ...match, visibility: "published" }).select(`${FEED_FIELDS} body`);
  if (!content) throw new ApiError(404, "Content not found");
  return ApiResponse(res, 200, "Content fetched successfully", content);
});
