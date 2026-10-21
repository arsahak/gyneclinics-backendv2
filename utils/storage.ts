import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import { env } from "../config/env";
import { ApiError } from "./ApiError";
import { deleteFromSpaces, uploadToSpaces } from "./uploadToSpaces";

// Where uploaded images live. DigitalOcean Spaces when it's configured,
// otherwise Cloudinary. Stored keys carry a "cloudinary:" prefix so each file
// is deleted from the service it was uploaded to.

const CLOUDINARY_PREFIX = "cloudinary:";

const spacesConfigured = () =>
  Boolean(env.spaces.key && env.spaces.secret && env.spaces.endpoint && env.spaces.region && env.spaces.bucket);

const cloudinaryConfigured = () =>
  Boolean(env.cloudinary.cloudName && env.cloudinary.apiKey && env.cloudinary.apiSecret);

let cloudinaryReady = false;
function useCloudinary() {
  if (!cloudinaryReady) {
    cloudinary.config({
      cloud_name: env.cloudinary.cloudName,
      api_key: env.cloudinary.apiKey,
      api_secret: env.cloudinary.apiSecret,
      secure: true,
    });
    cloudinaryReady = true;
  }
  return cloudinary;
}

export interface StoredFile {
  url: string;
  /** Pass to deleteStoredFile() to remove it later. */
  key: string;
}

interface ImageOptions {
  /** Square crop size in pixels (e.g. avatars). */
  square?: number;
}

/** Uploads an image and returns its public URL. */
export async function uploadImage(file: Express.Multer.File, folder: string, options: ImageOptions = {}): Promise<StoredFile> {
  if (spacesConfigured()) {
    const uploaded = await uploadToSpaces(file, folder);
    return { url: uploaded.url, key: uploaded.key };
  }
  if (!cloudinaryConfigured()) throw new ApiError(500, "File storage is not configured");

  const result = await new Promise<UploadApiResponse>((resolve, reject) => {
    useCloudinary()
      .uploader.upload_stream(
        {
          folder: `${env.cloudinary.folder}/${folder}`,
          resource_type: "image",
          ...(options.square && {
            transformation: [{ width: options.square, height: options.square, crop: "fill", gravity: "face" }],
          }),
        },
        (error, response) => (error || !response ? reject(error ?? new Error("Upload failed")) : resolve(response)),
      )
      .end(file.buffer);
  }).catch((error) => {
    console.error("Cloudinary upload failed:", error);
    throw new ApiError(502, "Could not upload the image. Please try again");
  });

  return { url: result.secure_url, key: `${CLOUDINARY_PREFIX}${result.public_id}` };
}

/** Deletes a file uploaded with uploadImage(). Never throws. */
export async function deleteStoredFile(key?: string): Promise<void> {
  if (!key) return;
  if (!key.startsWith(CLOUDINARY_PREFIX)) return deleteFromSpaces(key);
  if (!cloudinaryConfigured()) return;
  try {
    // invalidate: also clear the CDN copy, so the old image stops being served.
    await useCloudinary().uploader.destroy(key.slice(CLOUDINARY_PREFIX.length), { resource_type: "image", invalidate: true });
  } catch (error) {
    console.error("Failed to delete from Cloudinary:", key, error);
  }
}
