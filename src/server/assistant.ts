import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/server/db";
import { UserError } from "@/server/safe";
import { isConnected } from "@/server/integrations";
import { calendarHint, cleanNote, cleanTask, NOTE_KINDS, TASK_KINDS, type Proposal } from "@/lib/assistant";

// Ask Claude (SPEC.md §9.6). Claude only proposes; the person reviews the cards and clicks Save,
// which runs the normal createTask / addTimelineEntry actions (permissions + activity log there).
// What was said is sent to Anthropic's API to read it; nothing is logged here.

const MODEL = "claude-opus-5-5";
const MAX_TURNS = 6;

const SYSTEM = `You help the Petty Homes real estate team log work in their CRM, called HQ. A team member speaks or types a request; you turn it into proposed tasks and notes with the tools. Nothing is saved until they review your proposals and click Save, so propose everything they asked for in one go, then stop.

People:
- Use find_people to look up a contact's id by name. Never make up an id. Couples are stored together, like "Sam & Lena Ortiz", so search by one first name or the last name.
- If they're on a contact's page and don't name anyone else, "them", "him", "her", "this client" or no name at all means that contact.
- If a name matches several contacts and nothing settles it, don't guess: propose nothing for that item and ask which one in your reply.

Tasks (propose_task):
- A short title in plain words, like "Call about the inspection" or "Send listings". Leave the person's name out of the title when the task is linked to them.
- due is YYYY-MM-DD, worked out from the calendar you're given. If no day is said, use today.
- time is 24-hour HH:MM only when a time was said, otherwise "". "Morning" with no time means no time.
- assignee_id is the speaker, unless they say someone else should do it ("have Alyssa…", "remind Alyssa to…", "for Alyssa").
- kind: call, text, email, showing or closing when the task is clearly one of those; otherwise followup.

Notes (propose_note):
- kind "note" for information about the client; "call" when they're logging a call they had; "text" when logging a text they sent or got.
- Write the note in the speaker's voice, cleaned up from speech: fix filler words and punctuation, keep every fact, add nothing.
- To tag a teammate, write @ and their first name in the note, like "@Alyssa can you send them listings?". That sends the teammate a notification. Only tag someone when the speaker asks to tell, ask, tag or loop in that person.

When done, reply with one short sentence (no lists). If you couldn't do something, say what and why in that sentence.`;

const tools: Anthropic.Beta.BetaTool[] = [
  {
    name: "find_people",
    description: "Search HQ contacts by name (any part: first name, last name or partner's name). Returns up to 8 matches with id, name and stage.",
    strict: true,
    input_schema: { type: "object", properties: { query: { type: "string", description: "A name or part of a name" } }, required: ["query"], additionalProperties: false },
  },
  {
    name: "propose_task",
    description: "Propose one task. Shown to the user for approval; not saved until they confirm.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        kind: { type: "string", enum: [...TASK_KINDS] },
        person_id: { type: "string", description: "Contact id from find_people, or \"\" when the task isn't about a contact" },
        assignee_id: { type: "string", description: "Team member id" },
        due: { type: "string", description: "YYYY-MM-DD" },
        time: { type: "string", description: "HH:MM 24-hour, or \"\"" },
      },
      required: ["title", "kind", "person_id", "assignee_id", "due", "time"],
      additionalProperties: false,
    },
  },
  {
    name: "propose_note",
    description: "Propose one note, logged call or logged text on a contact's timeline. Shown to the user for approval; not saved until they confirm.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        person_id: { type: "string", description: "Contact id from find_people" },
        kind: { type: "string", enum: [...NOTE_KINDS] },
        body: { type: "string" },
      },
      required: ["person_id", "kind", "body"],
      additionalProperties: false,
    },
  },
];

async function findPeople(query: string) {
  const words = query.trim().split(/\s+/).filter((w) => w.length > 1).slice(0, 4);
  if (!words.length) return [];
  const rows = await db.person.findMany({
    where: { deletedAt: null, AND: words.map((w) => ({ name: { contains: w, mode: "insensitive" as const } })) },
    orderBy: { updatedAt: "desc" }, take: 8,
    select: { id: true, name: true, stage: { select: { name: true } }, partnerType: true, company: true },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, stage: r.stage?.name ?? null, ...(r.partnerType ? { type: r.partnerType, company: r.company } : {}) }));
}

function friendly(e: unknown): never {
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw new UserError("The Claude key in Railway isn't working. Check ANTHROPIC_API_KEY (Admin → Integrations).");
  if (e instanceof Anthropic.RateLimitError) throw new UserError("Claude is busy right now. Try again in a minute.");
  if (e instanceof Anthropic.APIConnectionError) throw new UserError("Couldn't reach Claude. Check your connection and try again.");
  if (e instanceof Anthropic.APIError) throw new UserError(e.status === 400 && /credit|billing/i.test(e.message) ? "The Anthropic account is out of credit. Add credit at console.anthropic.com → Billing." : "Claude couldn't answer that. Try again.");
  throw e;
}

export async function askClaude(input: { text: string; personId: string | null; me: { id: string; name: string }; today: string }): Promise<{ reply: string; proposals: Proposal[] }> {
  if (!isConnected("claude")) throw new UserError("Ask Claude isn't connected yet. Add ANTHROPIC_API_KEY in Railway (Admin → Integrations).");
  const team = (await db.user.findMany({ where: { status: { not: "DISABLED" } }, select: { id: true, name: true }, orderBy: { name: "asc" } }));
  const here = input.personId ? await db.person.findFirst({ where: { id: input.personId, deletedAt: null }, select: { id: true, name: true } }) : null;

  // Every contact id Claude has seen (search results and the open page) — proposals may only use these.
  const people = new Map<string, string>(here ? [[here.id, here.name]] : []);
  const context = [
    calendarHint(input.today),
    `Speaker: ${input.me.name} (id ${input.me.id}).`,
    `Team: ${team.map((t) => `${t.name} (id ${t.id})`).join("; ")}.`,
    here ? `They're on the contact page for ${here.name} (id ${here.id}).` : "They're not on a contact's page.",
  ].join("\n");

  const client = new Anthropic({ maxRetries: 2, timeout: 60000 });
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: `${context}\n\nRequest: ${input.text}` }];
  const proposals: Proposal[] = [];
  let reply = "";

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let res: Anthropic.Beta.BetaMessage;
    try {
      res = await client.beta.messages.create({
        model: MODEL, max_tokens: 8000, system: SYSTEM, tools, messages,
        output_config: { effort: "low" },
        betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
      });
    } catch (e) { friendly(e); }
    if (res.stop_reason === "refusal") return { reply: "Claude couldn't help with that one. Try saying it another way.", proposals };
    reply = res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join(" ").trim() || reply;
    const uses = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || !uses.length) break;

    messages.push({ role: "assistant", content: res.content });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const u of uses) {
      const args = (u.input ?? {}) as Record<string, unknown>;
      if (u.name === "find_people") {
        const hits = await findPeople(typeof args.query === "string" ? args.query : "");
        hits.forEach((h) => people.set(h.id, h.name));
        results.push({ type: "tool_result", tool_use_id: u.id, content: hits.length ? JSON.stringify(hits) : "No contacts match that name." });
      } else if (u.name === "propose_task") {
        const p = cleanTask(args, { people, team, meId: input.me.id, today: input.today });
        if (p) proposals.push(p);
        results.push(p ? { type: "tool_result", tool_use_id: u.id, content: "Proposed. Not saved until the user confirms." } : { type: "tool_result", tool_use_id: u.id, is_error: true, content: "Not proposed: needs a title, and person_id must be \"\" or an id from find_people." });
      } else if (u.name === "propose_note") {
        const p = cleanNote(args, { people });
        if (p) proposals.push(p);
        results.push(p ? { type: "tool_result", tool_use_id: u.id, content: "Proposed. Not saved until the user confirms." } : { type: "tool_result", tool_use_id: u.id, is_error: true, content: "Not proposed: needs a body and a person_id from find_people." });
      } else {
        results.push({ type: "tool_result", tool_use_id: u.id, is_error: true, content: "Unknown tool." });
      }
    }
    messages.push({ role: "user", content: results });
  }
  return { reply: reply || (proposals.length ? "Here's what I've got." : "I didn't catch anything to add. Try again?"), proposals };
}
