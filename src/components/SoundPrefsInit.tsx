"use client";

import { useEffect } from "react";
import { audioContext } from "@/components/sounds";
import type { SoundPrefs } from "@/lib/sounds";

/** Puts this person's sound volumes on the page for the chimes, and wakes HQ's sound player on the first click/key
 *  (browsers only allow sound after one). */
export function SoundPrefsInit({ prefs }: { prefs: SoundPrefs }) {
  useEffect(() => {
    window.hqSounds = prefs;
    window.dispatchEvent(new Event("hq-sounds"));
    const wake = () => { audioContext(); };
    window.addEventListener("pointerdown", wake); window.addEventListener("keydown", wake);
    return () => { window.removeEventListener("pointerdown", wake); window.removeEventListener("keydown", wake); };
  }, [prefs]);
  return null;
}
