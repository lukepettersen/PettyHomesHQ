import { describe, expect, it } from "vitest";
import { askText, parseConsultReply, parseTextCommand, parseYesNo } from "./textCommands";

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

describe("ask by text replies", () => {
  it("reads yes and no", () => {
    for (const y of ["Yes", "y", "YES!", "done", "Completed", "yep", "👍"]) expect(parseYesNo(y)).toBe("yes");
    for (const n of ["No", "n", "not yet", "nope"]) expect(parseYesNo(n)).toBe("no");
    for (const x of ["yes call me", "task call lender", "maybe"]) expect(parseYesNo(x)).toBeNull();
  });
  it("asks plainly", () => {
    expect(askText({ title: "Consult done?", person: "Hayley & Beau", movesTo: "Consult complete" }))
      .toBe('HQ check-in for Hayley & Beau: "Consult done?" Reply YES if it\'s done (moves them to Consult complete), or NO to leave it open.');
  });
});

describe("booking a consult by text", () => {
  const today = "2026-10-30"; // a Friday
  it("reads type, day and time", () => {
    expect(parseConsultReply("buyer Wed 7pm", today)).toEqual({ kind: "book", type: "buyer", date: "2026-11-04", time: "19:00" });
    expect(parseConsultReply("Seller tomorrow 10am", today)).toEqual({ kind: "book", type: "seller", date: "2026-10-31", time: "10:00" });
    expect(parseConsultReply("11/6 6:30pm", today)).toEqual({ kind: "book", type: null, date: "2026-11-06", time: "18:30" });
    expect(parseConsultReply("listing Nov 12 at 3", today)).toEqual({ kind: "book", type: "seller", date: "2026-11-12", time: "15:00" });
  });
  it("leaves out what it can't tell, and knows no", () => {
    expect(parseConsultReply("buyer Wed", today)).toEqual({ kind: "book", type: "buyer", date: "2026-11-04", time: null });
    expect(parseConsultReply("no", today)).toEqual({ kind: "no" });
    expect(parseConsultReply("thanks!", today)).toBeNull();
    expect(parseConsultReply("Jack Rotman swing by his house today 10:30am", today)).toBeNull();
    expect(parseConsultReply("yes buyer consult on Wed at 7pm", today)).toEqual({ kind: "book", type: "buyer", date: "2026-11-04", time: "19:00" });
  });
});

