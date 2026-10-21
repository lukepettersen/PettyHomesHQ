import "server-only";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { isConnected } from "@/server/integrations";
import { storageSettings } from "@/lib/documents";

// Private S3-compatible bucket for the Files card. Off until the S3_* Railway variables are set.
// Files are never public: downloads go through HQ, which hands out a link that expires in 5 minutes.

let client: S3Client | null = null;
function s3(): S3Client {
  if (!client) {
    const s = storageSettings(process.env);
    client = new S3Client({
      endpoint: s.endpoint, region: s.region, forcePathStyle: true,
      // Newer AWS SDKs add checksum headers Cloudflare R2 may not accept; only send them when required.
      requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED",
      credentials: { accessKeyId: s.accessKeyId, secretAccessKey: s.secretAccessKey },
    });
  }
  return client;
}
const bucket = () => storageSettings(process.env).bucket;
export const storageConnected = () => isConnected("storage");

export async function putFile(key: string, body: Uint8Array, contentType: string) {
  await s3().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }));
}

/** A stored file's bytes (email attachments). */
export async function getFile(key: string): Promise<Uint8Array> {
  const r = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  return new Uint8Array(await r.Body!.transformToByteArray());
}

/** A download link that expires in 5 minutes and always downloads (never opens in the browser). */
export async function downloadUrl(key: string, name: string) {
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucket(), Key: key, ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(name)}` }), { expiresIn: 300 });
}

export async function removeFile(key: string) {
  await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
