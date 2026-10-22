import { describe, expect, it } from "vitest";
import { emailImageName } from "./emailImages";

describe("email image names", () => {
  it("serves only names HQ made", () => {
    expect(emailImageName("abcdefghijklmnopqrstuvwx.png")).toBe(true);
    expect(emailImageName("../documents/secret.pdf")).toBe(false);
    expect(emailImageName("abcdefghijklmnopqrstuvwx.pdf")).toBe(false);
    expect(emailImageName("short.png")).toBe(false);
  });
});
