#!/usr/bin/env python3
"""Combine the mockup pages into one self-contained page.

Each page keeps its own markup, styles and script, but lives in its own
container: styles are scoped to that container, and the page's script runs
inside a function that is handed a container-scoped `document`. The top nav
links switch containers instead of loading another file.

Usage: python3 mockups/build.py <out-file>
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).parent
PAGES = [("people", "people.html"), ("deals", "deals-pipeline.html"), ("tasks", "tasks.html"),
         ("messages", "messages.html"), ("admin", "admin.html")]
DEFAULT = "deals"

# Petty Homes brand (Visual Guidelines): Clean Moss #727755, Misty Gray #e2dbcf,
# Mint Tulip #aac1a1, Burnt Charcoal #383232, Close to Coral #cc7855,
# Rabbit Gray #bbbbb3; typeface Mukta Mahee (fallback Helvetica Neue).
# Applied on top of every page so the page sources stay untouched.
FONTS = "https://fonts.googleapis.com/css2?family=Mukta+Mahee:wght@400;500;600;700;800&display=swap"
BRAND_CSS = """
:root {
  --bg: #fbf6f2; --surface: #ffffff; --sunken: #f2ece4; --line: #e2dbcf; --fg: #383232; --muted: #6f6863;
  --accent: #5f6447; --accent-soft: #e8ede2; --ok: #4c7642; --ok-soft: #e3eedd; --warn: #a3552d; --warn-soft: #f8e5da;
  --bad: #ad3628; --bad-soft: #f7e0dc; --waive: #6c6670; --waive-soft: #ecebe7;
  --moss: #727755; --misty: #e2dbcf; --mint: #aac1a1; --charcoal: #383232; --coral: #cc7855;
  --font-display: "Mukta Mahee", "Helvetica Neue", Helvetica, Arial, sans-serif;
  --font-body: "Mukta Mahee", "Helvetica Neue", Helvetica, Arial, sans-serif;
  --font-data: "Mukta Mahee", "Helvetica Neue", Helvetica, Arial, sans-serif;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #262121; --surface: #322c2c; --sunken: #3c3535; --line: #4a4242; --fg: #f2ece6; --muted: #b6aea6;
  --accent: #aac1a1; --accent-soft: #3a4434; --ok: #9cc493; --ok-soft: #2e3b2a; --warn: #e39a75; --warn-soft: #4a3125;
  --bad: #f08a7c; --bad-soft: #4a2723; --waive: #c4bdc9; --waive-soft: #3b3540; color-scheme: dark; } }
:root[data-theme="dark"] {
  --bg: #262121; --surface: #322c2c; --sunken: #3c3535; --line: #4a4242; --fg: #f2ece6; --muted: #b6aea6;
  --accent: #aac1a1; --accent-soft: #3a4434; --ok: #9cc493; --ok-soft: #2e3b2a; --warn: #e39a75; --warn-soft: #4a3125;
  --bad: #f08a7c; --bad-soft: #4a2723; --waive: #c4bdc9; --waive-soft: #3b3540; color-scheme: dark; }
.pg { font-size: 14.5px; }
.pg h1 { font-weight: 800; letter-spacing: -.005em; }
.pg .topnav { background: var(--moss); border-bottom: 0; }
.pg .topnav nav a { color: var(--misty); }
.pg .topnav nav a:hover { color: #ffffff; }
.pg .topnav nav a.on { color: #ffffff; border-bottom-color: var(--coral); border-bottom-width: 3px; }
.pg .brand { display: flex; align-items: center; gap: 10px; color: var(--misty); padding-block: 10px; }
.pg .brand svg { width: 22px; height: 31px; flex: none; }
.pg .brand .wm { color: var(--misty); font-weight: 800; font-size: 17px; letter-spacing: .03em; text-transform: uppercase; line-height: 1; }
.pg .brand .hq { font-weight: 800; font-size: 12px; letter-spacing: .08em; color: var(--charcoal); background: var(--misty); padding: 3px 6px 1px; border-radius: 4px; line-height: 1.2; }
.pg .mock-bar { background: var(--misty); color: var(--charcoal); }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .pg .mock-bar { background: #3c3535; color: var(--fg); } }
:root[data-theme="dark"] .pg .mock-bar { background: #3c3535; color: var(--fg); }
"""
LOGO = (HERE / "logo-mark.svg").read_text().strip()
BRAND_HTML = f'<div class="brand">{LOGO}<span class="wm">Petty Homes</span><span class="hq">HQ</span></div>'



def split_rules(css):
    """Yield (prelude, body) for each top-level rule."""
    i, n = 0, len(css)
    while i < n:
        j = css.find("{", i)
        if j == -1:
            return
        depth, k = 1, j + 1
        while k < n and depth:
            depth += {"{": 1, "}": -1}.get(css[k], 0)
            k += 1
        yield css[i:j].strip(), css[j + 1:k - 1]
        i = k


def scope_selector(sel, prefix):
    sel = sel.strip()
    if sel.startswith(":root") or sel == "html":
        return sel
    if sel == "body":
        return prefix
    if sel == "*":
        return f"{prefix}, {prefix} *"
    sel = re.sub(r"^(html,\s*)?body\b", prefix, sel)
    return sel if sel.startswith(prefix) else f"{prefix} {sel}"


def scope_css(css, prefix):
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    out = []
    for prelude, body in split_rules(css):
        if prelude.startswith("@media") or prelude.startswith("@supports"):
            out.append(f"{prelude} {{{scope_css(body, prefix)}}}")
        elif prelude.startswith("@"):
            out.append(f"{prelude} {{{body}}}")
        else:
            sels = [s for s in prelude.split(",") if s.strip() and s.strip() != "html"]
            if sels:
                out.append(", ".join(scope_selector(s, prefix) for s in sels) + f" {{{body}}}")
    return "\n".join(out)


def parts(src):
    styles = "\n".join(re.findall(r"<style>(.*?)</style>", src, flags=re.S))
    script = re.search(r"<script>(.*?)</script>", src, flags=re.S).group(1)
    body = re.sub(r"<style>.*?</style>|<script>.*?</script>|<title>.*?</title>|<link [^>]*>", "", src, flags=re.S)
    return styles, script, body.strip()


def main(out):
    css, html, js = [], [], []
    for key, fname in PAGES:
        styles, script, body = parts((HERE / fname).read_text())
        css.append(scope_css(styles, f"#pg-{key}"))
        body = body.replace('<div class="brand">Petty Homes <span>HQ</span></div>', BRAND_HTML)
        html.append(f'<div class="pg" id="pg-{key}" hidden>\n{body}\n</div>')
        api = ""
        if key == "deals":
            api = ('\nreturn { open(h) { try { history.replaceState(null, "", h); } catch (_) {}\n'
                   '  const m = (h || "").match(/^#contact-([\\w-]+)$/);\n'
                   '  if (m) { openContact = m[1]; tlFilter = "all"; editCard = null; draft = null; render(); window.scrollTo(0, 0); } } };')
        if key == "tasks":
            api = ('\nreturn { onShow() { const n = drain(); if (n) { render(); '
                   'toast(`${n} new task${n === 1 ? "" : "s"} from a template.`); } } };')
        js.append(f"INIT.{key} = function (document) {{\n{script}{api}\n}};")

    ids = ", ".join(f"#pg-{k}" for k, _ in PAGES)
    # :is(#ids) gives brand rules the same ID-level specificity as the scoped page rules, and they come last.
    brand_css = BRAND_CSS.replace(".pg ", f":is({ids}) ")
    page = f"""<title>PettyHomes HQ Mockup</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{FONTS}">
<style>
:root {{ --bg: #f4f6f7; }}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{ --bg: #0f171c; color-scheme: dark; }} }}
:root[data-theme="dark"] {{ --bg: #0f171c; color-scheme: dark; }}
body {{ background: var(--bg); }}
.pg {{ min-height: 100%; }}
{chr(10).join(css)}
{brand_css}
</style>
{chr(10).join(html)}
<script>
{(HERE / "shared.js").read_text()}
const INIT = {{}}, API = {{}};
{chr(10).join(js)}
function scopedDoc(root) {{
  return {{
    getElementById: id => root.querySelector("#" + CSS.escape(id)),
    querySelector: s => root.querySelector(s),
    querySelectorAll: s => root.querySelectorAll(s),
    addEventListener: (t, f, o) => root.addEventListener(t, f, o),
    createElement: (...a) => document.createElement(...a),
  }};
}}
function show(key, hash) {{
  document.querySelectorAll(".pg").forEach(p => p.hidden = p.id !== "pg-" + key);
  if (!API[key]) API[key] = INIT[key](scopedDoc(document.getElementById("pg-" + key))) || {{}};
  if (hash && API[key].open) API[key].open(hash);
  if (API[key].onShow) API[key].onShow();
  window.scrollTo(0, 0);
}}
document.addEventListener("click", e => {{
  const a = e.target.closest("a[href]"); if (!a) return;
  const m = a.getAttribute("href").match(/^(people|deals|tasks|messages|admin)\\.html(#[\\w-]+)?$/);
  if (!m) return;
  e.preventDefault(); show(m[1], m[2]);
}}, true);
const start = location.hash.replace("#", "");
show(INIT[start] ? start : "{DEFAULT}", /^#contact-/.test(location.hash) ? location.hash : null);
</script>
"""
    Path(out).write_text(page)


if __name__ == "__main__":
    main(sys.argv[1])
