import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { connectNumber, sendSms } from "./twilio";

type Call = { url: string; body: string };
let calls: Call[] = [];
function fakeTwilio(routes: [RegExp, unknown, number?][]) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: String(init?.body ?? "") });
    const hit = routes.find(([re]) => re.test(url));
    return new Response(JSON.stringify(hit ? hit[1] : { message: "nope" }), { status: hit ? hit[2] ?? 200 : 404 });
  }));
}

describe("twilio", () => {
  beforeEach(() => {
    calls = [];
    vi.stubEnv("TWILIO_ACCOUNT_SID", "ACtest"); vi.stubEnv("TWILIO_AUTH_TOKEN", "tok"); vi.stubEnv("TWILIO_API_BASE", ""); vi.stubEnv("NEXTAUTH_URL", "https://hq.example.com/");
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("points the number and its Messaging Service at HQ", async () => {
    fakeTwilio([
      [/IncomingPhoneNumbers\.json\?PhoneNumber=%2B19522437646/, { incoming_phone_numbers: [{ sid: "PN1", phone_number: "+19522437646" }] }],
      [/IncomingPhoneNumbers\/PN1\.json/, { sid: "PN1" }],
      [/messaging\.twilio\.com\/v1\/Services\?/, { services: [{ sid: "MG0", friendly_name: "Other" }, { sid: "MG1", friendly_name: "Low Volume Mixed" }] }],
      [/Services\/MG0\/PhoneNumbers/, { phone_numbers: [] }],
      [/Services\/MG1\/PhoneNumbers/, { phone_numbers: [{ sid: "PN1" }] }],
      [/Services\/MG1$/, { sid: "MG1" }],
    ]);
    const r = await connectNumber("+19522437646");
    expect(r).toEqual({ ok: true, message: "Connected: texts and calls to this number now come into HQ." });
    const upd = calls.find((c) => c.url.endsWith("/IncomingPhoneNumbers/PN1.json"))!;
    expect(new URLSearchParams(upd.body).get("SmsUrl")).toBe("https://hq.example.com/api/twilio/sms");
    expect(new URLSearchParams(upd.body).get("VoiceUrl")).toBe("https://hq.example.com/api/twilio/voice");
    expect(calls.find((c) => c.url.endsWith("/Services/MG1"))!.body).toBe("UseInboundWebhookOnNumber=true");
  });

  it("says when the number isn't in the account or HQ isn't https", async () => {
    fakeTwilio([[/IncomingPhoneNumbers\.json/, { incoming_phone_numbers: [] }]]);
    expect((await connectNumber("+19525550000")).message).toMatch(/isn't a number in this Twilio account/);
    vi.stubEnv("NEXTAUTH_URL", "http://localhost:3000");
    expect((await connectNumber("+19525550000")).ok).toBe(false);
  });

  it("sends and explains failures", async () => {
    fakeTwilio([[/Messages\.json/, { sid: "SM1", status: "queued" }, 201]]);
    expect(await sendSms({ from: "+19522437646", to: "+16125550101", body: "Hi" })).toEqual({ ok: true, sid: "SM1", status: "queued" });
    expect(new URLSearchParams(calls[0].body).get("StatusCallback")).toBe("https://hq.example.com/api/twilio/status");
    fakeTwilio([[/Messages\.json/, { code: 21610 }, 400]]);
    const r = await sendSms({ from: "+19522437646", to: "+16125550101", body: "Hi" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/STOP/);
  });
});
