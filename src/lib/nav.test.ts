import { describe, expect, it } from "vitest";
import { navOrder } from "./nav";

describe("top bar order (owner 2026-11-02)", () => {
  it("defaults to Whiteboard, Tasks, Messages, People, Pipeline, Tools, Admin", () => {
    expect(navOrder(null)).toEqual(["whiteboard", "tasks", "messages", "people", "pipeline", "tools", "admin"]);
  });
  it("keeps a saved order, drops junk and repeats, and adds missing tabs at the end", () => {
    expect(navOrder(["people", "bogus", "tasks", "people"])).toEqual(["people", "tasks", "whiteboard", "messages", "pipeline", "tools", "admin"]);
  });
});
