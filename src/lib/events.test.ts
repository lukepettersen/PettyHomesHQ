import { describe, expect, it } from "vitest";
import { answerSummary, answersProblem, cleanAnswers, cleanFields, cleanTemplateReminders, cleanTime, eventMergeValues, parseNbaSchedule, readDate, readSlotCsv, readTime,
  reminderSendAt, reminderWhen, shortEventDate, longEventDate, signupState, slotLine, statusLabel, gameFor, matchName, namesIn, readAssignmentCsv, stillWaiting } from "./events";

const pie = cleanFields([{ label: "Number of pies", type: "number", required: true }, { label: "Pie flavor", type: "select", options: "Apple, Cherry\nFrench Silk" }, { label: "Notes", type: "long" }]);

describe("events: questions and answers (owner request 2026-11-21)", () => {
  it("keys questions by their label and keeps merge-field names free", () => {
    expect(pie.map((f) => f.key)).toEqual(["number_of_pies", "pie_flavor", "notes"]);
    expect(pie[1].options).toEqual(["Apple", "Cherry", "French Silk"]);
    expect(cleanFields([{ label: "Location" }, { label: "Location" }]).map((f) => f.key)).toEqual(["location_answer", "location_answer_2"]);
    expect(cleanFields([{ label: "" }, "x", null])).toEqual([]);
  });
  it("cleans answers and finds the missing required one", () => {
    const a = cleanAnswers(pie, { number_of_pies: "02", pie_flavor: "apple", notes: " Leave on porch ", junk: "x" });
    expect(a).toEqual({ number_of_pies: "2", pie_flavor: "Apple", notes: "Leave on porch" });
    expect(cleanAnswers(pie, { number_of_pies: "two", pie_flavor: "Pecan" })).toEqual({});
    expect(answersProblem(pie, {})).toBe('Please fill in "Number of pies".');
    expect(answersProblem(pie, a)).toBeNull();
    expect(answerSummary(pie, a)).toBe("2 Apple");
  });
  it("cleans template reminders and times", () => {
    expect(cleanTemplateReminders([{ name: "", body: "Hi", daysBefore: 99, time: "07:00" }, { body: "" }])).toEqual([{ name: "Reminder", body: "Hi", daysBefore: 60, time: "10:00" }]);
    expect(cleanTime("20:00")).toBe("20:00");
    expect(cleanTime("20:30")).toBe("10:00");
    expect(cleanTime("9:30")).toBe("09:30");
  });
});

describe("events: dates, merge fields and reminders", () => {
  it("formats dates and lines", () => {
    expect(longEventDate("2027-01-14")).toBe("Thursday, January 14");
    expect(shortEventDate("2027-01-14")).toBe("1/14/27");
    expect(slotLine({ title: "Wolves vs Lakers", date: "2027-01-14" }, "Wolves 2026-27")).toBe("Wolves vs Lakers 1/14/27");
    expect(slotLine({ title: "", date: "2026-03-14" }, "Pi Day 2026")).toBe("Pi Day 2026 3/14/26");
    expect(statusLabel("sent", "Order fulfilled")).toBe("Order fulfilled");
  });
  it("merges the event, slot and answers", () => {
    const v = eventMergeValues({ name: "Wolves", location: "Target Center" }, { date: "2027-01-14", time: "19:00", title: "Wolves vs Lakers", opponent: "Los Angeles Lakers", location: "", details: "Sec 104 Row 3" }, { pie_flavor: "Apple" });
    expect(v).toMatchObject({ event_name: "Wolves", event_date: "Thursday, January 14", event_time: "7:00pm", opponent: "Los Angeles Lakers", location: "Target Center", seat_info: "Sec 104 Row 3", slot_title: "Wolves vs Lakers", pie_flavor: "Apple" });
  });
  it("times reminders in Central time", () => {
    expect(reminderSendAt("2027-01-14", 1, "10:00").toISOString()).toBe("2027-01-13T16:00:00.000Z");
    expect(reminderSendAt("2026-07-01", 0, "09:30").toISOString()).toBe("2026-07-01T14:30:00.000Z");
    expect(reminderWhen(1, "10:00")).toBe("1 day before at 10:00am");
    expect(reminderWhen(0, "09:00")).toBe("Day of at 9:00am");
  });
  it("knows when the signup page is open", () => {
    const now = new Date("2026-03-01T12:00:00Z");
    expect(signupState({ signupOn: false, signupOpensAt: null, signupClosesAt: null }, now).open).toBe(false);
    expect(signupState({ signupOn: true, signupOpensAt: new Date("2026-03-02"), signupClosesAt: null }, now).why).toMatch(/aren't open yet/);
    expect(signupState({ signupOn: true, signupOpensAt: null, signupClosesAt: new Date("2026-02-28") }, now).why).toMatch(/closed/);
    expect(signupState({ signupOn: true, signupOpensAt: new Date("2026-02-01"), signupClosesAt: new Date("2026-03-10") }, now).open).toBe(true);
  });
});

describe("events: Timberwolves schedule and CSV", () => {
  const game = (id: string, utc: string, home: string, away: [string, string, string]) => ({ gameId: id, gameDateTimeUTC: utc, arenaName: "Target Center", arenaCity: "Minneapolis",
    homeTeam: { teamTricode: home, teamCity: "Minnesota", teamName: "Timberwolves" }, awayTeam: { teamCity: away[0], teamName: away[1], teamTricode: away[2] } });
  const json = { leagueSchedule: { seasonYear: "2026-27", gameDates: [
    { games: [game("0012600001", "2026-10-10T00:00:00Z", "MIN", ["Chicago", "Bulls", "CHI"])] }, // preseason
    { games: [game("0022600050", "2026-10-25T00:00:00Z", "MIN", ["Los Angeles", "Lakers", "LAL"]), game("0022600051", "2026-10-25T00:00:00Z", "DEN", ["Minnesota", "Timberwolves", "MIN"])] },
    { games: [game("0022600400", "2027-01-15T01:00:00Z", "MIN", ["Golden State", "Warriors", "GSW"])] },
    { games: [game("0022601200", "2027-04-10T04:00:00Z", "MIN", ["Utah", "Jazz", "UTA"])] }, // time TBD: midnight Eastern
  ] } };
  it("keeps regular-season home games in Central time", () => {
    const r = parseNbaSchedule(json, "MIN", "2026-27");
    expect(r.slots.map((s) => [s.externalId, s.date, s.time, s.title, s.opponent])).toEqual([
      ["0022600050", "2026-10-24", "19:00", "Wolves vs Lakers", "Los Angeles Lakers"],
      ["0022600400", "2027-01-14", "19:00", "Wolves vs Warriors", "Golden State Warriors"],
      ["0022601200", "2027-04-10", null, "Wolves vs Jazz", "Utah Jazz"],
    ]);
    expect(r.slots[0].location).toBe("Target Center, Minneapolis");
    expect(() => parseNbaSchedule(json, "MIN", "2027-28")).toThrow(/2026-27/);
    expect(() => parseNbaSchedule({})).toThrow();
  });
  it("reads dates, times and a spreadsheet", () => {
    expect(readDate("1/14/27")).toBe("2027-01-14");
    expect(readDate("Thu, Jan 14, 2027")).toBe("2027-01-14");
    expect(readDate("2/30/2027")).toBeNull();
    expect(readTime("7:00 PM")).toBe("19:00");
    expect(readTime("7pm")).toBe("19:00");
    expect(readTime("TBD")).toBeNull();
    const r = readSlotCsv("Date,Time,Opponent,Seats\n1/14/2027,7:00 PM,vs Los Angeles Lakers,Sec 104 Row 3\nnot a date,,x,\n", "Wolves");
    expect(r.skipped).toBe(1);
    expect(r.slots).toEqual([{ externalId: null, date: "2027-01-14", time: "19:00", title: "Wolves vs Lakers", opponent: "Los Angeles Lakers", location: "", details: "Sec 104 Row 3" }]);
    expect(readSlotCsv("Opponent\nLakers").problem).toMatch(/Date/);
  });
});

describe("events: Wolves waitlist and the season spreadsheet (owner request 2026-11-21)", () => {
  it("knows who's still waiting", () => {
    const want = [{ personId: "a" }, { personId: "b" }, { personId: "c" }];
    expect(stillWaiting(want, [{ personId: "a", status: "confirmed" }, { personId: "b", status: "invited" }, { personId: "c", status: "declined" }]).map((w) => w.personId)).toEqual(["b", "c"]);
  });
  it("reads a season sheet: several people per game, blanks and 'Open' skipped", () => {
    const csv = "2026-27 Wolves season,,,\nDate,Opponent,Tickets to,Seats\n11/24/2026,Lakers,\"Tony & Laura Wagner\nSam Ortiz\",Sec 104\n12/3/2026,Warriors,Open,\n1/14/2027,Nuggets,Dana Lee; Jamie Newperson,\n,,Extra Person,\n";
    const r = readAssignmentCsv(csv);
    expect(r.problem).toBeNull();
    expect(r.skipped).toBe(1);
    expect(r.rows.map((x) => [x.line, x.date, x.opponent, x.name, x.seats])).toEqual([
      [3, "2026-11-24", "Lakers", "Tony & Laura Wagner", "Sec 104"], [3, "2026-11-24", "Lakers", "Sam Ortiz", "Sec 104"],
      [5, "2027-01-14", "Nuggets", "Dana Lee", ""], [5, "2027-01-14", "Nuggets", "Jamie Newperson", ""],
    ]);
    expect(readAssignmentCsv("Opponent,Name\nLakers,Sam").problem).toMatch(/Date/);
    expect(readAssignmentCsv("Date,Opponent\n1/1/2027,Lakers").problem).toMatch(/people/);
  });
  it("matches names to contacts, couples included", () => {
    expect(namesIn("Tony Wagner & Laura Schmidt")).toEqual(["tony wagner & laura schmidt", "tony wagner", "laura schmidt"]);
    expect(namesIn("Tony & Laura Wagner")).toContain("laura wagner");
    const people = [{ id: "1", name: "Tony Wagner & Laura Schmidt" }, { id: "2", name: "Sam Ortiz" }, { id: "3", name: "Sam Ortiz" }, { id: "4", name: "Kevin Wagner" }];
    expect(matchName("Tony Wagner", people).map((p) => p.id)).toEqual(["1"]);
    expect(matchName("laura schmidt", people).map((p) => p.id)).toEqual(["1"]);
    expect(matchName("Sam Ortiz", people).map((p) => p.id)).toEqual(["2", "3"]);
    expect(matchName("Wagner", people)).toEqual([]);
  });
  it("finds the game by date, and by opponent when two share a date", () => {
    const slots = [{ id: "a", date: "2027-01-14", opponent: "Denver Nuggets", title: "Wolves vs Nuggets" }, { id: "b", date: "2027-01-14", opponent: "Boston Celtics", title: "Wolves vs Celtics" }, { id: "c", date: "2027-01-20", opponent: "Utah Jazz", title: "" }];
    expect(gameFor({ date: "2027-01-20", opponent: "" }, slots)?.id).toBe("c");
    expect(gameFor({ date: "2027-01-14", opponent: "Celtics" }, slots)?.id).toBe("b");
    expect(gameFor({ date: "2027-01-14", opponent: "" }, slots)).toBeNull();
    expect(gameFor({ date: "2027-02-01", opponent: "" }, slots)).toBeNull();
  });
});
