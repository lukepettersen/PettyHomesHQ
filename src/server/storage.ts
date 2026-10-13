import "server-only";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { isConnected } from "@/server/integrations";

// Private S3-compatible bucket for the Files card. Off until the S3_* Railway variables are set.
// Files are never public: downloads go through HQ, which hands out a link that expires in 5 minutes.

let client: S3Client | null = null;
function s3(): S3Client {
  if (!client) client = new S3Client({
    endpoint: process.env.S3_ENDPOINT, region: process.env.S3_REGION || "auto", forcePathStyle: true,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! },
  });
  return client;
}
const bucket = () => process.env.S3_BUCKET!;
export const storageConnected = () => isConnected("storage");

export async function putFile(key: string, body: Uint8Array, contentType: string) {
  await s3().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }));
}

/** A download link that expires in 5 minutes and always downloads (never opens in the browser). */
export async function downloadUrl(key: string, name: string) {
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucket(), Key: key, ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(name)}` }), { expiresIn: 300 });
}

export async function removeFile(key: string) {
  await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
