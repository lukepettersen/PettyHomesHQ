import { describe, expect, it } from "vitest";
import { SHORT_SESSION_MS, signInStillGood } from "./session";

describe("how long a sign-in lasts", () => {
  const now = Date.parse("2026-10-14T12:00:00Z");
  it("remembered devices stay signed in", () => expect(signInStillGood({ remember: true, loginAt: now - 300 * 86400000 }, now)).toBe(true));
  it("others end 12 hours after signing in", () => {
    expect(signInStillGood({ remember: false, loginAt: now - SHORT_SESSION_MS + 60000 }, now)).toBe(true);
    expect(signInStillGood({ remember: false, loginAt: now - SHORT_SESSION_MS - 60000 }, now)).toBe(false);
  });
  it("no token means signed out", () => expect(signInStillGood(null, now)).toBe(false));
});
