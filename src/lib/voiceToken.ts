// Twilio access token for calling from the browser (owner request 2026-10-27: call through HQ like FUB, no cell).
// A JWT signed with an API key secret, server-side only. Pure, tested in voiceToken.test.ts.
import { createHmac } from "node:crypto";

const b64 = (o: unknown) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");

export function voiceAccessToken(o: { accountSid: string; keySid: string; keySecret: string; appSid: string; identity: string; now?: number; ttl?: number }): string {
  const iat = Math.floor((o.now ?? Date.now()) / 1000);
  const head = b64({ alg: "HS256", typ: "JWT", cty: "twilio-fpa;v=1" });
  const body = b64({
    jti: `${o.keySid}-${iat}`, iss: o.keySid, sub: o.accountSid, iat, exp: iat + (o.ttl ?? 3600),
    grants: { identity: o.identity, voice: { incoming: { allow: true }, outgoing: { application_sid: o.appSid } } },
  });
  const sig = createHmac("sha256", o.keySecret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

/** Browser identity for a team member: "hq_<user id>". */
export const voiceIdentity = (userId: string) => `hq_${userId}`;
export const userFromIdentity = (from: string | undefined) => /^client:hq_([\w-]{1,40})$/.exec(from ?? "")?.[1] ?? null;
