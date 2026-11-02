import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { plainProblem } from "./places";

describe("address lookup problems in plain words (owner request 2026-10-27)", () => {
  it("names the setting to fix", () => {
    expect(plainProblem(400, "API key not valid. Please pass a valid API key.")).toMatch(/key isn't valid/);
    expect(plainProblem(403, "Places API (New) has not been used in project 123 before or it is disabled.")).toMatch(/project number 123\). Turn it on there: https:\/\/console\.cloud\.google\.com\/apis\/library\/places\.googleapis\.com\?project=123/);
    expect(plainProblem(403, "SERVICE_DISABLED")).toMatch(/Enable it/);
    expect(plainProblem(403, "This API project is not authorized to use this API.")).toMatch(/restrictions/);
    expect(plainProblem(500, "")).toBe("Google said no (500).");
  });
});
