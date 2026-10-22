import { Router, type Request, type Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { protect } from "../middleware/auth";
import { requireAccess } from "../utils/permissions";
import { upload } from "../middleware/upload";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { uploadImage } from "../utils/storage";

// Mounted at /api/v1/uploads.
//   POST /image   staff: upload an image (e.g. for content), returns its URL
const router = Router();

/**
 * @swagger
 * /uploads/image:
 *   post:
 *     summary: Upload an image (staff)
 *     description: JPEG, PNG, WEBP or GIF, up to 5 MB. Used for content feature images.
 *     tags: [Uploads]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [image]
 *             properties:
 *               image: { type: string, format: binary }
 *     responses:
 *       201:
 *         description: "data: { url }"
 *       422:
 *         description: Missing or unsupported file
 */
router.post(
  "/image",
  protect,
  requireAccess(["content", "ads", "stories", "doctors", "patients"], "manage"),
  upload.single("image"),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw new ApiError(422, "Choose an image to upload");
    const stored = await uploadImage(req.file, "content");
    return ApiResponse(res, 201, "Image uploaded", { url: stored.url });
  })
);

export default router;
