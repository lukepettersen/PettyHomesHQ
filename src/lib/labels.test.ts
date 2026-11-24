import { describe, expect, it } from "vitest";
import { addressLines, labelsHtml } from "./labels";

describe("mailing labels (owner request 2026-11-24)", () => {
  it("splits addresses into a street line and a city line", () => {
    expect(addressLines("5533 Emerson Ave S, Minneapolis, MN 55419")).toEqual(["5533 Emerson Ave S", "Minneapolis, MN 55419"]);
    expect(addressLines("250 6th St E, Apt 219, St. Paul, MN 55101")).toEqual(["250 6th St E Apt 219", "St. Paul, MN 55101"]);
    expect(addressLines("123 Main")).toEqual(["123 Main"]);
  });
  it("lays out 30 a sheet, skips used labels and people with no address, and escapes names", () => {
    const rows = Array.from({ length: 31 }, (_, i) => ({ name: i === 0 ? "Tom & <Amy>" : `P${i}`, address: "1 A St, Edina, MN 55410" }));
    const html = labelsHtml([...rows, { name: "No address", address: null }], 3);
    expect((html.match(/class="sheet"/g) ?? []).length).toBe(2); // 2 blanks + 31 = 33 labels
    expect(html).toContain("Tom &amp; &lt;Amy&gt;");
    expect(html).not.toContain("No address");
    expect((html.match(/class="label"/g) ?? []).length).toBe(33);
  });
});

describe("envelopes (owner request 2026-11-24)", () => {
  it("one A7 envelope a person, with the return address", async () => {
    const { envelopesHtml } = await import("./labels");
    const html = envelopesHtml([{ name: "Alexa Klos", address: "5533 Emerson Ave S, Minneapolis, MN 55419" }, { name: "Nope", address: "" }], "Petty Homes\n123 Main St\nEdina, MN 55410");
    expect((html.match(/class="env"/g) ?? []).length).toBe(1);
    expect(html).toContain("size: 7.25in 5.25in");
    expect(html).toContain("<div>Petty Homes</div><div>123 Main St</div>");
    expect(html).toContain("<div>Minneapolis, MN 55419</div>");
    expect(envelopesHtml([{ name: "A", address: "1 A St, Edina, MN 55410" }], "", "long")).toContain("size: 9.5in 4in");
    expect(envelopesHtml([{ name: "A", address: "1 A St, Edina, MN 55410" }], "", "small")).toContain("size: 5.75in 4.25in");
  });
});
