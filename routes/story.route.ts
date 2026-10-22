import { Router } from "express";
import {
  createStory,
  deleteStory,
  getFeedStory,
  getStory,
  listFeedStories,
  listMyStories,
  listStories,
  setStoryStatus,
  updateStory,
} from "../controllers/story.controller";
import { authorize, protect } from "../middleware/auth";
import { requireAccess } from "../utils/permissions";
import { upload } from "../middleware/upload";
import { validate } from "../middleware/validate";
import {
  createStoryRules,
  feedStoriesRules,
  listStoriesRules,
  storyIdRules,
  storyStatusRules,
  updateStoryRules,
} from "../validators/story.validator";

// Mounted at /api/v1/stories.
//   POST   /             patient: share a story (multipart; optional "image" file)
//   GET    /mine         patient: own stories with status and rejection reason
//   GET    /feed         signed-in users: approved stories (Learn → Stories)
//   GET    /feed/:id     signed-in users: one approved story
//   GET    /             staff: list (status, topic, search, sort, page, stats)
//   GET    /:id          staff: one story with who sent it
//   PATCH  /:id          staff: corrections (only what changes)
//   PATCH  /:id/status   staff: approve / reject (reason) / hide / back to pending
//   DELETE /:id          staff: delete
const router = Router();
const canView = [protect, requireAccess("stories", "view")];
const canManage = [protect, requireAccess("stories", "manage")];

/**
 * @swagger
 * /stories:
 *   post:
 *     summary: Share a story (patient)
 *     description: It waits for review. Send as multipart/form-data; "image" (JPEG/PNG/WEBP/GIF, up to 5 MB) is optional.
 *     tags: [Stories]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [title, body, topic]
 *             properties:
 *               title: { type: string }
 *               body: { type: string, description: At least 80 characters }
 *               topic: { type: string, enum: [Periods, Fertility, Pregnancy, Menopause, Pelvic Health, Wellness, Stories] }
 *               anonymous: { type: boolean, default: true }
 *               authorName: { type: string }
 *               image: { type: string, format: binary }
 *     responses:
 *       201:
 *         description: "data: Story"
 *   get:
 *     summary: All stories (staff)
 *     tags: [Stories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: status, schema: { type: string, enum: [all, pending, approved, rejected, hidden] } }
 *       - { in: query, name: topic, schema: { type: string } }
 *       - { in: query, name: search, schema: { type: string }, description: "Title, story, name shown, or the patient's name/phone" }
 *       - { in: query, name: sort, schema: { type: string, enum: [newest, oldest, title_asc, title_desc] } }
 *       - { in: query, name: page, schema: { type: integer } }
 *       - { in: query, name: limit, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: "data: { stories, pagination, stats: { total, pending, approved, rejected, hidden } }"
 * /stories/mine:
 *   get:
 *     summary: The signed-in patient's stories, with review status
 *     tags: [Stories]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: "data: Story[] (without body)"
 * /stories/feed:
 *   get:
 *     summary: Approved stories for Learn (signed-in users)
 *     tags: [Stories]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: "data: { stories, pagination }"
 * /stories/feed/{id}:
 *   get:
 *     summary: One approved story (signed-in users)
 *     tags: [Stories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: "data: Story"
 * /stories/{id}:
 *   get:
 *     summary: One story with who sent it (staff)
 *     tags: [Stories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: "data: Story"
 *   patch:
 *     summary: Staff corrections; send only what changes
 *     tags: [Stories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: "data: Story"
 *   delete:
 *     summary: Delete a story (staff)
 *     tags: [Stories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Deleted
 * /stories/{id}/status:
 *   patch:
 *     summary: Approve, reject, hide or move back to review (staff)
 *     tags: [Stories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [pending, approved, rejected, hidden] }
 *               reason: { type: string, description: "Kept when rejected; the patient sees it" }
 *     responses:
 *       200:
 *         description: "data: Story"
 */
router.post("/", protect, authorize("patient"), upload.single("image"), createStoryRules, validate, createStory);
router.get("/mine", protect, authorize("patient"), listMyStories);
router.get("/feed", protect, feedStoriesRules, validate, listFeedStories);
router.get("/feed/:id", protect, storyIdRules, validate, getFeedStory);

router.get("/", ...canView, listStoriesRules, validate, listStories);
router.get("/:id", ...canView, storyIdRules, validate, getStory);
router.patch("/:id", ...canManage, updateStoryRules, validate, updateStory);
router.patch("/:id/status", ...canManage, storyStatusRules, validate, setStoryStatus);
router.delete("/:id", ...canManage, storyIdRules, validate, deleteStory);

export default router;
