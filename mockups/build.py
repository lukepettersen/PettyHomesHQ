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
        html.append(f'<div class="pg" id="pg-{key}" hidden>\n{body}\n</div>')
        api = ""
        if key == "deals":
            api = ('\nreturn { open(h) { try { history.replaceState(null, "", h); } catch (_) {}\n'
                   '  const m = (h || "").match(/^#contact-([\\w-]+)$/);\n'
                   '  if (m) { openContact = m[1]; tlFilter = "all"; editCard = null; draft = null; render(); window.scrollTo(0, 0); } } };')
        js.append(f"INIT.{key} = function (document) {{\n{script}{api}\n}};")

    page = f"""<title>PettyHomes HQ Mockup</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=Public+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
:root {{ --bg: #f4f6f7; }}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{ --bg: #0f171c; color-scheme: dark; }} }}
:root[data-theme="dark"] {{ --bg: #0f171c; color-scheme: dark; }}
body {{ background: var(--bg); }}
.pg {{ min-height: 100%; }}
{chr(10).join(css)}
</style>
{chr(10).join(html)}
<script>
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
