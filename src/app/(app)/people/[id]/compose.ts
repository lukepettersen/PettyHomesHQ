// Text / Email on the contact card (and Reply on a timeline email) open one composer at the top of the middle column,
// above whatever tab is showing (owner request 2026-10-28). FileTabs listens for COMPOSE_EVENT.
export const COMPOSE_EVENT = "hq-compose";
export type ComposeRequest = { kind: "send" | "email"; subject?: string };
export function requestCompose(kind: "send" | "email", subject?: string) {
  window.dispatchEvent(new CustomEvent<ComposeRequest>(COMPOSE_EVENT, { detail: { kind, subject } }));
}
