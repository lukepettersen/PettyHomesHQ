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

describe("bold / italic / underline (owner request 2026-11-02)", () => {
  it("reads the markers", async () => {
    const { richSegments, plainText } = await import("./whiteboard");
    expect(richSegments("OFFERS **SUBMITTED** and *maybe* __this__")).toEqual([
      { t: "OFFERS ", b: false, i: false, u: false }, { t: "SUBMITTED", b: true, i: false, u: false }, { t: " and ", b: false, i: false, u: false },
      { t: "maybe", b: false, i: true, u: false }, { t: " ", b: false, i: false, u: false }, { t: "this", b: false, i: false, u: true }]);
    expect(richSegments("5 * 3 = 15")).toEqual([{ t: "5 * 3 = 15", b: false, i: false, u: false }]);
    expect(plainText("**A** *B*")).toBe("A B");
  });
  it("toggles around a selection and the whole item", async () => {
    const { toggleMark, toggleAll } = await import("./whiteboard");
    expect(toggleMark("call Sam today", 5, 8, "**")).toEqual({ text: "call **Sam** today", start: 7, end: 10 });
    expect(toggleMark("call **Sam** today", 7, 10, "**")).toEqual({ text: "call Sam today", start: 5, end: 8 });
    expect(toggleMark("call **Sam** today", 7, 10, "*")).toEqual({ text: "call ***Sam*** today", start: 8, end: 11 });
    expect(toggleAll("Goals", "__")).toBe("__Goals__");
    expect(toggleAll("__Goals__", "__")).toBe("Goals");
    expect(toggleAll("Head\n• Call Sam\n", "**")).toBe("**Head**\n• **Call Sam**\n");
    expect(toggleAll("**Head**\n• **Call Sam**", "**")).toBe("Head\n• Call Sam");
  });
});

describe("lists (owner request 2026-11-02)", () => {
  it("turns lines into a list and back", async () => {
    const { toggleList } = await import("./whiteboard");
    expect(toggleList("Call Sam\nText Jo", 2, 12, "bullet").text).toBe("• Call Sam\n• Text Jo");
    expect(toggleList("• Call Sam\n• Text Jo", 0, 5, "bullet").text).toBe("Call Sam\n• Text Jo");
    expect(toggleList("Call Sam\nText Jo", 0, 16, "number").text).toBe("1. Call Sam\n2. Text Jo");
    expect(toggleList("Head\nCall Sam", 7, 7, "bullet").text).toBe("Head\n• Call Sam");
  });
  it("continues the list on Enter and ends it on an empty item", async () => {
    const { listEnter } = await import("./whiteboard");
    expect(listEnter("• Call Sam", 10)).toEqual({ text: "• Call Sam\n• ", pos: 13 });
    expect(listEnter("1. Call Sam", 11)).toEqual({ text: "1. Call Sam\n2. ", pos: 15 });
    expect(listEnter("• Call Sam\n• ", 13)).toEqual({ text: "• Call Sam\n", pos: 11 });
    expect(listEnter("Plain", 5)).toBeNull();
  });
});
