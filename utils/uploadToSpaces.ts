import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import { env } from "../config/env";
import { ApiError } from "./ApiError";

export interface SpacesUpload {
  url: string;
  key: string;
  name: string;
  size: number;
}

let client: S3Client | null = null;

const assertConfigured = () => {
  if (
    !env.spaces.key ||
    !env.spaces.secret ||
    !env.spaces.endpoint ||
    !env.spaces.region ||
    !env.spaces.bucket
  ) {
    throw new ApiError(
      500,
      "DigitalOcean Spaces is not configured for file uploads",
    );
  }
};

const getClient = (): S3Client => {
  if (client) return client;
  assertConfigured();
  client = new S3Client({
    endpoint: `https://${env.spaces.endpoint}`,
    region: env.spaces.region,
    credentials: {
      accessKeyId: env.spaces.key,
      secretAccessKey: env.spaces.secret,
    },
  });
  return client;
};

const publicUrlFor = (key: string): string => {
  const cdnHost = env.spaces.cdnEndpoint.replace(/^https?:\/\//, "");
  if (cdnHost && !cdnHost.startsWith("your-")) {
    return `https://${cdnHost}/${key}`;
  }
  return `https://${env.spaces.bucket}.${env.spaces.endpoint}/${key}`;
};

// Every upload lands under the shared bucket's "gyneclinics/<subfolder>/"
// prefix, keeping this project's files namespaced from other apps using
// the same Space, and images/documents both served with public-read ACL.
export const uploadToSpaces = async (
  file: Express.Multer.File,
  subfolder = "",
): Promise<SpacesUpload> => {
  assertConfigured();

  const extension = file.originalname.includes(".")
    ? file.originalname.split(".").pop()
    : undefined;
  const key = [env.spaces.rootFolder, subfolder, randomUUID()]
    .filter(Boolean)
    .join("/")
    .concat(extension ? `.${extension}` : "");

  await getClient().send(
    new PutObjectCommand({
      Bucket: env.spaces.bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      ACL: "public-read",
    }),
  );

  return {
    url: publicUrlFor(key),
    key,
    name: file.originalname,
    size: file.size,
  };
};

export const deleteFromSpaces = async (key?: string): Promise<void> => {
  if (!key) return;
  try {
    assertConfigured();
    await getClient().send(
      new DeleteObjectCommand({ Bucket: env.spaces.bucket, Key: key }),
    );
  } catch (err) {
    console.error("Failed to delete from DigitalOcean Spaces:", key, err);
  }
};
