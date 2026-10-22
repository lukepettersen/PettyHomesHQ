// Images in emails and templates (owner request 2026-10-22): uploaded to the file storage under email-images/,
// shown to email recipients from HQ's public /api/img/<name> address.
export const EMAIL_IMAGE_PREFIX = "email-images/";
export const EMAIL_IMAGE_MAX = 5 * 1024 * 1024;
export const EMAIL_IMAGE_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };
/** Only names HQ made (24 random characters + an image extension) are served. */
export const emailImageName = (name: string) => /^[A-Za-z0-9_-]{24}\.(png|jpg|gif|webp)$/.test(name);
