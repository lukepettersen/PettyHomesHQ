"use client";

import { useEffect, useRef } from "react";

/** A side column that scrolls with the page until its bottom is on screen, then stays put, like Follow Up Boss
 *  (owner request 2026-10-29). A column shorter than the screen just sticks at the top. */
export function StickySide({ as: Tag = "div", className, children }: { as?: "div" | "aside"; className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const place = () => el.style.setProperty("--side-top", `${Math.min(12, window.innerHeight - el.offsetHeight - 12)}px`);
    place();
    const ro = new ResizeObserver(place);
    ro.observe(el);
    window.addEventListener("resize", place);
    return () => { ro.disconnect(); window.removeEventListener("resize", place); };
  }, []);
  return <Tag ref={ref as React.Ref<HTMLDivElement>} className={className}>{children}</Tag>;
}
