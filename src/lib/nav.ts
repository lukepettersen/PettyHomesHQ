// The top bar's tabs and their order (owner 2026-11-02; Admin → Top bar can reorder them). Pure, tested.
export const NAV_ITEMS = [
  { key: "whiteboard", label: "Whiteboard", href: "/whiteboard" }, // only the owner sees it
  { key: "tasks", label: "Tasks", href: "/tasks" },
  { key: "messages", label: "Messages", href: "/messages" },
  { key: "people", label: "People", href: "/people" },
  { key: "pipeline", label: "Pipeline", href: "/pipeline" },
  { key: "tools", label: "Tools ▾", href: "" },
  { key: "admin", label: "Admin", href: "/admin" },
] as const;
export type NavKey = (typeof NAV_ITEMS)[number]["key"];
export const NAV_KEY = "nav.order";

/** A saved order, cleaned: unknown tabs dropped, tabs added later put at the end. */
export function navOrder(saved: unknown): NavKey[] {
  const all = NAV_ITEMS.map((i) => i.key) as NavKey[];
  const picked = (Array.isArray(saved) ? saved : []).filter((k, i, a): k is NavKey => all.includes(k as NavKey) && a.indexOf(k) === i);
  return [...picked, ...all.filter((k) => !picked.includes(k))];
}
