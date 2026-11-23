import { describe, expect, it } from "vitest";
import { domToMarkdown, type RNode } from "./richText";

// A tiny DOM-like tree: el("B", ["hi"]) and plain strings for text.
const el = (tag: string, children: (RNode | string)[] = [], attrs: Record<string, string> = {}): RNode => ({
  nodeType: 1, nodeName: tag, childNodes: children.map((c) => (typeof c === "string" ? { nodeType: 3, nodeName: "#text", data: c, childNodes: [] } : c)), getAttribute: (n) => attrs[n] ?? null,
});
const root = (...c: (RNode | string)[]) => el("DIV", c);

describe("the message box back to HQ's formatting (owner request 2026-11-23)", () => {
  it("keeps bold, links, lines, lists and images", () => {
    expect(domToMarkdown(root("Hi ", el("B", ["Sarah"]), "!", el("BR"), el("BR"), "See ", el("A", ["the listing"], { href: "https://x.com/a" }), el("BR")))).toBe("Hi **Sarah**!\n\nSee [the listing](https://x.com/a)");
    expect(domToMarkdown(root("Intro", el("BR"), el("UL", [el("LI", ["one"]), el("LI", [el("B", ["two"])])]), "after", el("BR")))).toBe("Intro\n- one\n- **two**\nafter");
    expect(domToMarkdown(root(el("IMG", [], { src: "https://hq/img/a.png", alt: "logo" }), "Hello", el("BR")))).toBe("![logo](https://hq/img/a.png)\nHello");
    expect(domToMarkdown(root(el("A", [el("IMG", [], { src: "https://hq/img/a.png", alt: "b" })], { href: "https://site.com" }), "x"))).toBe("[![b](https://hq/img/a.png)](https://site.com)\nx");
    expect(domToMarkdown(root("line one", el("DIV", ["line two"]), el("DIV", [el("BR")]), el("DIV", ["line four"])))).toBe("line one\nline two\n\nline four");
    expect(domToMarkdown(root(el("A", ["https://a.com"], { href: "https://a.com" }), " and ", el("B", [" "]), "{first_name}"))).toBe("https://a.com and  {first_name}");
    expect(domToMarkdown(root(el("A", ["bad"], { href: "javascript:alert(1)" })))).toBe("bad");
  });
});
