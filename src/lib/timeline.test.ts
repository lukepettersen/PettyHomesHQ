import { describe, expect, it } from "vitest";
import { canEditEntry } from "./timeline";

describe("editable timeline entries", () => {
  it("allows typed notes, logged calls and logged texts", () => {
    expect(canEditEntry({ kind: "note", outcome: null, authorId: "u1" })).toBe(true);
    expect(canEditEntry({ kind: "call", outcome: "Talked", authorId: "u1" })).toBe(true);
    expect(canEditEntry({ kind: "text", outcome: null, authorId: "u1" })).toBe(true);
  });
  it("keeps real records as they happened", () => {
    expect(canEditEntry({ kind: "text", outcome: "Sent", authorId: "u1" })).toBe(false);
    expect(canEditEntry({ kind: "text", outcome: "Received", authorId: null })).toBe(false);
    expect(canEditEntry({ kind: "call", outcome: "Answered", authorId: null })).toBe(false);
    expect(canEditEntry({ kind: "email", outcome: null, authorId: "u1" })).toBe(false);
    expect(canEditEntry({ kind: "task", outcome: null, authorId: "u1" })).toBe(false);
  });
});
