import { describe, expect, it } from "vitest";
import { centralDayStart, isStartWord, isStopWord, missedDial, sendProblem, toE164, voiceTwiml } from "./texting";
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
});
