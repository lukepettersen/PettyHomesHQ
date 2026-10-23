import { describe, expect, it } from "vitest";
import { conversationMedia, isOurImage, plainMedia, textWithPhotos } from "./textMedia";

describe("photos in texts", () => {
  it("reads photos from both webhooks", () => {
    expect(plainMedia({ NumMedia: "2", MediaUrl0: "https://api.twilio.com/a", MediaContentType0: "image/jpeg", MediaUrl1: "https://api.twilio.com/b", MediaContentType1: "image/png" }))
      .toEqual([{ url: "https://api.twilio.com/a", type: "image/jpeg" }, { url: "https://api.twilio.com/b", type: "image/png" }]);
    expect(plainMedia({ NumMedia: "0" })).toEqual([]);
    expect(conversationMedia({ ChatServiceSid: "IS1", Media: '[{"Sid":"ME1","ContentType":"image/jpeg"}]' })).toEqual([{ service: "IS1", sid: "ME1", type: "image/jpeg" }]);
    expect(conversationMedia({ ChatServiceSid: "IS1", Media: "nope" })).toEqual([]);
  });
  it("only sends HQ's own uploaded photos", () => {
    expect(isOurImage("https://hq.example.com/api/img/abcdefghijklmnopqrstuvwx.jpg", "https://hq.example.com")).toBe(true);
    expect(isOurImage("https://evil.com/api/img/abcdefghijklmnopqrstuvwx.jpg", "https://hq.example.com")).toBe(false);
  });
  it("labels photo-only texts", () => {
    expect(textWithPhotos("", [{}])).toBe("📷 Photo");
    expect(textWithPhotos("Look!", [{}])).toBe("Look!");
  });
});
