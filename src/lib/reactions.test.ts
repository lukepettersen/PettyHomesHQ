import { describe, expect, it } from "vitest";
import { applyReaction, reactionText, parseReaction, reactsTo } from "./reactions";

describe("iPhone reactions", () => {
  it("reads tapbacks", () => {
    expect(parseReaction("Loved “See you tomorrow!”")).toEqual({ emoji: "❤️", target: "See you tomorrow!", removed: false });
    expect(parseReaction('Laughed at "Go Wolves"')).toEqual({ emoji: "😂", target: "Go Wolves", removed: false });
    expect(parseReaction("Reacted 🎉 to “Closed!”")).toEqual({ emoji: "🎉", target: "Closed!", removed: false });
    expect(parseReaction("Removed a heart from “Hi”")).toEqual({ emoji: "❤️", target: "Hi", removed: true });
    expect(parseReaction("I loved the house")).toBeNull();
    expect(parseReaction("Sounds good")).toBeNull();
  });
  it("matches the message, even when shortened", () => {
    expect(reactsTo("See you tomorrow!", "See you tomorrow!")).toBe(true);
    expect(reactsTo("Hey hey! See y’all tomorrow! It’s also…", "Hey hey! See y'all tomorrow! It's also your homeiversary today!")).toBe(true);
    expect(reactsTo("Hi", "Hi there")).toBe(false);
  });
  it("keeps one of each icon per person", () => {
    let l = applyReaction([], { emoji: "❤️", by: "6125550101", removed: false });
    l = applyReaction(l, { emoji: "❤️", by: "6125550101", removed: false });
    expect(l).toEqual([{ emoji: "❤️", by: "6125550101" }]);
    expect(applyReaction(l, { emoji: "❤️", by: "6125550101", removed: true })).toEqual([]);
  });
});

describe("reactionText", () => {
  it("uses the iPhone wording, and reads back as the same reaction", () => {
    expect(reactionText("❤️", "See you tomorrow!")).toBe("Loved “See you tomorrow!”");
    expect(parseReaction(reactionText("👍", "Ok")!)).toEqual({ emoji: "👍", target: "Ok", removed: false });
    expect(parseReaction(reactionText("😂", "Ha", true)!)).toEqual({ emoji: "😂", target: "Ha", removed: true });
  });
  it("shortens long messages so they still match", () => {
    const long = "word ".repeat(30).trim();
    const t = reactionText("‼️", long)!;
    expect(t.length).toBeLessThan(90);
    expect(reactsTo(parseReaction(t)!.target, long)).toBe(true);
  });
  it("only sends the six reactions", () => { expect(reactionText("🎉", "Hi")).toBeNull(); expect(reactionText("❤️", "  ")).toBeNull(); });
});
