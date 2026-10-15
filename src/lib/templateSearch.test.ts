import { describe, expect, it } from "vitest";
import { matchTemplates, slashQuery } from "./templateSearch";

const list = [
  { id: "1", name: "BPC · Lender intro" },
  { id: "2", name: "Leads · Intro email" },
  { id: "3", name: "Happy birthday" },
  { id: "4", name: "SUC · Inspection reminder" },
];

describe("matchTemplates", () => {
  it("matches every word in any order, names starting with it first", () => {
    expect(matchTemplates(list, "intro").map((t) => t.id)).toEqual(["2", "1"]);
    expect(matchTemplates(list, "intro lender").map((t) => t.id)).toEqual(["1"]);
    expect(matchTemplates(list, "SUC").map((t) => t.id)).toEqual(["4"]);
    expect(matchTemplates(list, "zzz")).toEqual([]);
    expect(matchTemplates(list, "").length).toBe(4);
  });
});

describe("slashQuery", () => {
  it("finds /words at the start or after a space", () => {
    expect(slashQuery("/")).toEqual({ query: "", from: 0 });
    expect(slashQuery("Hi Sam,\n/happy bi")).toEqual({ query: "happy bi", from: 8 });
    expect(slashQuery("see /insp")).toEqual({ query: "insp", from: 4 });
  });
  it("ignores and/or, links and finished lines", () => {
    expect(slashQuery("and/or")).toBeNull();
    expect(slashQuery("https://x.com/a")).toBeNull();
    expect(slashQuery("/happy\nnext line")).toBeNull();
    expect(slashQuery("/ ")).toBeNull();
  });
});
