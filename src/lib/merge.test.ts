import { describe, expect, it } from "vitest";
import { fill, formMergeFields, formValues, longDate, mergeKey, mergeValues, nameParts, SAMPLE } from "./merge";
import { DEFAULT_FORMS } from "./pa";

describe("merge fields", () => {
  it("splits couple names", () => {
    expect(nameParts("Sam & Lena Ortiz")).toEqual({ first: "Sam & Lena", last: "Ortiz" });
    expect(nameParts("Sam Ortiz & Lena Brooks")).toEqual({ first: "Sam & Lena", last: "Ortiz/Brooks" });
    expect(nameParts("Bob Baker")).toEqual({ first: "Bob", last: "Baker" });
  });
  it("fills fields, reports empty ones, keeps unknown ones", () => {
    const v = mergeValues({ ...SAMPLE, lender: null });
    const r = fill("Hi {first_name}! Closing is {closing_date} at {address}. Lender: {lender_name}. {not_a_field}", v);
    expect(r.text).toBe("Hi Sam & Lena! Closing is Friday, November 20 at 2215 Hillside Ave, Edina. Lender: . {not_a_field}");
    expect(r.missing).toEqual(["lender_name"]);
  });
  it("writes dates and times the friendly way (12-hour)", () => {
    expect(longDate("2026-10-16")).toBe("Friday, October 16");
    expect(mergeValues(SAMPLE).inspection_appointment).toBe("Friday, October 16 at 10:00am");
  });
  it("makes every form question a merge field, with friendly names", () => {
    const keys = formMergeFields([{ group: "Contract (seller side)", sections: DEFAULT_FORMS.seller }]).map((f) => f.key);
    for (const k of ["first_name", "earnest_money", "commission", "commission_amount", "bac", "buyer_agent_name", "buyer_agent_email", "seller_title_company", "title_contact_info", "hoa_rescission_date", "closing_date", "agent_name"]) expect(keys).toContain(k);
    expect(new Set(keys).size).toBe(keys.length);
    expect(mergeKey("customQuestion2")).toBe("custom_question2");
  });
  it("writes form answers the friendly way", () => {
    const v = formValues(DEFAULT_FORMS.seller, { price: "389000", em: "5000", commission: "2.7", bac: "695", closing: "2026-11-20", inspAppt: "2026-10-16T14:30", writtenStatement_na: "yes", bAgentName: "Jordan Reyes" });
    expect(v).toMatchObject({ price: "$389,000", earnest_money: "$5,000", commission: "2.7%", bac: "$695", commission_amount: "$10,503", closing_date: "Friday, November 20",
      inspection_appointment: "Friday, October 16 at 2:30pm", written_statement_date: "N/A", buyer_agent_name: "Jordan Reyes" });
    expect(mergeValues({ personName: "Bob Baker", extra: v }).earnest_money).toBe("$5,000");
  });
  it("splits a couple's first names and the contact's own address", () => {
    const v = mergeValues({ personName: "Sam & Lena Ortiz", homeAddress: "5357 35th Ave S, Minneapolis, MN 55417", myName: "Alyssa Chakiton", email: "sam@x.com" });
    expect(v).toMatchObject({ first_name: "Sam & Lena", primary_first_name: "Sam", partner_first_name: "Lena", street: "5357 35th Ave S", city: "Minneapolis", my_first_name: "Alyssa", email: "sam@x.com" });
    expect(mergeValues({ personName: "Sam Ortiz & Lena Brooks" }).partner_first_name).toBe("Lena");
  });
});

describe("couple names written with and / +", () => {
  it("splits Caitlin and Luke Pettersen like Caitlin & Luke", () => {
    expect(nameParts("Caitlin and Luke Pettersen")).toEqual({ first: "Caitlin & Luke", last: "Pettersen" });
    expect(nameParts("Ann + Bo Lee")).toEqual({ first: "Ann & Bo", last: "Lee" });
    expect(nameParts("Andrea Sanders")).toEqual({ first: "Andrea", last: "Sanders" });
  });
});
