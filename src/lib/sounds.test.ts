import { describe, expect, it } from "vitest";
import { cleanSoundPrefs, peakGain, SOUND_DEFAULTS } from "./sounds";

describe("sound volumes", () => {
  it("defaults to 100% and keeps values 0–200 in steps of 5", () => {
    expect(cleanSoundPrefs(null)).toEqual(SOUND_DEFAULTS);
    expect(cleanSoundPrefs({ alarms: 152, alerts: -3, calls: 999, junk: 5 })).toEqual({ alarms: 150, alerts: 0, calls: 200 });
  });
  it("scales the usual loudness and never clips", () => {
    expect(peakGain(0.3, 100)).toBeCloseTo(0.3);
    expect(peakGain(0.3, 50)).toBeCloseTo(0.15);
    expect(peakGain(0.6, 200)).toBe(0.95);
  });
});
