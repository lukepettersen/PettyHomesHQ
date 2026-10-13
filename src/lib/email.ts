// Emails HQ sends and reads through Gmail (SPEC.md §12). Pure, unit tested in email.test.ts.

const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim();
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
const wrap76 = (s: string) => (s.match(/.{1,76}/g) ?? []).join("\r\n");
/** Subjects with accents or emoji are encoded so every mail app shows them right. */
const header = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);
export const isEmail = (s: string) => /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/.test(s);

// ---------- Light formatting: **bold**, [words](https://link), "- " bullet lines ----------
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const LINK = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g;
function inline(line: string): string {
  // Escape first, then add only the tags HQ makes, so nothing typed can become HTML.
  let s = esc(line);
  s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, t: string, u: string) => `<a href="${u}">${t}</a>`);
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (_, pre: string, u: string) => `${pre}<a href="${u}">${u}</a>`);
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>");
  return s;
}
/** The message as HTML: paragraphs, bold, links and bullet lists. */
export function toHtml(text: string): string {
  const out: string[] = [];
  let list: string[] = [];
  const flush = () => { if (list.length) { out.push(`<ul>${list.map((l) => `<li>${l}</li>`).join("")}</ul>`); list = []; } };
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const m = /^\s*[-•]\s+(.*)$/.exec(line);
    if (m) { list.push(inline(m[1])); continue; }
    flush();
    out.push(line.trim() ? `${inline(line)}<br>` : "<br>");
  }
  flush();
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.45">${out.join("\n")}</div>`;
}
/** The same message for mail apps that only show plain text. */
export const toPlain = (text: string) => text.replace(LINK, "$1 ($2)").replace(/\*\*([^*\n]+)\*\*/g, "$1");

/** HTML (a Gmail signature) → readable plain text. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|tr|h\d)>/gi, "\n").replace(/<li[^>]*>/gi, "- ")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, u: string, t: string) => (t.replace(/<[^>]+>/g, "").trim() === u ? u : `${t} (${u})`))
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * The email as Gmail's API wants it (base64url): plain text and HTML versions, with the Gmail signature
 * (HTML, from Gmail settings) when there is one. Line breaks in To/Subject can't add headers.
 */
export function buildMime(m: { from: string; to: string[]; subject: string; body: string; signatureHtml?: string | null }): string {
  const to = m.to.map(oneLine).filter(isEmail);
  if (!to.length) throw new Error("No email address to send to.");
  const sig = m.signatureHtml?.trim() || "";
  const plain = toPlain(m.body) + (sig ? `\n\n-- \n${htmlToText(sig)}` : "");
  const html = toHtml(m.body) + (sig ? `<br><div class="gmail_signature">${sig}</div>` : "");
  const boundary = `hq-${b64(m.subject + to.join()).replace(/[^A-Za-z0-9]/g, "").slice(0, 16)}-${to.length}`;
  const part = (type: string, s: string) => [`--${boundary}`, `Content-Type: ${type}; charset="UTF-8"`, "Content-Transfer-Encoding: base64", "", wrap76(b64(s.replace(/\r?\n/g, "\r\n")))].join("\r\n");
  const lines = [
    `From: ${oneLine(m.from)}`, `To: ${to.join(", ")}`, `Subject: ${header(oneLine(m.subject))}`,
    "MIME-Version: 1.0", `Content-Type: multipart/alternative; boundary="${boundary}"`, "",
    part("text/plain", plain), part("text/html", html), `--${boundary}--`, "",
  ];
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}

// ---------- Reading Gmail ----------
/** Every address in a From/To/Cc header, lowercase. */
export const addressesIn = (h: string) => [...new Set((h.match(/[^\s<>,;"']+@[^\s<>,;"']+\.[^\s<>,;"']+/g) ?? []).map((a) => a.toLowerCase()))];

type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[] };
const decode = (d: string) => Buffer.from(d.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
function findPart(p: Part, type: string): string | null {
  if (p.mimeType === type && p.body?.data) return decode(p.body.data);
  for (const c of p.parts ?? []) { const f = findPart(c, type); if (f) return f; }
  return null;
}
/** The readable text of a Gmail message, without the quoted earlier messages below it, at most 4,000 characters. */
export function messageText(payload: Part): string {
  const raw = findPart(payload, "text/plain") ?? htmlToText(findPart(payload, "text/html") ?? "");
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const cut = lines.findIndex((l, i) => /^On .+wrote:\s*$/.test(l) || (/^On .+/.test(l) && /wrote:\s*$/.test(lines[i + 1] ?? "")) || /^-{2,}\s*Original Message\s*-{2,}/i.test(l) || /^From: .+/.test(l) && i > 0 && /^\s*$/.test(lines[i - 1]));
  const text = (cut > 0 ? lines.slice(0, cut) : lines).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return text.length > 4000 ? `${text.slice(0, 4000)}…` : text;
}
