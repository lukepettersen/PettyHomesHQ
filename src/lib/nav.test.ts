import { describe, expect, it } from "vitest";
import { navOrder } from "./nav";

describe("top bar order (owner 2026-11-02)", () => {
  it("defaults to Whiteboard, Tasks, Messages, People, Pipeline, Events, Tools, Admin", () => {
    expect(navOrder(null)).toEqual(["whiteboard", "tasks", "messages", "people", "pipeline", "events", "tools", "admin"]);
  });
  it("keeps a saved order, drops junk and repeats, and puts missing tabs after the tab before them", () => {
    expect(navOrder(["people", "bogus", "tasks", "people"])).toEqual(["people", "pipeline", "events", "tools", "admin", "tasks", "messages", "whiteboard"]);
  });
  it("puts a new tab (Events) after Pipeline in an order saved before it existed (owner request 2026-11-21)", () => {
    expect(navOrder(["tasks", "people", "messages", "pipeline", "whiteboard", "tools", "admin"])).toEqual(["tasks", "people", "messages", "pipeline", "events", "whiteboard", "tools", "admin"]);
  });
});
