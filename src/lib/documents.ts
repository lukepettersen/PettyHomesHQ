// Files card rules (SPEC.md §6.3). Pure, unit tested in documents.test.ts.

export const MAX_BYTES = 25 * 1024 * 1024; // 25 MB
const BLOCKED = ["exe", "bat", "cmd", "com", "msi", "sh", "ps1", "js", "vbs", "scr", "jar", "app", "dmg"];

/** A file name that's safe to store and show: no folders, odd characters or very long names. */
export function safeName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.replace(/[^\w.\- ()&,#']/g, "_").replace(/\s+/g, " ").trim().slice(-120);
  return cleaned && cleaned !== "." && cleaned !== ".." ? cleaned : "file";
}

/** "Purchase Agreement.PDF" → "PDF" (shown as the file-type badge). */
export const extLabel = (name: string) => { const e = name.includes(".") ? name.split(".").pop()! : ""; return (e || "FILE").toUpperCase().slice(0, 4); };

/** Why a file can't be uploaded, or null when it's fine. */
export function uploadProblem(name: string, size: number): string | null {
  if (!size) return `"${name}" is empty.`;
  if (size > MAX_BYTES) return `"${name}" is larger than 25 MB.`;
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  if (BLOCKED.includes(ext)) return `"${name}" is a program file, which can't be uploaded.`;
  return null;
}

export const sizeLabel = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Storage settings from Railway, tidied: stray spaces trimmed, and the endpoint cut to its address
 *  (Cloudflare's dashboard shows it with the bucket name on the end, e.g. ".../pettyhomes-hq-files"). */
export function storageSettings(env: Record<string, string | undefined>) {
  const t = (k: string) => (env[k] ?? "").trim();
  let endpoint = t("S3_ENDPOINT");
  try { endpoint = new URL(endpoint).origin; } catch { /* left as is; the error below says what to fix */ }
  return { endpoint, region: t("S3_REGION") || "auto", bucket: t("S3_BUCKET"), accessKeyId: t("S3_ACCESS_KEY_ID"), secretAccessKey: t("S3_SECRET_ACCESS_KEY") };
}

/** Why the storage provider turned a request down, in words that say which Railway variable to fix. */
export function storageProblem(e: unknown): string {
  const err = (e ?? {}) as { name?: string; Code?: string; code?: string; message?: string; $metadata?: { httpStatusCode?: number } };
  const code = err.Code ?? err.name ?? err.code ?? "";
  const msg = String(err.message ?? "");
  if (code === "InvalidAccessKeyId" || /access key id/i.test(msg)) return "The storage provider doesn't recognize S3_ACCESS_KEY_ID. Re-copy the Access Key ID into Railway.";
  if (code === "SignatureDoesNotMatch" || /signature/i.test(msg)) return "S3_SECRET_ACCESS_KEY doesn't match the access key. Re-copy the Secret Access Key (not the \"Token value\") into Railway.";
  if (code === "NoSuchBucket" || /bucket does not exist/i.test(msg)) return "There's no bucket by that name. Check S3_BUCKET matches the bucket name exactly.";
  if (code === "AccessDenied" || code === "Unauthorized" || err.$metadata?.httpStatusCode === 403 || err.$metadata?.httpStatusCode === 401) return "The storage token isn't allowed into this bucket. It needs Object Read & Write on that bucket.";
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|Invalid URL|getaddrinfo/i.test(`${code} ${msg}`)) return "HQ can't reach S3_ENDPOINT. It should look like https://<id>.r2.cloudflarestorage.com.";
  return `The storage provider said: ${[code, msg].filter(Boolean).join(" — ").slice(0, 200) || "unknown error"}`;
}
