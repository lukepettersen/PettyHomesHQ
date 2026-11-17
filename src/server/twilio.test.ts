import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { connectNumber, createGroup, listNumbers, postGroupMessage, sendSms, setGroupAddress } from "./twilio";

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

  it("turns group texting on and off for a number", async () => {
    fakeTwilio([[/Configuration\/Addresses\?Type=sms/, { address_configurations: [] }], [/Configuration\/Addresses$/, { sid: "IG1" }]]);
    expect(await setGroupAddress("+16124210399", true, "https://hq.example.com/api/twilio/conversation")).toEqual({ ok: true, message: "Group texting on." });
    const made = calls.find((c) => c.url.endsWith("/v1/Configuration/Addresses"))!;
    expect(made.url).toBe("https://conversations.twilio.com/v1/Configuration/Addresses");
    const f = new URLSearchParams(made.body);
    expect([f.get("Address"), f.get("AutoCreation.Enabled"), f.get("AutoCreation.Type"), f.get("AutoCreation.WebhookUrl"), f.getAll("AutoCreation.WebhookFilters")])
      .toEqual(["+16124210399", "true", "webhook", "https://hq.example.com/api/twilio/conversation", ["onMessageAdded"]]);
    calls = [];
    fakeTwilio([[/Configuration\/Addresses\?Type=sms/, { address_configurations: [{ sid: "IG1", address: "+16124210399" }] }], [/Configuration\/Addresses\/IG1/, {}]]);
    expect((await setGroupAddress("+16124210399", false, "x")).ok).toBe(true);
    expect(calls.some((c) => c.url.endsWith("/Configuration/Addresses/IG1"))).toBe(true);
  });

  it("starts a group text and posts to it", async () => {
    fakeTwilio([[/\/v1\/Conversations$/, { sid: "CH1" }], [/Participants$/, { sid: "MB1" }], [/Webhooks$/, { sid: "WH1" }], [/Messages$/, { sid: "IM1" }]]);
    expect(await createGroup({ ourNumber: "+16124210399", numbers: ["+16125550101", "+16125550199"], name: "Sam, Pat", webhookUrl: "https://hq/api/twilio/conversation" })).toBe("CH1");
    const parts = calls.filter((c) => c.url.endsWith("/Participants")).map((c) => Object.fromEntries(new URLSearchParams(c.body)));
    expect(parts).toEqual([{ "MessagingBinding.Address": "+16125550101" }, { "MessagingBinding.Address": "+16125550199" }, { Identity: "hq:+16124210399", "MessagingBinding.ProjectedAddress": "+16124210399" }]);
    expect(new URLSearchParams(calls.find((c) => c.url.endsWith("/Webhooks"))!.body).get("Configuration.Filters")).toBe("onMessageAdded");
    expect(await postGroupMessage("CH1", "hq:+16124210399", "Hi all")).toEqual({ ok: true, sid: "IM1", status: "sent" });
  });

  it("lists the account's numbers", async () => {
    fakeTwilio([[/IncomingPhoneNumbers\.json\?PageSize=100/, { incoming_phone_numbers: [{ phone_number: "+19522437646", friendly_name: "(952) 243-7646", capabilities: { sms: true, mms: false } }] }]]);
    expect(await listNumbers()).toEqual([{ number: "+19522437646", name: "(952) 243-7646", mms: false }]);
    fakeTwilio([[/IncomingPhoneNumbers/, { message: "no" }, 401]]);
    expect(await listNumbers()).toBeNull();
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
