import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { OWNER_TEXT_MAX, OWNER_TEXTS_PER_HOUR, TOOLS, clampInt, ownerTextProblem, pickVersion, pkceOk, redirectAllowed, rpcError, rpcResult, safeBack, withDefaults } from "./mcp";

describe("redirectAllowed", () => {
  it("accepts Claude's own callback", () => {
    expect(redirectAllowed("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(redirectAllowed("https://claude.com/api/mcp/auth_callback")).toBe(true);
  });
  it("accepts this computer for testing", () => {
    expect(redirectAllowed("http://localhost:6274/oauth/callback")).toBe(true);
    expect(redirectAllowed("http://127.0.0.1:33418/callback")).toBe(true);
  });
  it("turns everything else away", () => {
    for (const u of ["https://evil.com/api/mcp/auth_callback", "https://claude.ai.evil.com/api/mcp/auth_callback", "http://claude.ai/api/mcp/auth_callback",
      "https://claude.ai/other", "https://claude.ai:8443/api/mcp/auth_callback", "https://x@claude.ai/api/mcp/auth_callback", "https://claude.ai/api/mcp/auth_callback#x",
      "http://localhost.evil.com/cb", "javascript:alert(1)", "not a url", ""]) expect(redirectAllowed(u), u).toBe(false);
  });
});

describe("pkceOk", () => {
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  it("matches the S256 challenge", () => expect(pkceOk(verifier, challenge)).toBe(true));
  it("rejects a wrong or short verifier", () => {
    expect(pkceOk(verifier.replace("d", "e"), challenge)).toBe(false);
    expect(pkceOk("short", createHash("sha256").update("short").digest("base64url"))).toBe(false);
    expect(pkceOk(verifier, "")).toBe(false);
  });
});

describe("safeBack", () => {
  it("keeps paths on HQ", () => expect(safeBack("/api/mcp/authorize?client_id=1&x=2")).toBe("/api/mcp/authorize?client_id=1&x=2"));
  it("sends anything else home", () => {
    for (const u of ["https://evil.com", "//evil.com", "/\\evil.com", "", null, undefined]) expect(safeBack(u)).toBe("/");
  });
});

describe("protocol helpers", () => {
  it("answers with their version when HQ speaks it", () => {
    expect(pickVersion("2025-06-18")).toBe("2025-06-18");
    expect(pickVersion("1999-01-01")).toBe("2025-11-25");
    expect(pickVersion(undefined)).toBe("2025-11-25");
  });
  it("builds JSON-RPC answers", () => {
    expect(rpcResult(1, { a: 1 })).toEqual({ jsonrpc: "2.0", id: 1, result: { a: 1 } });
    expect(rpcError("x", -32601, "Method not found")).toEqual({ jsonrpc: "2.0", id: "x", error: { code: -32601, message: "Method not found" } });
  });
  it("clamps numbers", () => {
    expect(clampInt(500, 1, 50, 20)).toBe(50);
    expect(clampInt("5", 1, 50, 20)).toBe(20);
    expect(clampInt(3.4, 1, 50, 20)).toBe(3);
  });
});

describe("tools", () => {
  it("have unique names and object schemas", () => {
    expect(new Set(TOOLS.map((t) => t.name)).size).toBe(TOOLS.length);
    for (const t of TOOLS) expect((t.inputSchema as { type: string }).type).toBe("object");
  });
  it("marks only reads as read-only", () => {
    const ro = TOOLS.filter((t) => t.annotations.readOnlyHint).map((t) => t.name).sort();
    expect(ro).toEqual(["find_people", "list_text_threads", "my_schedule", "person_details", "read_texts"]);
  });
  it("fills in what Claude leaves out, without overriding what it sent", () => {
    expect(withDefaults("add_task", { title: "Call", due: "2026-11-20" })).toEqual({ title: "Call", due: "2026-11-20", person_id: "", time: "", assignee: "", kind: "followup" });
    expect(withDefaults("add_note", { person_id: "p", body: "b", kind: "call" }).kind).toBe("call");
    expect(withDefaults("find_people", { query: "x" })).toEqual({ query: "x" });
  });
});

describe("text_owner", () => {
  const tool = TOOLS.find((t) => t.name === "text_owner")!;
  const props = (tool.inputSchema as { properties: Record<string, unknown>; additionalProperties?: boolean });
  it("takes only a message, never who to text", () => {
    expect(Object.keys(props.properties)).toEqual(["body"]);
    expect(props.additionalProperties).toBe(false);
  });
  it("says it reaches only the owner, and send_text still needs a yes", () => {
    expect(tool.description).toMatch(/OWN cell/);
    expect(tool.description).toMatch(/never to anyone else/);
    expect(TOOLS.find((t) => t.name === "send_text")!.description).toMatch(/Only call this after the owner has seen the exact message and said yes/);
  });
  it("sends a normal message", () => expect(ownerTextProblem("Showing at 4 is confirmed", 0)).toBeNull());
  it("rejects an empty message", () => {
    for (const b of ["", "   ", undefined, null, 5]) expect(ownerTextProblem(b, 0), String(b)).toBe("Write a message.");
  });
  it("caps the length", () => {
    expect(ownerTextProblem("x".repeat(OWNER_TEXT_MAX), 0)).toBeNull();
    expect(ownerTextProblem("x".repeat(OWNER_TEXT_MAX + 1), 0)).toMatch(/up to 1000 characters/);
  });
  it("limits how many go out in an hour", () => {
    expect(ownerTextProblem("hi", OWNER_TEXTS_PER_HOUR - 1)).toBeNull();
    expect(ownerTextProblem("hi", OWNER_TEXTS_PER_HOUR)).toMatch(/last hour/);
  });
});
