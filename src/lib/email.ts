// Builds the email Gmail sends (SPEC.md §12). Pure, unit tested in email.test.ts.

const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim();
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
/** Subjects with accents or emoji are encoded so every mail app shows them right. */
const header = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);
export const isEmail = (s: string) => /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/.test(s);

/** A plain-text email as Gmail's API wants it (base64url). Line breaks in To/Subject can't add headers. */
export function buildMime(m: { from: string; to: string[]; subject: string; body: string }): string {
  const to = m.to.map(oneLine).filter(isEmail);
  if (!to.length) throw new Error("No email address to send to.");
  const lines = [
    `From: ${oneLine(m.from)}`, `To: ${to.join(", ")}`, `Subject: ${header(oneLine(m.subject))}`,
    "MIME-Version: 1.0", 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "",
    (b64(m.body.replace(/\r?\n/g, "\r\n")).match(/.{1,76}/g) ?? []).join("\r\n"),
  ];
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}
