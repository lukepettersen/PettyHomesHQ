import { describe, expect, it } from "vitest";
import { buildMime, isEmail } from "./email";

const decode = (raw: string) => Buffer.from(raw, "base64url").toString("utf8");

describe("emails Gmail sends", () => {
  it("builds a plain-text message", () => {
    const m = decode(buildMime({ from: "luke@pettyhomes.com", to: ["sam@example.com", "lena@example.com"], subject: "Accepted!", body: "Hi Sam,\nGreat news." }));
    expect(m).toContain("To: sam@example.com, lena@example.com\r\n");
    expect(m).toContain("Subject: Accepted!\r\n");
    const body = m.split("\r\n\r\n")[1];
    expect(Buffer.from(body.replace(/\r\n/g, ""), "base64").toString("utf8")).toBe("Hi Sam,\r\nGreat news.");
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
