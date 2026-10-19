"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Talk-to-type with the browser's own speech recognition (Chrome, Edge, Safari). Like Relay, it never
// restarts itself (that froze iPhone Safari): if the browser stops listening, the words so far are kept
// and you tap the mic again to keep going.
type Rec = { lang: string; continuous: boolean; interimResults: boolean; start: () => void; stop: () => void;
  onresult: ((e: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };
const api = (): (new () => Rec) | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

/** `text` is everything heard this round (kept across browser pauses) until `clear()`. */
export function useSpeech() {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const rec = useRef<Rec | null>(null);
  const kept = useRef("");
  useEffect(() => { const t = setTimeout(() => setSupported(!!api()), 0); return () => { clearTimeout(t); rec.current?.stop(); }; }, []);

  const start = useCallback(() => {
    const Api = api();
    if (!Api || rec.current) return;
    const r = new Api();
    r.lang = "en-US"; r.continuous = true; r.interimResults = true;
    const before = kept.current;
    r.onresult = (e) => {
      let heard = "";
      for (let i = 0; i < e.results.length; i++) heard += e.results[i][0].transcript;
      kept.current = `${before} ${heard}`.trim();
      setText(kept.current);
    };
    r.onerror = (e) => { if (e.error === "not-allowed" || e.error === "service-not-allowed") setError("The browser blocked the microphone. Allow it in the address bar, or type instead."); };
    r.onend = () => { rec.current = null; setListening(false); };
    rec.current = r;
    try { r.start(); setListening(true); setError(""); } catch { rec.current = null; }
  }, []);
  const stop = useCallback(() => rec.current?.stop(), []);
  const clear = useCallback(() => { kept.current = ""; setText(""); }, []);
  const set = useCallback((v: string) => { kept.current = v; setText(v); }, []);
  return { supported, listening, text, error, start, stop, clear, set };
}
