import { describe, expect, it } from "vitest";
import { BOARD, boxOf, cleanBoard, NOTE_COLORS, placeNew } from "./whiteboard";

describe("whiteboard (owner request 2026-11-02)", () => {
  it("keeps items on the board with sensible sizes and colors", () => {
    const out = cleanBoard([
      { id: "a", kind: "note", x: -50, y: 99999, w: 5000, h: 10, color: "red", text: "Call 10 past clients" },
      { id: "b", kind: "text", x: 10.4, y: 20.6, size: 500, text: "2026: 40 homes" },
      { id: "c", kind: "person", x: 5, y: 5, text: "Sam & Lena Ortiz", personId: "p1", color: "#fff" },
    ]);
    expect(out[0]).toEqual({ id: "a", kind: "note", text: "Call 10 past clients", x: 0, y: BOARD.h - 30, w: 700, h: 80, color: NOTE_COLORS[0] });
    expect(out[1]).toEqual({ id: "b", kind: "text", text: "2026: 40 homes", x: 10, y: 21, size: 120 });
    expect(out[2]).toEqual({ id: "c", kind: "person", text: "Sam & Lena Ortiz", x: 5, y: 5, size: 30, personId: "p1" });
  });
  it("keeps a reshaped text box and its alignment", () => {
    const [t, n, pp] = cleanBoard([
      { id: "t", kind: "text", x: 0, y: 0, w: 600.4, h: 10, align: "center", text: "2027 Current Clients" },
      { id: "n", kind: "note", x: 0, y: 0, align: "left", text: "" },
      { id: "p", kind: "person", x: 0, y: 0, align: "right", text: "Sam" },
    ]);
    expect(t).toEqual({ id: "t", kind: "text", text: "2027 Current Clients", x: 0, y: 0, size: 40, w: 600, h: 30, align: "center" });
    expect(n.align).toBeUndefined();
    expect(pp.align).toBeUndefined();
    expect(boxOf(t)).toEqual({ x: 0, y: 0, w: 600, h: 30 });
  });
  it("keeps groups of two or more", () => {
    const out = cleanBoard([
      { id: "a", kind: "text", x: 0, y: 0, text: "A Buyers", group: "g1" },
      { id: "b", kind: "person", x: 0, y: 50, text: "Sam", personId: "p1", group: "g1" },
      { id: "c", kind: "text", x: 0, y: 0, text: "alone", group: "g2" },
    ]);
    expect(out.map((i) => i.group)).toEqual(["g1", "g1", undefined]);
  });
  it("refuses junk", () => {
    expect(() => cleanBoard([{ id: "x", kind: "drawing", x: 0, y: 0 }])).toThrow();
    expect(() => cleanBoard(new Array(301).fill({ id: "a", kind: "text", x: 0, y: 0 }))).toThrow();
  });
  it("puts new items in the first open spot on screen", () => {
    expect(placeNew({ left: 0, top: 0 }, [])).toEqual({ x: 40, y: 40 });
    const note = { kind: "note" as const, x: 40, y: 40, w: 220, h: 160, text: "" };
    expect(placeNew({ left: 0, top: 0 }, [note])).toEqual({ x: 300, y: 40 });
    expect(placeNew({ left: 500, top: 300 }, [note])).toEqual({ x: 540, y: 340 });
  });
});
