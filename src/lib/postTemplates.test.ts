import { describe, expect, it } from "vitest";
import { boxText, cleanTemplates, dealValues, fitText } from "./postTemplates";

describe("Instagram post templates (owner request 2026-11-26)", () => {
  it("keeps only good templates and boxes", () => {
    const t = cleanTemplates([
      { id: "u", name: "Under Contract", overlay: "/api/img/abcdefghijklmnopqrstuvwx.png", width: 1080, height: 1080, photo: { x: 0, y: 0, w: 1080, h: 700 },
        boxes: [{ id: "b1", field: "title", text: "Under Contract", x: 500, y: 760, w: 560, h: 110, size: 96, color: "#ffffff", align: "left", font: "Mukta Mahee", bold: true }, { field: "nope", font: "Comic", color: "red" }] },
      { name: "Bad", overlay: "https://evil.example/x.png" },
    ]);
    expect(t).toHaveLength(1);
    expect(t[0].boxes[1]).toMatchObject({ field: "custom", font: "Mukta Mahee", color: "#ffffff" });
  });
  it("fills in values from the deal", () => {
    const v = dealValues({ address: "5013 William Ave, Edina, MN 55436", price: 457500, info: { bedrooms: 3, bathrooms: "2", garage: 1 }, personName: "Andrew Herkenhoff & Riley Dirkes" });
    expect(v).toMatchObject({ beds: "3", baths: "2", garage: "1", city: "Edina MN", address: "5013 William Ave", price: "$457,500", reviewer: "Andrew" });
    expect(boxText({ field: "beds", text: "" } as never, v)).toBe("3");
    expect(boxText({ field: "title", text: "Just Listed" } as never, v)).toBe("Just Listed");
  });
  it("wraps and shrinks text to fit its box", () => {
    const measure = (s: string, size: number) => s.length * size * 0.5;
    const r = fitText("Luke made us feel so comfortable throughout the process", 300, 100, 40, measure);
    expect(r.lines.length).toBeGreaterThan(1);
    expect(r.lines.length * r.size * 1.2).toBeLessThanOrEqual(100);
  });
});
