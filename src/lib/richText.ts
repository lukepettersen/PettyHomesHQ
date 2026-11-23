// The email message box shows formatting as you type (owner request 2026-11-23: "can it just show as bold?"). Messages
// are still saved and sent as HQ's light formatting (**bold**, [words](link), "- " bullets, ![image](address)), so
// templates, merge fields and sending don't change; this turns the box's HTML back into that. Pure (works on any
// DOM-like tree), unit tested in richText.test.ts.

export type RNode = { nodeType: number; nodeName: string; data?: string | null; childNodes: ArrayLike<RNode>; getAttribute?: (n: string) => string | null };

const BLOCK = new Set(["DIV", "P", "H1", "H2", "H3", "H4", "BLOCKQUOTE", "PRE"]);
const kids = (n: RNode) => Array.from(n.childNodes);

/** The box's content → HQ's light formatting. */
export function domToMarkdown(root: RNode): string {
  let out = "";
  const nl = () => { if (out && !out.endsWith("\n")) out += "\n"; };
  const inner = (n: RNode): string => { const save = out; out = ""; kids(n).forEach(walk); const r = out; out = save; return r; };
  function walk(n: RNode) {
    if (n.nodeType === 3) { out += (n.data ?? "").replace(/ /g, " "); return; }
    if (n.nodeType !== 1) return;
    const tag = n.nodeName.toUpperCase();
    const attr = (a: string) => n.getAttribute?.(a) ?? "";
    if (tag === "BR") { out += "\n"; return; }
    // Images sit on their own line (a banner, a logo), as the Image button adds them.
    if (tag === "IMG") { const src = attr("src"); if (/^https:\/\//.test(src)) { nl(); out += `![${attr("alt").replace(/[[\]\n]/g, " ")}](${src})\n`; } return; }
    if (tag === "B" || tag === "STRONG") {
      const t = inner(n);
      const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(t)!;
      out += m[2] && !m[2].includes("\n") ? `${m[1]}**${m[2]}**${m[3]}` : t;
      return;
    }
    if (tag === "A") {
      const href = attr("href"), t = inner(n);
      if (!/^https?:\/\/\S+$/.test(href)) { out += t; return; }
      if (/!\[[^\]\n]*\]\(https:\/\/[^\s)]+\)/.test(t)) { nl(); out += `[${t.trim()}](${href})\n`; return; } // a clickable image
      out += t.trim() === href ? href : `[${t.trim() || href}](${href})`;
      return;
    }
    if (tag === "UL" || tag === "OL") {
      nl();
      for (const li of kids(n)) {
        const t = li.nodeType === 1 ? inner(li).replace(/\n+$/, "").replace(/\n/g, " ") : (li.data ?? "").trim();
        if (t.trim()) out += `- ${t.trim()}\n`;
      }
      return;
    }
    if (BLOCK.has(tag)) {
      nl();
      const t = inner(n);
      out += t;
      if (!t.endsWith("\n")) out += "\n";
      return;
    }
    kids(n).forEach(walk); // span, font, i, u…: just their words
  }
  kids(root).forEach(walk);
  return out.replace(/[ \t]+\n/g, "\n").replace(/\n+$/, "");
}

/** HQ's light formatting → HTML for the message box (the same as the email, without the outer wrapper). */
export function editorHtml(markdown: string, toHtml: (s: string) => string): string {
  return toHtml(markdown).replace(/^<div[^>]*>/, "").replace(/<\/div>$/, "").replace(/>\n</g, "><");
}
