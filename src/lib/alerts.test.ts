import { describe, expect, it } from "vitest";
import { alertHeading } from "./alerts";

describe("alertHeading (owner report 2026-11-02)", () => {
  it("titles each kind of alert", () => {
    expect(alertHeading({ text: "Website form from Luke Pettersen (already in HQ) · 612-702-0295", link: null })).toBe("New website lead");
    expect(alertHeading({ text: "New website lead: Dana Lead · 952-555-0909", link: null })).toBe("New website lead");
    expect(alertHeading({ text: "Alyssa submitted an offer for Sam Ortiz: 1 Main St · $400,000", link: null })).toBe("New offer submitted");
    expect(alertHeading({ text: 'Automatic text "Reminder" wasn\'t sent: no phone', link: null })).toBe("Didn't send");
    expect(alertHeading({ text: "Missed call from Sam", link: "/messages?n=1" })).toBe("Missed call");
    expect(alertHeading({ text: 'Text from Sam: "hi"', link: "/messages?n=1" })).toBe("New text");
    expect(alertHeading({ text: "Something else", link: null })).toBe("HQ alert");
  });
});
