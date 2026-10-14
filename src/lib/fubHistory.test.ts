import { describe, expect, it } from "vitest";
import { callEntry, convertMergeFields, folderOf, htmlToMarkup, noteEntry, textEntry } from "./fubHistory";

describe("FUB templates", () => {
  it("converts FUB merge fields and reports unknown ones", () => {
    expect(convertMergeFields("Hi %contact_first_name%, it's %agent_first_name%. %contact_custom_buy_price%")).toEqual({
      text: "Hi {first_name}, it's {agent_first_name}. %contact_custom_buy_price%", unknown: ["%contact_custom_buy_price%"],
    });
  });
  it("maps BUY/SELL custom fields to the purchase agreement, and the partner's first name", () => {
    const r = convertMergeFields("Hi %contact_first_name% and %contact_rels_first_name%! %custom_buy_address% closes %custom_sell_close_date% for %custom_buy_purchase_price%, inspection %custom_inspection_deadline%, WS %custom_sell_written_statement%. - %sender_first_name% %inquiry_address%");
    expect(r.text).toBe("Hi {primary_first_name} and {partner_first_name}! {address} closes {closing_date} for {price}, inspection {inspection_date}, WS {written_statement_date}. - {my_first_name} %inquiry_address%");
    expect(r.unknown).toEqual(["%inquiry_address%"]);
    expect(convertMergeFields("%custom_buy_commission% %custom_sell_bac% %custom_buy_hoa_doc_rescission_period% %custom_mailing_name% %contact_street%, %contact_city%").text)
      .toBe("{commission} {bac} {hoa_rescission_date} {mailing_name} {street}, {city}");
  });
  it("keeps bold, links and lists from email HTML", () => {
    expect(htmlToMarkup('<p>Hi <strong>Sam</strong>,</p><p>See <a href="https://pettyhomes.com/x">the listing</a></p><ul><li>One</li><li>Two</li></ul>'))
      .toBe("Hi **Sam**,\nSee [the listing](https://pettyhomes.com/x)\n\n- One\n- Two");
    expect(htmlToMarkup("Plain &amp; simple")).toBe("Plain & simple");
  });
  it("reads folders from names", () => {
    expect(folderOf("BPC - Consult Scheduled Confirmation")).toBe("BPC");
    expect(folderOf("lead nurture 3")).toBe("Leads");
    expect(folderOf("Happy Holidays")).toBe("");
  });
});

describe("FUB history", () => {
  it("turns notes, calls and texts into timeline entries", () => {
    expect(noteEntry({ id: 5, created: "2025-03-01T15:00:00Z", subject: "Showing feedback", body: "<p>Loved it</p>", createdBy: "Luke Pettersen" }))
      .toEqual({ key: "note:5", kind: "note", body: "Showing feedback\n\nLoved it", outcome: null, createdAt: "2025-03-01T15:00:00.000Z", author: "Luke Pettersen" });
    expect(callEntry({ id: 7, created: "2025-03-02T15:00:00Z", duration: 185, outcome: "Talked", note: "Wants to list in spring", userName: "Luke Pettersen" }))
      .toMatchObject({ kind: "call", body: "Call · 3 min\n\nWants to list in spring", outcome: "Talked" });
    expect(textEntry({ id: 9, created: "2025-03-03T15:00:00Z", message: "See you at 5!", isIncoming: true })).toMatchObject({ kind: "text", body: "They texted: See you at 5!", author: "" });
    expect(noteEntry({ id: 1, created: "2025-01-01", body: "" })).toBeNull();
  });
});
