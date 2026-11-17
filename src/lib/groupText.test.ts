import { describe, expect, it } from "vitest";
import { groupMembers, groupTitle, isGroupKey, otherRecipients, readParticipants } from "./groupText";

const team = ["+16124210399", "+16124553462"];

describe("group texting", () => {
  it("knows group keys", () => {
    expect(isGroupKey("CH0123456789abcdef0123456789abcdef")).toBe(true);
    expect(isGroupKey("G0123456789abcdef0123456789abcdef")).toBe(true);
    expect(isGroupKey("6125550101")).toBe(false);
  });
  it("reads a one-to-one conversation", () => {
    expect(readParticipants([{ messaging_binding: { type: "sms", address: "+16125550101", proxy_address: "+16124210399" } }], team))
      .toEqual({ ourNumber: "+16124210399", members: ["6125550101"], group: false, sender: null });
  });
  it("reads a group text and our sending identity", () => {
    const r = readParticipants([
      { messaging_binding: { type: "group", address: "+16125550101" } },
      { messaging_binding: { type: "group", address: "+16125550199" } },
      { identity: "hq:+16124210399", messaging_binding: { type: "group", projected_address: "+16124210399" } },
    ], team);
    expect(r).toEqual({ ourNumber: "+16124210399", members: ["6125550101", "6125550199"], group: true, sender: "hq:+16124210399" });
  });
  it("finds our number when it's listed as a plain address", () => {
    const r = readParticipants([{ messaging_binding: { type: "group", address: "+16124210399" } }, { messaging_binding: { type: "group", address: "+16125550101" } }, { messaging_binding: { type: "group", address: "+16125550199" } }], team);
    expect(r.ourNumber).toBe("+16124210399"); expect(r.members).toEqual(["6125550101", "6125550199"]); expect(r.group).toBe(true); expect(r.sender).toBeNull();
  });
  it("reads a group text that came in as a plain text", () => {
    const f = { From: "+17632278812", To: "+16124210399", OtherRecipients1: "+16127020295", OtherRecipients0: "+16122264285", Body: "hi" };
    expect(otherRecipients(f)).toEqual(["+16122264285", "+16127020295"]);
    expect(groupMembers(f.From, [...otherRecipients(f), "+16124210399"], f.To)).toEqual(["6122264285", "6127020295", "7632278812"]);
    expect(otherRecipients({ From: "+1", To: "+2" })).toEqual([]);
  });
  it("titles groups", () => { expect(groupTitle(["Sam", "Pat"])).toBe("Sam, Pat"); expect(groupTitle([])).toBe("Group text"); });
});
