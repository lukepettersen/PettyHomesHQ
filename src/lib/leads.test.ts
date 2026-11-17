import { describe, expect, it } from "vitest";
import { leadNote, readLead } from "./leads";

describe("website leads from the Elementor form (owner request 2026-11-01)", () => {
  it("reads Elementor's simple format (fields by label)", () => {
    const l = readLead({ Name: "Jane  Smith", Email: "Jane@Gmail.com ", Phone: "(612) 555-1234", Message: "Looking in Edina", "Price range": "$500k", Date: "November 1, 2026", "User Agent": "Mozilla", "Page URL": "https://lukepettersen.com/buy", "Powered by": "Elementor" });
    expect(l).toMatchObject({ name: "Jane Smith", email: "jane@gmail.com", phone: "(612) 555-1234", message: "Looking in Edina", page: "https://lukepettersen.com/buy" });
    expect(l.extras).toEqual([["Price range", "$500k"]]);
    expect(leadNote(l)).toBe('Website lead form\n"Looking in Edina"\nPrice range: $500k\nPage: https://lukepettersen.com/buy');
  });
  it("reads the advanced format and first/last name fields", () => {
    const l = readLead({ "form[id]": "abc", "fields[f1][id]": "f1", "fields[f1][title]": "First Name", "fields[f1][value]": "Sam", "fields[f2][title]": "Last Name", "fields[f2][value]": "Ortiz",
      "fields[em][title]": "Email Address", "fields[em][value]": "sam@x.com", "meta[page_url][title]": "Page URL", "meta[page_url][value]": "https://lukepettersen.com/" });
    expect(l).toMatchObject({ name: "Sam Ortiz", email: "sam@x.com", phone: "", page: "https://lukepettersen.com/" });
    expect(l.extras).toEqual([]);
  });
  it("finds the phone and email by their look when the fields have no labels", () => {
    const l = readLead({ name: "Pat Lee", field_3f2a: "(612) 555-0101", field_9c1: "Pat@Ex.com", field_7: "on", "Remote IP": "1.2.3.4" });
    expect(l).toMatchObject({ name: "Pat Lee", phone: "(612) 555-0101", email: "pat@ex.com" });
    expect(l.extras).toEqual([["field_7", "on"]]);
  });
  it("drops an email that isn't one", () => {
    expect(readLead({ Name: "A", Email: "nope" }).email).toBe("");
  });
});
