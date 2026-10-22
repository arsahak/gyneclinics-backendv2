import { Router } from "express";
import {
  createContent,
  deleteContent,
  getContent,
  getFeedItem,
  listContent,
  listFeed,
  updateContent,
} from "../controllers/content.controller";
import { protect } from "../middleware/auth";
import { requireAccess } from "../utils/permissions";
import { validate } from "../middleware/validate";
import {
  contentIdRules,
  createContentRules,
  feedItemRules,
  feedRules,
  listContentRules,
  updateContentRules,
} from "../validators/content.validator";

// Mounted at /api/v1/content.
//   GET    /feed        signed-in patients/doctors: published content (Learn feed)
//   GET    /feed/:slug  signed-in patients/doctors: one published item (slug or id), full body
//   GET    /            staff: all content (search, filters, sort, page, stats, categories)
//   POST   /            staff: create
//   GET    /:id         staff: one item, any visibility
//   PATCH  /:id         staff: edit (only what changes)
//   DELETE /:id         staff: delete
const router = Router();
const canView = [protect, requireAccess("content", "view")];
const canManage = [protect, requireAccess("content", "manage")];

/**
 * @swagger
 * /content/feed:
 *   get:
 *     summary: Published content for the Learn feed (newest first)
 *     tags: [Content]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: category, schema: { type: string } }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 20 } }
 *     responses:
 *       200:
 *         description: "data: { contents (no body, with excerpt), pagination, categories }"
 * /content/feed/{slug}:
 *   get:
 *     summary: One published item with its full body (by slug or id)
 *     tags: [Content]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: slug, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: "data: Content"
 *       404:
 *         description: Not found or not published
 */
router.get("/feed", protect, feedRules, validate, listFeed);
router.get("/feed/:slug", protect, feedItemRules, validate, getFeedItem);

/**
 * @swagger
 * /content:
 *   get:
 *     summary: All content (staff)
 *     tags: [Content]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: status, schema: { type: string, enum: [all, published, draft, hidden, sponsored] } }
 *       - { in: query, name: category, schema: { type: string } }
 *       - { in: query, name: search, schema: { type: string }, description: "Title, category or sponsor" }
 *       - { in: query, name: sort, schema: { type: string, enum: [newest, oldest, title_asc, title_desc] } }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 10 } }
 *     responses:
 *       200:
 *         description: "data: { contents (no body), pagination, stats: { total, published, draft, hidden, sponsored }, categories }"
 *   post:
 *     summary: Create content (staff)
 *     description: The body is HTML; unsafe tags and attributes are removed. Read time is estimated unless given.
 *     tags: [Content]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, body, category]
 *             properties:
 *               title: { type: string }
 *               body: { type: string, description: HTML }
 *               format: { type: string, enum: [text, image, blog] }
 *               imageUrl: { type: string, description: "Required for format image" }
 *               category: { type: string }
 *               readTimeMinutes: { type: integer, nullable: true, description: "null or missing = estimate" }
 *               visibility: { type: string, enum: [published, draft, hidden], default: draft }
 *               sponsored: { type: boolean }
 *               sponsorName: { type: string, description: "Required when sponsored" }
 *     responses:
 *       201:
 *         description: "data: Content"
 * /content/{id}:
 *   get:
 *     summary: One content item, any visibility (staff)
 *     tags: [Content]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: "data: Content"
 *   patch:
 *     summary: Edit content; send only what changes (staff)
 *     description: "readTimeMinutes: null switches back to the estimate."
 *     tags: [Content]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: "data: Content"
 *   delete:
 *     summary: Delete content (staff)
 *     tags: [Content]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Deleted
 */
router.get("/", ...canView, listContentRules, validate, listContent);
router.post("/", ...canManage, createContentRules, validate, createContent);
router.get("/:id", ...canView, contentIdRules, validate, getContent);
router.patch("/:id", ...canManage, updateContentRules, validate, updateContent);
router.delete("/:id", ...canManage, contentIdRules, validate, deleteContent);

export default router;
