import multer from "multer";
import { ApiError } from "../utils/ApiError";
import { MAX_COLOR_IMAGE_UPLOADS } from "../utils/productOptions";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const REVIEW_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const COSTING_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
];
const VENDOR_DOCUMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const PRODUCT_VIDEO_MIME_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(
        new ApiError(422, "Only JPEG, PNG, WEBP, or GIF images are allowed")
      );
    }
    cb(null, true);
  },
});

export const reviewUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 5 },
  fileFilter: (req, file, cb) => {
    if (!REVIEW_MIME_TYPES.includes(file.mimetype)) {
      return cb(
        new ApiError(422, "Only JPEG, PNG, WEBP, or PDF attachments are allowed")
      );
    }
    cb(null, true);
  },
});

export const costingUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!COSTING_MIME_TYPES.includes(file.mimetype)) {
      return cb(
        new ApiError(422, "Only JPG, PNG, WEBP, GIF, MP4, WEBM, or MOV files are allowed")
      );
    }
    cb(null, true);
  },
});

// featureImage/galleryImages must be images; the "video" field (the
// product's optional demo/promo clip) is branched to allow video mimetypes
// instead — same one-multer-per-request-parse pattern as vendorUpload below.
export const productUpload = multer({
  storage: multer.memoryStorage(),
  // 1 feature + 6 gallery + 1 video, plus the per-color photos.
  limits: { fileSize: 50 * 1024 * 1024, files: 8 + MAX_COLOR_IMAGE_UPLOADS },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === "video") {
      if (!PRODUCT_VIDEO_MIME_TYPES.includes(file.mimetype)) {
        return cb(
          new ApiError(422, "Only MP4, WEBM, or MOV videos are allowed")
        );
      }
      return cb(null, true);
    }
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(
        new ApiError(422, "Only JPEG, PNG, WEBP, or GIF images are allowed")
      );
    }
    cb(null, true);
  },
});

// logo/coverImage must be images; agreementDocument/businessDocuments also
// accept PDF and Word docs — branched by fieldname since multer applies one
// filter across every field in a single upload.fields() call.
const IMAGE_ONLY_FIELDS = ["logo", "coverImage"];

export const vendorUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 7 },
  fileFilter: (_req, file, cb) => {
    if (IMAGE_ONLY_FIELDS.includes(file.fieldname)) {
      if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        return cb(
          new ApiError(422, "Only JPEG, PNG, WEBP, or GIF images are allowed")
        );
      }
      return cb(null, true);
    }
    if (!VENDOR_DOCUMENT_MIME_TYPES.includes(file.mimetype)) {
      return cb(
        new ApiError(
          422,
          "Only JPEG, PNG, WEBP, GIF, PDF, DOC, or DOCX files are allowed"
        )
      );
    }
    cb(null, true);
  },
});
