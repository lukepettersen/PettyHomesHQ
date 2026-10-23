// Photos in texts (MMS; owner request 2026-10-23). Pure, tested.
import { emailImageName } from "@/lib/emailImages";

/** A photo on a text: a Twilio media address (plain texts), a Conversations media item, or HQ's own public image. */
export type TextMedia = { url?: string; service?: string; sid?: string; type: string };
/** What a text that is only a photo says in lists, alerts and timelines. */
export const PHOTO_ONLY = "📷 Photo";
/** Types every phone can show; others are refused before sending. */
export const TEXT_PHOTO_TYPES = ["image/jpeg", "image/png", "image/gif"];
export const MAX_TEXT_PHOTOS = 5;

/** Twilio's plain webhook: NumMedia, MediaUrl0, MediaContentType0, … */
export function plainMedia(f: Record<string, string>): TextMedia[] {
  const n = Math.min(Number(f.NumMedia ?? 0) || 0, 10);
  return Array.from({ length: n }, (_, i) => ({ url: f[`MediaUrl${i}`], type: f[`MediaContentType${i}`] ?? "" })).filter((m) => !!m.url && /^https:\/\//.test(m.url!));
}

/** Twilio Conversations webhook: Media = [{ Sid, ContentType }], with ChatServiceSid. */
export function conversationMedia(f: Record<string, string>): TextMedia[] {
  if (!f.Media || !f.ChatServiceSid) return [];
  try {
    const list = JSON.parse(f.Media) as { Sid?: string; ContentType?: string }[];
    return Array.isArray(list) ? list.filter((m) => m.Sid).map((m) => ({ service: f.ChatServiceSid, sid: m.Sid!, type: m.ContentType ?? "" })) : [];
  } catch {
    return [];
  }
}

/** Only photos uploaded to HQ (its public /api/img address) can be sent. */
export const isOurImage = (url: string, base: string) => !!base && url.startsWith(`${base}/api/img/`) && emailImageName(url.slice(`${base}/api/img/`.length));

/** The text kept for a message: what they wrote, or "📷 Photo" when it's only a picture. */
export const textWithPhotos = (body: string, media: unknown[]) => (body.trim() ? body : media.length ? PHOTO_ONLY : body);
