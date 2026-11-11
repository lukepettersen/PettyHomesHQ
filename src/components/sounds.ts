"use client";

import { peakGain, SOUND_DEFAULTS, type SoundKind, type SoundPrefs } from "@/lib/sounds";

// The chimes HQ plays, at each person's chosen loudness (src/lib/sounds.ts). The settings are put on the page by
// <SoundPrefsInit> and updated right away when saved on My settings.
declare global { interface Window { hqSounds?: SoundPrefs } }

export const soundPct = (k: SoundKind) => (typeof window === "undefined" ? 100 : window.hqSounds?.[k] ?? SOUND_DEFAULTS[k]);

type Tone = { at: number; freq: number; len: number; type?: OscillatorType };
function tones(ctx: AudioContext, list: Tone[], usual: number, pct: number) {
  if (pct <= 0 || ctx.state !== "running") return;
  const peak = Math.max(0.0002, peakGain(usual, pct));
  for (const t of list) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = t.type ?? "sine"; o.frequency.value = t.freq;
    g.gain.setValueAtTime(0.0001, ctx.currentTime + t.at);
    g.gain.exponentialRampToValueAtTime(peak, ctx.currentTime + t.at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t.at + t.len);
    o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + t.at); o.stop(ctx.currentTime + t.at + t.len + 0.01);
  }
}

/** Task alarm: three quick beeps (repeats every 2 seconds while ringing). */
export const playAlarm = (ctx: AudioContext, pct = soundPct("alarms")) =>
  tones(ctx, [{ at: 0, freq: 880, len: 0.16 }, { at: 0.18, freq: 880, len: 0.16 }, { at: 0.36, freq: 1320, len: 0.16 }], 0.35, pct);

/** A new alert (the bell pop-up): two rising notes. */
export const playAlert = (ctx: AudioContext, pct = soundPct("alerts")) =>
  tones(ctx, [{ at: 0, freq: 784, len: 0.3 }, { at: 0.15, freq: 1046, len: 0.3 }], 0.3, pct);

/** An incoming call when its volume isn't the usual (Twilio's own ring plays at 100): a phone-like double ring. */
export const playRing = (ctx: AudioContext, pct = soundPct("calls")) =>
  tones(ctx, [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95].map((at, i) => ({ at, freq: i % 2 ? 480 : 440, len: 0.05 })), 0.3, pct);

let shared: AudioContext | null = null;
/** One AudioContext for sounds that aren't tied to a component (My settings' Test, the call ring); browsers only
 *  allow it after a click or key press on the page. */
export function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try { shared ??= new AudioContext(); } catch { return null; }
  if (shared.state === "suspended") void shared.resume();
  return shared;
}
