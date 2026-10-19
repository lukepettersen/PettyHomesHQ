import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { UserError } from "@/server/safe";
import { isConnected } from "@/server/integrations";
import { normalizeOffer, type OfferData } from "@/lib/offer";
import { offerPrompt } from "@/server/offerPrompt";

// Submit offer (SPEC.md §7.5): Claude organizes the spoken terms, merged into what's been said so far,
// the same way Relay did. What's said goes to Anthropic's API to be read; nothing is logged here.
const MODEL = "claude-opus-5-5";

function jsonObject(text: string): string | null {
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  return a !== -1 && b > a ? text.slice(a, b + 1) : null;
}

export async function extractOffer(transcript: string, current: OfferData | null, today: string): Promise<OfferData> {
  if (!isConnected("claude")) throw new UserError("Claude isn't connected yet. Add ANTHROPIC_API_KEY in Railway (Admin → Integrations).");
  const client = new Anthropic({ maxRetries: 2, timeout: 90000 });
  const user = `TODAY: ${today} (Central time)

CURRENT OFFER STATE (merge new info into this — keep existing values for fields not mentioned in transcript):
${current ? JSON.stringify(current, null, 2) : "null"}

TRANSCRIPT TO PARSE:
${transcript.trim()}`;
  let msg: Anthropic.Beta.BetaMessage;
  try {
    // A JSON-shape prompt rather than structured outputs: the offer has more nullable fields than that allows (as in Relay).
    msg = await client.beta.messages.create({
      model: MODEL, max_tokens: 16000, system: offerPrompt(Number(today.slice(0, 4))),
      messages: [{ role: "user", content: user }],
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw new UserError("The Claude key in Railway isn't working. Check ANTHROPIC_API_KEY (Admin → Integrations).");
    if (e instanceof Anthropic.RateLimitError) throw new UserError("Claude is busy right now. Try again in a minute.");
    if (e instanceof Anthropic.APIConnectionError) throw new UserError("Couldn't reach Claude. Check your connection and try again.");
    if (e instanceof Anthropic.APIError) {
      // Say what Claude's service actually said (e.g. out of credit, overloaded), so it can be fixed.
      const why = (e.error as { error?: { message?: string } } | undefined)?.error?.message ?? e.message;
      console.error("Offer extraction failed", e.status, why);
      if (/credit balance/i.test(why)) throw new UserError("The Anthropic account behind HQ's Claude key is out of credit. Add credit at console.anthropic.com → Billing.");
      if (e.status === 529 || e.status === 503) throw new UserError("Claude is overloaded right now. Try again in a minute.");
      throw new UserError(`Claude couldn't organize that (${e.status ?? "error"}: ${why.slice(0, 200)}).`);
    }
    throw e;
  }
  if (msg.stop_reason === "refusal") throw new UserError("Claude couldn't help with that one. Try saying it another way.");
  if (msg.stop_reason === "max_tokens") throw new UserError("That was cut off. Try again with a shorter recording.");
  const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const json = jsonObject(text);
  if (!json) throw new UserError("Claude's answer didn't come through. Try again.");
  try { return normalizeOffer(JSON.parse(json)); } catch { throw new UserError("Claude's answer didn't come through. Try again."); }
}
