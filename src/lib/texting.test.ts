import { describe, expect, it } from "vitest";
import { callLength, centralDayStart, otherRoute, isStartWord, isStopWord, missedDial, outboundTwiml, sendProblem, toE164, voiceTwiml } from "./texting";
import { twilioSignature, validTwilioRequest } from "./twilioSig";

describe("texting", () => {
  it("formats numbers for Twilio", () => {
    expect(toE164("952-243-7646")).toBe("+19522437646");
    expect(toE164("+1 (612) 555-0101")).toBe("+16125550101");
    expect(toE164("555-0101")).toBeNull();
    expect(toE164("1234567890")).toBeNull();
  });
  it("knows STOP and START", () => {
    expect(isStopWord(" stop ")).toBe(true);
    expect(isStopWord("Unsubscribe.")).toBe(true);
    expect(isStopWord("stop texting me at work")).toBe(false);
    expect(isStartWord("Start")).toBe(true);
    expect(isStartWord("yes!")).toBe(true);
    expect(isStartWord("yes see you then")).toBe(false);
  });
  it("checks Twilio's signature", () => {
    // Example from Twilio's security docs.
    const url = "https://mycompany.com/myapp.php?foo=1&bar=2";
    const params = { CallSid: "CA1234567890ABCDE", Caller: "+12349013030", Digits: "1234", From: "+12349013030", To: "+18005551212" };
    expect(twilioSignature(url, params, "12345")).toBe("0/KCTR6DLpKmkAf8muzZqo1nDgQ=");
    expect(validTwilioRequest(url, params, "12345", "0/KCTR6DLpKmkAf8muzZqo1nDgQ=")).toBe(true);
    expect(validTwilioRequest(url, { ...params, Digits: "9" }, "12345", "0/KCTR6DLpKmkAf8muzZqo1nDgQ=")).toBe(false);
    expect(validTwilioRequest(url, params, "12345", null)).toBe(false);
  });
  it("forwards calls or says the missed-call message", () => {
    expect(voiceTwiml({ forwardTo: "+16125550101", callerId: "+19525550000", action: "https://x/done" })).toContain('<Dial timeout="20" answerOnBridge="true" callerId="+19525550000" action="https://x/done">+16125550101</Dial>');
    expect(voiceTwiml({})).toContain("<Say");
    const rec = voiceTwiml({ forwardTo: "+16125550101", record: "https://x/rec", notice: true });
    expect(rec).toMatch(/^.*<Say voice="Polly.Joanna">This call may be recorded.<\/Say><Dial /);
    expect(rec).toContain('record="record-from-answer-dual" recordingStatusCallback="https://x/rec" recordingStatusCallbackEvent="completed"');
    expect(voiceTwiml({ forwardTo: "+16125550101" })).not.toContain("record=");
    expect([callLength(45), callLength(240), callLength(3900)]).toEqual(["45 sec", "4 min", "1 hr 5 min"]);
    expect(voiceTwiml({ say: "a & b" })).toContain("a &amp; b");
    expect(missedDial("no-answer")).toBe(true);
    expect(missedDial("completed")).toBe(false);
  });
  it("explains Twilio errors", () => {
    expect(sendProblem(21610)).toMatch(/STOP/);
    expect(sendProblem(30034)).toMatch(/registration/);
    expect(sendProblem(99999, "Oops")).toBe("Oops");
  });
  it("finds the start of the Central day", () => {
    expect(centralDayStart(new Date("2026-10-20T16:00:00Z")).toISOString()).toBe("2026-10-20T05:00:00.000Z"); // CDT
    expect(centralDayStart(new Date("2026-12-20T03:00:00Z")).toISOString()).toBe("2026-12-19T06:00:00.000Z"); // CST, still the 19th in Chicago
  });
  it("matches the other delivery of the same text", () => {
    expect(otherRoute("IM123")).toEqual({ not: { startsWith: "IM" } });
    expect(otherRoute("MM123")).toEqual({ startsWith: "IM" });
    expect(otherRoute("SM123")).toEqual({ startsWith: "IM" });
  });
});

describe("calling in HQ (owner request 2026-10-27)", () => {
  it("dials out showing the HQ number, with the recording notice to the person called", () => {
    expect(outboundTwiml({ to: "+16125550101", callerId: "+19525550000", action: "https://hq/done", record: "https://hq/rec", whisper: "https://hq/w" }))
      .toBe('<?xml version="1.0" encoding="UTF-8"?><Response><Dial timeout="40" answerOnBridge="true" callerId="+19525550000" action="https://hq/done" record="record-from-answer-dual" recordingStatusCallback="https://hq/rec" recordingStatusCallbackEvent="completed"><Number url="https://hq/w">+16125550101</Number></Dial></Response>');
    expect(outboundTwiml({ to: null, callerId: "", action: "" })).toContain("can't be called");
  });
  it("rings HQ in the browser on incoming calls, with or without a cell", () => {
    expect(voiceTwiml({ client: "hq_u1", action: "https://hq/done" })).toContain('<Dial timeout="20" answerOnBridge="true" action="https://hq/done"><Client>hq_u1</Client></Dial>');
    expect(voiceTwiml({ forwardTo: "+16125550188", client: "hq_u1" })).toContain("<Number>+16125550188</Number><Client>hq_u1</Client>");
  });
});
