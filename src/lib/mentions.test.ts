import { describe, expect, it } from "vitest";
import { findMentions, mentionQuery, splitMentions } from "./mentions";

const team = [{ id: "u1", name: "Luke Pettersen" }, { id: "u2", name: "Alyssa Chakiton" }];

describe("mentions", () => {
  it("finds each mentioned member once, any case", () => {
    expect(findMentions("@alyssa can you call? thanks @Alyssa", team).map((m) => m.id)).toEqual(["u2"]);
    expect(findMentions("ask @Luke and @Alyssa.", team).map((m) => m.id)).toEqual(["u1", "u2"]);
  });
  it("ignores emails and longer words", () => {
    expect(findMentions("email luke@pettyhomes.com or @Lukas", team)).toEqual([]);
  });
  it("splits for highlighting", () => {
    expect(splitMentions("Hi @Alyssa, done", team)).toEqual([{ text: "Hi ", mention: false }, { text: "@Alyssa", mention: true }, { text: ", done", mention: false }]);
  });
  it("reads the partial mention before the caret", () => {
    expect(mentionQuery("call back @Al")).toBe("Al");
    expect(mentionQuery("@")).toBe("");
    expect(mentionQuery("luke@x")).toBeNull();
  });
});
