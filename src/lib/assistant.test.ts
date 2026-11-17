import { describe, expect, it } from "vitest";
import { calendarHint, cleanNote, cleanTask } from "./assistant";

const people = new Map([["p1", "Sam & Lena Ortiz"]]);
const team = [{ id: "u1", name: "Luke Pettersen" }, { id: "u2", name: "Alyssa Smith" }];
const ctx = { people, team, meId: "u1", today: "2026-10-14" };

describe("cleanTask", () => {
  it("keeps a good task and fills names", () => {
    expect(cleanTask({ title: "call about inspection", kind: "call", person_id: "p1", assignee_id: "u2", due: "2026-10-20", time: "14:00" }, ctx)).toEqual({
      type: "task", title: "Call about inspection", kind: "call", personId: "p1", personName: "Sam & Lena Ortiz", assigneeId: "u2", assigneeName: "Alyssa Smith", due: "2026-10-20", time: "14:00",
    });
  });
  it("falls back to me, today, followup and no time", () => {
    const t = cleanTask({ title: "Order sign", kind: "weird", person_id: "", assignee_id: "nobody", due: "2026-02-30", time: "" }, ctx)!;
    expect([t.assigneeId, t.due, t.kind, t.time, t.personId]).toEqual(["u1", "2026-10-14", "followup", null, null]);
  });
  it("rejects made-up people and empty titles", () => {
    expect(cleanTask({ title: "x", person_id: "p9" }, ctx)).toBeNull();
    expect(cleanTask({ title: "  ", person_id: "" }, ctx)).toBeNull();
  });
  it("drops a time it can't read", () => {
    expect(cleanTask({ title: "x", person_id: "", time: "noonish" }, ctx)!.time).toBeNull();
  });
});

describe("cleanNote", () => {
  it("needs a real contact and a body", () => {
    expect(cleanNote({ person_id: "p1", kind: "call", body: "Talked about the yard. @Alyssa send listings" }, { people })).toMatchObject({ kind: "call", personName: "Sam & Lena Ortiz" });
    expect(cleanNote({ person_id: "", kind: "note", body: "hi" }, { people })).toBeNull();
    expect(cleanNote({ person_id: "p1", kind: "note", body: "" }, { people })).toBeNull();
    expect(cleanNote({ person_id: "p1", kind: "email", body: "hi" }, { people })!.kind).toBe("note");
  });
});

describe("calendarHint", () => {
  it("names today and the next two weeks", () => {
    const h = calendarHint("2026-10-14");
    expect(h).toContain("Today is Wednesday 2026-10-14");
    expect(h).toContain("Tuesday 2026-10-20");
    expect(h).toContain("2026-10-28");
  });
});
