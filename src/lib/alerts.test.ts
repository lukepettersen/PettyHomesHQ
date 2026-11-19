import { describe, expect, it } from "vitest";
import { ALERT_DEFAULTS, alertHeading, alertKind, cleanAlertPrefs, popsUp } from "./alerts";

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

describe("which alerts pop up (owner request 2026-11-19)", () => {
  it("knows each kind", () => {
    expect(alertKind({ text: "Luke needs a listing contract for Sam in ClickContracts", link: null })).toBe("paperwork");
    expect(alertKind({ text: "Alyssa wrote up the listing contract for Sam: ready to sign in ClickContracts", link: null })).toBe("paperwork");
    expect(alertKind({ text: 'Luke mentioned you on Sam: "hi"', link: null })).toBe("mention");
    expect(alertKind({ text: "Luke gave you a task: Call", link: "/tasks?task=1" })).toBe("task");
    expect(alertKind({ text: 'HQ couldn\'t read a ShowingTime email ("x"): y', link: null })).toBe("showing");
    expect(alertKind({ text: 'Group text from Sam: "hi"', link: "/messages?g=1" })).toBe("group");
    expect(alertKind({ text: "New showing: Jo Agent at 1 Main St, Sat Nov 21 9:45am", link: null })).toBe("newShowing");
    expect(alertKind({ text: "Showing booked: 1 Main St, Sat Nov 21 9:45am (listing agent Jo Agent)", link: null })).toBe("newShowing");
    expect(alertKind({ text: "Email from Sam Ortiz: Re: offer", link: null })).toBe("email");
    expect(alertKind({ text: "Test (offer): Luke sent this to check", link: null })).toBe("offer");
    expect(alertHeading({ text: "Test (offer): Luke sent this to check", link: null })).toBe("New offer submitted");
    expect(alertKind({ text: "Test (nope): x", link: null })).toBe("other");
    expect(alertKind({ text: "Mass text finished: sent to 40 contacts", link: null })).toBe("bulk");
  });
  it("keeps what HQ did before by default, and follows each person's choices", () => {
    expect(popsUp({ text: "Alyssa submitted an offer for Sam: 1 Main · $1", link: null }, ALERT_DEFAULTS)).toBe(true);
    expect(popsUp({ text: 'Luke mentioned you on Sam: "hi"', link: null }, ALERT_DEFAULTS)).toBe(false);
    const p = cleanAlertPrefs({ offer: false, mention: true, other: false, junk: true });
    expect(popsUp({ text: "Alyssa submitted an offer for Sam: 1 Main · $1", link: null }, p)).toBe(false);
    expect(popsUp({ text: 'Luke mentioned you on Sam: "hi"', link: null }, p)).toBe(true);
    expect(popsUp({ text: "Something new", link: null }, p)).toBe(true); // "other" can't be turned off
  });
});
