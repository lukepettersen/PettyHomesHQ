import { describe, expect, it } from "vitest";
import { clip, cleanWhen, isUndo } from "./textAgent";

describe("text assistant helpers", () => {
  it("knows undo", () => {
    for (const x of ["undo", "Undo that", "oops undo", "UNDO!"]) expect(isUndo(x)).toBe(true);
    for (const x of ["undo the meeting with Jack tomorrow", "don't undo"]) expect(isUndo(x)).toBe(false);
  });
  it("keeps replies short and plain", () => {
    expect(clip("**Booked** it.")).toBe("Booked it.");
    const long = "First line.\n" + "word ".repeat(200);
    expect(clip(long).length).toBeLessThanOrEqual(461);
  });
  it("checks dates and times", () => {
    expect(cleanWhen("2026-11-04", "19:00")).toEqual({ date: "2026-11-04", time: "19:00" });
    expect(cleanWhen("2026-11-04", "")).toEqual({ date: "2026-11-04", time: null });
    expect(cleanWhen("Wed", "7pm")).toBeNull();
  });
});
