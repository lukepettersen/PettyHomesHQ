// Events setup run from prisma/seed.ts (owner request 2026-11-21). Each step runs once (AppSetting flags), so edits made
// in HQ are never overwritten. The Timberwolves schedule import retries on each start until it works.
import type { PrismaClient } from "../src/generated/prisma/client";
import { NBA_HEADERS, nbaScheduleUrl, parseNbaSchedule } from "../src/lib/events";

const WOLVES = {
  name: "Timberwolves Season", type: "Client appreciation", multiSlot: true, doneLabel: "Tickets sent", location: "Target Center, Minneapolis",
  intro: "Want to catch a Timberwolves game on us? Pick the home games that work for you and we'll let you know which one you've got.",
  fields: [
    { key: "tickets", label: "How many tickets?", type: "select", options: ["1", "2"], required: true },
    { key: "notes", label: "Anything we should know?", type: "long", options: [], required: false },
  ],
  reminders: [
    { name: "Game tomorrow", daysBefore: 1, time: "10:00",
      body: "Hi {first_name}! Reminder: Wolves vs {opponent} is tomorrow, {event_date} at {event_time} at {location}. Enjoy the game! Any questions, text me at 612-702-0295. - Luke" },
  ],
};
const WAITLIST = "Wants Wolves Tickets";
const OFFER = "Hi {first_name}! I have tickets for Wolves vs {opponent} on {event_date} at {event_time}. Want them? Just text me back. - Luke 612-702-0295";
const PI_DAY = {
  name: "Pi Day", type: "Client appreciation", multiSlot: false, doneLabel: "Order fulfilled", location: "",
  intro: "Happy Pi Day! Order your free pie below and we'll bring it to you on Pi Day.",
  fields: [
    { key: "pie_flavor", label: "Pie flavor", type: "select", options: ["Apple", "Cherry", "Blueberry", "Pumpkin", "French Silk"], required: true },
    { key: "pies", label: "How many pies?", type: "number", options: [], required: true },
    { key: "delivery_address", label: "Delivery address", type: "text", options: [], required: true },
    { key: "notes", label: "Anything we should know?", type: "long", options: [], required: false },
  ],
  reminders: [
    { name: "Pie day tomorrow", daysBefore: 1, time: "10:00",
      body: "Hi {first_name}! Happy almost Pi Day! Your {pies} {pie_flavor} pie order is set for {event_date}. Questions? Text Luke at 612-702-0295." },
  ],
};

const flag = async (db: PrismaClient, key: string) => !!(await db.appSetting.findUnique({ where: { key } }));
const done = (db: PrismaClient, key: string) => db.appSetting.create({ data: { key, value: new Date().toISOString() } });

export async function seedEvents(db: PrismaClient) {
  // Luke and Alyssa both see and edit Events: every role at the time gets the new permission once.
  if (!(await flag(db, "seed.eventsPermission"))) {
    for (const r of await db.role.findMany()) if (!r.permissions.includes("manageEvents")) await db.role.update({ where: { id: r.id }, data: { permissions: [...r.permissions, "manageEvents"] } });
    await done(db, "seed.eventsPermission");
  }
  if (!(await flag(db, "seed.eventTemplates"))) {
    for (const t of [WOLVES, PI_DAY]) if (!(await db.eventTemplate.findFirst({ where: { name: t.name, deletedAt: null } }))) await db.eventTemplate.create({ data: t });
    await done(db, "seed.eventTemplates");
  }
  // The 2026-27 Wolves season, ready for attendees.
  const owner = await db.user.findFirst({ where: { isOwner: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!(await flag(db, "seed.wolves2026Event"))) {
    const t = await db.eventTemplate.findFirst({ where: { name: WOLVES.name, deletedAt: null } });
    if (t && !(await db.event.findFirst({ where: { name: "Timberwolves 2026-27", deletedAt: null } }))) {
      await db.event.create({ data: {
        templateId: t.id, name: "Timberwolves 2026-27", type: t.type, multiSlot: true, doneLabel: t.doneLabel, fields: t.fields as object[], location: t.location, intro: t.intro,
        senderId: owner?.id ?? null, createdById: owner?.id ?? null,
        reminders: { create: (t.reminders as { name: string; body: string; daysBefore: number; time: string }[]).map((r) => ({ name: r.name, body: r.body, daysBefore: r.daysBefore, time: r.time })) },
      } });
    }
    await done(db, "seed.wolves2026Event");
  }
  // The "Wants Wolves Tickets" waitlist (owner request 2026-11-21) on the Wolves template and season, if not set yet.
  if (!(await flag(db, "seed.wolvesWaitlist"))) {
    const data = { waitlistLabel: WAITLIST, offerText: OFFER };
    await db.eventTemplate.updateMany({ where: { name: WOLVES.name, waitlistLabel: "" }, data });
    await db.event.updateMany({ where: { name: "Timberwolves 2026-27", waitlistLabel: "" }, data });
    await done(db, "seed.wolvesWaitlist");
  }
  if (!(await flag(db, "seed.wolves2026Schedule"))) {
    const e = await db.event.findFirst({ where: { name: "Timberwolves 2026-27", deletedAt: null }, include: { slots: { select: { externalId: true } } } });
    if (!e) { await done(db, "seed.wolves2026Schedule"); return; }
    try {
      const r = await fetch(nbaScheduleUrl(), { headers: NBA_HEADERS, signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const { slots } = parseNbaSchedule(await r.json(), "MIN", "2026-27");
      let added = 0;
      for (const s of slots) {
        if (e.slots.some((x) => x.externalId === s.externalId)) continue;
        await db.eventSlot.create({ data: { eventId: e.id, date: new Date(`${s.date}T00:00:00.000Z`), time: s.time, title: s.title, opponent: s.opponent, location: s.location, details: "", externalId: s.externalId } });
        added++;
      }
      if (owner) await db.activityLog.create({ data: { userId: owner.id, action: "create", entity: "event", entityId: e.id, summary: `Loaded the Timberwolves 2026-27 home schedule (${added} games, NBA schedule)` } });
      await done(db, "seed.wolves2026Schedule");
      console.log(`Events: loaded ${added} Timberwolves home games.`);
    } catch (err) {
      // Tried again on the next start; the Import button on the event does the same.
      console.error("Events: couldn't load the Timberwolves schedule yet:", err instanceof Error ? err.message : "error");
    }
  }
}
