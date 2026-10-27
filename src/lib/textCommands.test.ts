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

describe("contact command (owner request 2026-10-27)", () => {
  it("reads a name, number and email in any order", () => {
    expect(parseTextCommand("contact Jane Smith 612-555-1234 Jane@Gmail.com")).toEqual({ kind: "contact", contact: { name: "Jane Smith", phone: "6125551234", email: "jane@gmail.com" } });
    expect(parseTextCommand("New contact: bob & sue o'neil, (952) 555-0101")).toEqual({ kind: "contact", contact: { name: "Bob & Sue O'Neil", phone: "9525550101", email: "" } });
    expect(parseTextCommand("Add contact sam@x.com Sam Ortiz +1 612 555 0199")).toEqual({ kind: "contact", contact: { name: "Sam Ortiz", phone: "6125550199", email: "sam@x.com" } });
    expect(parseTextCommand("contacts are great")).toBeNull();
  });
});
