import { describe, expect, it } from "vitest";
import { parseTextCommand } from "./textCommands";

describe("text commands", () => {
  it("reads task and help", () => {
    expect(parseTextCommand("Task today call Mike re Donovan")).toEqual({ kind: "task", words: "today call Mike re Donovan" });
    expect(parseTextCommand("task: order sign tomorrow 9am")).toEqual({ kind: "task", words: "order sign tomorrow 9am" });
    expect(parseTextCommand("task")).toEqual({ kind: "task", words: "" });
    expect(parseTextCommand("help")).toEqual({ kind: "help" });
  });
  it("leaves normal texts alone", () => {
    expect(parseTextCommand("Tasks are done")).toBeNull();
    expect(parseTextCommand("Can you help?")).toBeNull();
  });
});
