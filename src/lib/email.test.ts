import { describe, expect, it } from "vitest";
import { addressesIn, buildMime, buildMimeRaw, htmlToText, isEmail, messageText, toHtml, toPlain } from "./email";

const decode = (raw: string) => Buffer.from(raw, "base64url").toString("utf8");
/** The decoded text/plain and text/html parts of a built email. */
function parts(raw: string) {
  const m = decode(raw);
  const get = (type: string) => {
    const i = m.indexOf(`Content-Type: ${type}`);
    const body = m.slice(m.indexOf("\r\n\r\n", i) + 4, m.indexOf("\r\n--", i));
    return Buffer.from(body.replace(/\r\n/g, ""), "base64").toString("utf8");
  };
  return { m, plain: get("text/plain"), html: get("text/html") };
}

describe("emails Gmail sends", () => {
  it("sends plain text and HTML versions", () => {
    const { m, plain, html } = parts(buildMime({ from: "luke@pettyhomes.com", to: ["sam@example.com", "lena@example.com"], subject: "Accepted!", body: "Hi Sam,\nGreat **news**." }));
    expect(m).toContain("To: sam@example.com, lena@example.com\r\n");
    expect(m).toContain("Subject: Accepted!\r\n");
    expect(plain).toBe("Hi Sam,\r\nGreat news.");
    expect(html).toContain("Great <b>news</b>.");
  });
  it("adds the Gmail signature to both versions", () => {
    const { plain, html } = parts(buildMime({ from: "a@b.com", to: ["jo@example.com"], subject: "x", body: "Hi", signatureHtml: '<div><b>Luke Pettersen</b><br>Petty Homes · <a href="https://pettyhomes.com">pettyhomes.com</a></div>' }));
    expect(html).toContain('<div class="gmail_signature"><div><b>Luke Pettersen</b>');
    expect(plain).toContain("-- \r\nLuke Pettersen\r\nPetty Homes · pettyhomes.com (https://pettyhomes.com)");
  });
  it("can't be tricked into extra headers", () => {
    const m = decode(buildMime({ from: "luke@pettyhomes.com", to: ["sam@example.com\r\nBcc: x@evil.com", "ok@example.com"], subject: "Hi\r\nBcc: x@evil.com", body: "x" }));
    expect(m).not.toMatch(/^Bcc:/m);
  });
  it("encodes accents in the subject and skips bad addresses", () => {
    const m = decode(buildMime({ from: "a@b.com", to: ["not an email", "jo@example.com"], subject: "Café 🎉", body: "x" }));
    expect(m).toContain("To: jo@example.com\r\n");
    expect(m).toMatch(/Subject: =\?UTF-8\?B\?/);
    expect(() => buildMime({ from: "a@b.com", to: ["nope"], subject: "", body: "" })).toThrow();
    expect(isEmail("sam@example.com")).toBe(true);
  });
});

describe("formatting", () => {
  it("turns bold, links and bullets into HTML, and nothing typed becomes HTML", () => {
    const h = toHtml("See [the listing](https://pettyhomes.com/a) or https://zillow.com\n- one\n- **two**\n<script>x</script>");
    expect(h).toContain('<a href="https://pettyhomes.com/a">the listing</a>');
    expect(h).toContain('<a href="https://zillow.com">https://zillow.com</a>');
    expect(h).toContain("<ul><li>one</li><li><b>two</b></li></ul>");
    expect(h).toContain("&lt;script&gt;");
    expect(h).not.toContain("<script>");
    expect(toHtml('[x](javascript:alert(1))')).not.toContain("<a");
    expect(toPlain("See [the listing](https://p.com) **now**")).toBe("See the listing (https://p.com) now");
  });
  it("reads HTML as text", () => expect(htmlToText("<p>Hi&nbsp;there</p><ul><li>a</li></ul>")).toBe("Hi there\n- a"));
});

describe("reading Gmail", () => {
  const b = (s: string) => Buffer.from(s).toString("base64url");
  it("finds every address in a header", () => expect(addressesIn('"Sam O" <Sam@Example.com>, lena@example.com')).toEqual(["sam@example.com", "lena@example.com"]));
  it("keeps the new message and drops the quoted thread", () => {
    const payload = { mimeType: "multipart/alternative", parts: [{ mimeType: "text/plain", body: { data: b("Sounds good, see you then!\n\nOn Tue, Oct 13, 2026 at 2:00 PM Luke <luke@pettyhomes.com> wrote:\n> Are you free?") } }, { mimeType: "text/html", body: { data: b("<p>x</p>") } }] };
    expect(messageText(payload)).toBe("Sounds good, see you then!");
  });
  it("falls back to the HTML version", () => expect(messageText({ mimeType: "text/html", body: { data: b("<div>Hello<br>there</div>") } })).toBe("Hello\nthere"));
  it("adds the open-tracking image only when asked", () => {
    const dec = (raw: string) => Buffer.from(raw, "base64url").toString("utf8");
    const html = (raw: string) => dec(raw).split("Content-Type: text/html")[1];
    const withPixel = buildMime({ from: "a@b.com", to: ["c@d.com"], subject: "Hi", body: "Hello", pixelUrl: "https://hq.example.com/api/e/abc.gif" });
    expect(Buffer.from(html(withPixel).split("\r\n\r\n")[1].split("\r\n--")[0].replace(/\r\n/g, ""), "base64").toString()).toContain('<img src="https://hq.example.com/api/e/abc.gif"');
    const plain = buildMime({ from: "a@b.com", to: ["c@d.com"], subject: "Hi", body: "Hello" });
    expect(Buffer.from(html(plain).split("\r\n\r\n")[1].split("\r\n--")[0].replace(/\r\n/g, ""), "base64").toString()).not.toContain("<img");
  });
  it("attaches files", () => {
    const raw = buildMimeRaw({ from: "a@b.com", to: ["c@d.com"], subject: "Docs", body: "See attached", attachments: [{ name: 'Inspection "final".pdf', type: "application/pdf", data: new Uint8Array([37, 80, 68, 70]) }] });
    expect(raw).toContain("Content-Type: multipart/mixed;");
    expect(raw).toContain('Content-Disposition: attachment; filename="Inspection _final_.pdf"');
    expect(raw).toContain("JVBERg=="); // "%PDF"
    expect(raw).toContain("multipart/alternative");
    expect(buildMimeRaw({ from: "a@b.com", to: ["c@d.com"], subject: "x", body: "y" })).not.toContain("multipart/mixed");
  });
});
