import { describe, expect, it } from "vitest";
import { applyPlan, defaultPlan, fubDate, summarize, type FubPerson } from "./fubImport";

const person = (o: Partial<FubPerson>): FubPerson => ({
  id: 1, firstName: "Sam", lastName: "Ortiz", stage: "Lead", source: "", assignedTo: "", tags: [], emails: [], phones: [], address: "",
  birthdays: [], homeiversary: "", mailingName: "", referredBy: "", ...o,
});
const HQ = { stages: ["Sphere", "Past Client", "Lead", "Industry Partners", "Passive Marketing", "Archive", "Trash"], sources: ["Sphere", "Website"], users: [{ id: "u1", name: "Luke Pettersen" }, { id: "u2", name: "Alyssa Chakiton" }] };
const people = [
  person({ id: 1, stage: "90 Day Sphere", tags: ["Past Client", "Mailers"], assignedTo: "Luke Pettersen", custom: { "Birthday 2": "6/1/1987", "Birthday 1": "1985-04-12", "Mailing Name": "Sam & Lena Ortiz", Homeiversary: "2020-08-15", "Referred By": "Pat" } }),
  person({ id: 2, stage: "30 Day Sphere", tags: ["Email Newsletter"] }),
  person({ id: 3, stage: "Lead", tags: ["A Lead", "Offer"] }),
  person({ id: 4, stage: "Industry Partners", tags: ["Import", "Realtors", "Imported Stage: Trash"] }),
  person({ id: 5, stage: "Industry Partners", source: "Bell Bank Mortgage", tags: ["Realtors"] }),
  person({ id: 6, stage: "Petty Homes Admin" }),
  person({ id: 7, stage: "Archive/No Direct Contact", assignedTo: "Alyssa" }),
  person({ id: 8, stage: "Realtor", tags: ["Edina Title"] }),
];
const plan = defaultPlan(summarize(people), HQ);
const hq = (id: number) => applyPlan(people.find((p) => p.id === id)!, plan);

describe("FUB import matching (owner decisions)", () => {
  it("counts what's in the data", () => {
    const s = summarize(people);
    expect(s.total).toBe(8);
    expect(s.stages[0]).toEqual(["Industry Partners", 2]);
  });
  it("Past Client tag → Past Client stage, keeping the sphere follow-up", () => expect(hq(1)).toMatchObject({ stage: "Past Client", followUpDays: 90, tags: ["Past Client", "Mailers"], assignedToId: "u1" }));
  it("N Day Sphere → Sphere with that follow-up", () => expect(hq(2)).toMatchObject({ stage: "Sphere", followUpDays: 30 }));
  it("Lead → Lead; automation tags are dropped", () => expect(hq(3)).toMatchObject({ stage: "Lead", followUpDays: null, tags: ["A Lead"] }));
  it("Industry Partners → Realtor; import leftover tags dropped", () => expect(hq(4)).toMatchObject({ stage: "Industry Partners", partnerType: "realtor", tags: [] }));
  it("…unless the source says lender", () => expect(hq(5)).toMatchObject({ partnerType: "lender" }));
  it("…or a tag says title", () => expect(hq(8)).toMatchObject({ partnerType: "title" }));
  it("skips Petty Homes Admin", () => expect(hq(6)).toBeNull());
  it("Archive, and agents matched by first name", () => expect(hq(7)).toMatchObject({ stage: "Archive", assignedToId: "u2" }));
  it("reads FUB dates", () => {
    expect(fubDate("1985-04-12")).toBe("1985-04-12");
    expect(fubDate("4/12/1985")).toBe("1985-04-12");
    expect(fubDate("4/12/85")).toBe("1985-04-12");
    expect(fubDate("soon")).toBeNull();
    expect(plan.fields).toEqual({ mailingName: "Mailing Name", homeiversary: "Homeiversary", referredBy: "Referred By", birthdays: ["Birthday 1", "Birthday 2"] });
    expect(hq(1)).toMatchObject({ mailingName: "Sam & Lena Ortiz", homeiversary: "2020-08-15", referredBy: "Pat", birthdays: [{ whose: "Sam", date: "1985-04-12" }, { whose: "", date: "1987-06-01" }] });
    expect(applyPlan(person({ custom: { "Birthday 2": "1990-01-02" } }), plan)?.birthdays).toEqual([{ whose: "", date: "1990-01-02" }]);
  });
  it("merges a spouse/partner into the contact, not children", () => {
    const fam = person({ id: 20, firstName: "Sam", lastName: "Ortiz", stage: "Lead", emails: [{ value: "sam@x.com", type: "home" }], custom: { "Birthday 1": "1985-04-12", "Birthday 2": "1987-06-01" }, relationships: [
      { type: "Child", firstName: "Mia", lastName: "Ortiz", emails: [], phones: [] },
      { type: "Spouse", firstName: "Lena", lastName: "Ortiz", emails: [{ value: "lena@x.com", type: "" }], phones: [{ value: "612-555-0199", type: "mobile" }] },
    ] });
    const pl = { ...defaultPlan(summarize([fam]), HQ), fields: plan.fields };
    expect(pl.relationships).toEqual({ Child: "kids", Spouse: "merge" });
    expect(applyPlan(fam, pl)?.birthdays).toEqual([{ whose: "Sam", date: "1985-04-12" }, { whose: "Lena", date: "1987-06-01" }]);
    expect(applyPlan(fam, pl)).toMatchObject({ name: "Sam & Lena Ortiz", kids: "Mia", emails: [{ address: "sam@x.com", label: "Sam" }, { address: "lena@x.com", label: "Lena" }], phones: [{ number: "612-555-0199", label: "Lena" }] });
    const two = person({ firstName: "Sam", lastName: "Ortiz", emails: [{ value: "sam@x.com", type: "" }, { value: "lena2@x.com", type: "" }], phones: [{ value: "6125550001", type: "" }, { value: "6125550002", type: "" }],
      relationships: [{ type: "Spouse", firstName: "Lena", lastName: "Ortiz", emails: [], phones: [] }] });
    const two2 = applyPlan(two, defaultPlan(summarize([two]), HQ))!;
    expect(two2.emails.map((e) => e.label)).toEqual(["Sam", "Lena"]);
    expect(two2.phones.map((e) => e.label)).toEqual(["Sam", "Lena"]);
    const diff = person({ firstName: "Sam", lastName: "Ortiz", relationships: [{ type: "Partner", firstName: "Lena", lastName: "Brooks", emails: [], phones: [] }] });
    expect(applyPlan(diff, defaultPlan(summarize([diff]), HQ))?.name).toBe("Sam Ortiz & Lena Brooks");
  });
  it("uses FUB's last activity as the last contact", () => {
    expect(applyPlan(person({ lastActivity: "2026-09-01T15:30:00Z" }), plan)?.lastContactAt).toBe("2026-09-01T15:30:00.000Z");
    expect(applyPlan(person({ lastActivity: "" }), plan)?.lastContactAt).toBeNull();
    expect(applyPlan(person({ lastActivity: "2999-01-01" }), plan)?.lastContactAt).toBeNull();
  });
});
