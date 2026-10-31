import { describe, expect, it } from "vitest";
import { condMet, dueFor, expand, templateProblem, timingLabel, triggerLabel, type Template } from "./templates";

const s = (name: string, extra: Partial<Template["phases"][0]["steps"][0]> = {}) => ({ id: name, name, assignee: "Alyssa", type: "task" as const, days: 0, dir: "on" as const, anchor: "start" as const, cond: "always" as const, ...extra });
const tpl: Template = { id: "t1", name: "Buyer · Under contract", trigger: "pa:buyer", phases: [
  { id: "p1", name: "Under Contract", steps: [s("Accepted email", { anchor: "finalAcceptance" }), s("Lead paint", { cond: "pre1978", anchor: "finalAcceptance", days: 1, dir: "after" })] },
  { id: "p2", name: "Inspection", steps: [s("Review report", { anchor: "inspection", days: 2, dir: "before" }), s("HOA docs", { cond: "hoa", anchor: "hoaRescission" })] },
] };

describe("conditions", () => {
  it("reads the property facts", () => {
    expect(condMet("pre1978", { year: "1965" })).toBe(true);
    expect(condMet("pre1978", { year: "1990" })).toBe(false);
    expect(condMet("ws", { ws: "Yes" })).toBe(true);
    expect(condMet("ws", { ws: "No" })).toBe(false);
    expect(condMet("defect", { defect: "Yes" })).toBe(true);
    expect(condMet("defect", {})).toBe(false);
    expect(condMet("nodefect", { defect: "No" })).toBe(true);
    expect(condMet("nodefect", { defect: "Yes" })).toBe(false);
    expect(condMet("pre1978", {})).toBe(false);
    expect(condMet("fhava", { fin: "VA" })).toBe(true);
    expect(condMet("condo", { ptype: "Townhome" })).toBe(true);
  });
});

describe("expanding a template", () => {
  it("dates steps from anchors, waits for missing dates, skips unmet conditions", () => {
    const r = expand(tpl, { start: "2026-10-13", finalAcceptance: "2026-10-01", inspection: null }, { year: "1990", hoa: "Yes" });
    expect(r.skipped).toBe(1);
    expect(r.tasks.map((t) => [t.step.name, t.phase, t.due, t.waiting])).toEqual([
      ["Accepted email", "Under Contract", "2026-10-01", false],
      ["Review report", "Inspection", null, true],
      ["HOA docs", "Inspection", null, true],
    ]);
  });
  it("re-dates from a new anchor", () => {
    expect(dueFor({ anchor: "inspection", days: 2, dir: "before" }, { inspection: "2026-10-20" })).toBe("2026-10-18");
    expect(dueFor({ anchor: "start", days: 0, dir: "none" }, { start: "2026-10-13" })).toBeNull();
  });
});

describe("labels and checks", () => {
  it("labels timing and triggers", () => {
    expect(timingLabel({ anchor: "inspection", days: 2, dir: "before" })).toBe("Inspection deadline − 2 days");
    expect(timingLabel({ anchor: "closing", days: 0, dir: "on" })).toBe("Closing day of");
    expect(triggerLabel("status:s1", [{ id: "s1", kind: "buyer", name: "Rep signed" }])).toBe("When a buyer moves to Rep signed");
    expect(triggerLabel(null, [])).toBe("Apply by hand");
  });
  it("catches incomplete templates", () => {
    expect(templateProblem(tpl)).toBeNull();
    expect(templateProblem({ ...tpl, name: " " })).toMatch(/name/);
    expect(templateProblem({ ...tpl, phases: [{ id: "p", name: "X", steps: [s("Tags", { type: "tags" })] }] })).toMatch(/tags to add or remove/);
    expect(templateProblem({ ...tpl, phases: [{ id: "p", name: "X", steps: [s("Stage", { type: "stage" })] }] })).toMatch(/needs a stage/);
    expect(templateProblem({ ...tpl, phases: [{ id: "p", name: "X", steps: [s("Stage", { type: "stage", stage: "Past Client" })] }] })).toBeNull();
  });
});

describe("minutes before", () => {
  it("counts back from the time and labels it", async () => {
    const { timeBefore, timingLabel, templateProblem } = await import("./templates");
    expect(timeBefore("14:00", 15)).toBe("13:45");
    expect(timeBefore("00:10", 30)).toBe("00:00");
    expect(timeBefore("14:00", -30)).toBe("14:30");
    expect(timeBefore("23:50", -30)).toBe("23:59");
    expect(timingLabel({ anchor: "phoneCall", days: 0, dir: "minutesAfter", minutes: 15 })).toBe("15 minutes after Phone call");
    expect(timingLabel({ anchor: "consult", days: 0, dir: "minutesBefore", minutes: 30 })).toBe("30 minutes before Consult");
    const step = { id: "x", name: "Reminder", assignee: "", type: "task" as const, days: 0, dir: "minutesBefore" as const, minutes: 15, anchor: "closing" as const, cond: "always" as const };
    expect(templateProblem({ id: "t", name: "T", trigger: null, phases: [{ id: "p", name: "P", steps: [step] }] })).toMatch(/Phone call or Consult/);
    expect(templateProblem({ id: "t", name: "T", trigger: null, phases: [{ id: "p", name: "P", steps: [{ ...step, anchor: "phoneCall" }] }] })).toBeNull();
  });
});

describe("inspection appointment anchor (owner request 2026-10-27)", () => {
  it("dates a step 3 days before the appointment, not the deadline", () => {
    const step = { days: 3, dir: "before" as const, anchor: "inspAppt" as const };
    expect(dueFor(step, { inspAppt: "2026-10-30", inspection: "2026-11-06" })).toBe("2026-10-27");
    expect(dueFor(step, { inspection: "2026-11-06" })).toBeNull();
  });
});

describe("Only when: buyer side / seller side (owner request 2026-10-31)", () => {
  it("matches the contract's side; an unknown side keeps both", () => {
    expect(condMet("buyerside", { side: "buyer" })).toBe(true);
    expect(condMet("buyerside", { side: "seller" })).toBe(false);
    expect(condMet("sellerside", { side: "seller" })).toBe(true);
    expect(condMet("sellerside", {})).toBe(false);
    expect(condMet("buyerside", { side: "any" })).toBe(true);
    expect(triggerLabel("closed:any", [])).toBe("When any contract closes (buyer or seller)");
  });
});
