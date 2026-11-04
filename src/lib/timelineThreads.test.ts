import { describe, expect, it } from "vitest";
import { emailTopic, threads } from "./timelineThreads";

const em = (id: string, head: string, at: string) => ({ id, kind: "email", body: `${head}\n\nbody`, at });
const tx = (id: string, at: string) => ({ id, kind: "text", body: "hi", at });

describe("timeline threads", () => {
  it("reads an email's topic without Re:/Fwd:", () => {
    expect(emailTopic("From sam@x.com · RE: Re: Fwd: 2001 Westwood  inspection\n\nhi")).toBe("2001 westwood inspection");
    expect(emailTopic("a note")).toBe("");
  });
  it("puts a reply with the email it answers, at the newest one's place (owner request 2026-11-04)", () => {
    const list = [
      em("r", "From sam@x.com · Re: Inspection", "2026-11-04T15:00:00Z"),
      tx("t1", "2026-11-04T12:00:00Z"),
      em("o", "To sam@x.com · Inspection", "2026-11-03T15:00:00Z"),
      em("x", "To sam@x.com · Something else", "2026-11-02T15:00:00Z"),
    ];
    expect(threads(list).map((g) => g.map((e) => e.id))).toEqual([["r", "o"], ["t1"], ["x"]]);
  });
  it("keeps texts close together as one thread, as before", () => {
    expect(threads([tx("a", "2026-11-04T12:00:00Z"), tx("b", "2026-11-04T10:00:00Z"), tx("c", "2026-11-02T10:00:00Z")]).map((g) => g.map((e) => e.id))).toEqual([["a", "b"], ["c"]]);
  });
});
