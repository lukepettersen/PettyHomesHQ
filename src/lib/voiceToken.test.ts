import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { userFromIdentity, voiceAccessToken, voiceIdentity } from "./voiceToken";

describe("browser calling token", () => {
  it("is a signed Twilio access token with a voice grant", () => {
    const t = voiceAccessToken({ accountSid: "ACx", keySid: "SKx", keySecret: "secret", appSid: "APx", identity: voiceIdentity("u1"), now: 1_700_000_000_000 });
    const [h, b, s] = t.split(".");
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "HS256", typ: "JWT", cty: "twilio-fpa;v=1" });
    const body = JSON.parse(Buffer.from(b, "base64url").toString());
    expect(body).toMatchObject({ iss: "SKx", sub: "ACx", iat: 1_700_000_000, exp: 1_700_003_600, grants: { identity: "hq_u1", voice: { incoming: { allow: true }, outgoing: { application_sid: "APx" } } } });
    expect(s).toBe(createHmac("sha256", "secret").update(`${h}.${b}`).digest("base64url"));
  });
  it("reads the team member back from Twilio's From", () => {
    expect(userFromIdentity("client:hq_abc123")).toBe("abc123");
    expect(userFromIdentity("+16125550101")).toBeNull();
  });
});
