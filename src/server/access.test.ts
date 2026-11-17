import { describe, expect, it } from "vitest";
import { isAllowedGoogleAccount } from "./access";
import { DEFAULT_ROLES, hasPermission } from "./permissions";

describe("who can sign in", () => {
  const ok = { email: "luke@pettyhomes.com", email_verified: true, hd: "pettyhomes.com" };
  it("allows a verified pettyhomes.com account", () => expect(isAllowedGoogleAccount(ok, "pettyhomes.com")).toBe(true));
  it("is not fooled by case", () => expect(isAllowedGoogleAccount({ ...ok, email: "Luke@PettyHomes.com" }, "pettyhomes.com")).toBe(true));
  it("rejects gmail", () => expect(isAllowedGoogleAccount({ email: "luke@gmail.com", email_verified: true }, "pettyhomes.com")).toBe(false));
  it("rejects look-alike domains", () => {
    expect(isAllowedGoogleAccount({ email: "x@pettyhomes.com.evil.io", email_verified: true }, "pettyhomes.com")).toBe(false);
    expect(isAllowedGoogleAccount({ email: "x@notpettyhomes.com", email_verified: true }, "pettyhomes.com")).toBe(false);
  });
  it("rejects unverified emails", () => expect(isAllowedGoogleAccount({ ...ok, email_verified: false }, "pettyhomes.com")).toBe(false));
  it("rejects a mismatched hosted domain", () => expect(isAllowedGoogleAccount({ ...ok, hd: "other.com" }, "pettyhomes.com")).toBe(false));
  it("rejects missing profiles", () => expect(isAllowedGoogleAccount(undefined, "pettyhomes.com")).toBe(false));
});

describe("default roles", () => {
  it("lets Admins see commissions", () => expect(hasPermission(DEFAULT_ROLES.Admin, "seeCommissions")).toBe(true));
  it("lets Assistants see commissions (owner decision 2026-10-16)", () => expect(hasPermission(DEFAULT_ROLES.Assistant, "seeCommissions")).toBe(true));
  it("hides commissions from a role without the permission", () => expect(hasPermission(["sendTexts"], "seeCommissions")).toBe(false));
  it("keeps user management Admin-only", () => expect(hasPermission(DEFAULT_ROLES.Assistant, "manageUsers")).toBe(false));
});
