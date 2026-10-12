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
/* Side menus follow the page as you scroll, on every tab. */
@media (min-width: 761px) {
  :is(#pg-people, #pg-admin) .side-nav, #pg-tasks .side { position: sticky; top: 12px; align-self: start; max-height: calc(100vh - 24px); overflow-y: auto; }
}
@media (min-width: 1101px) {
  #pg-deals .cleft, #pg-deals .cright { position: sticky; top: 12px; align-self: start; max-height: calc(100vh - 24px); overflow-y: auto; }
}
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
.pg .topnav nav .tools-btn { border: 0; background: none; color: var(--misty); font: inherit; padding: 14px 10px; cursor: pointer; white-space: nowrap; border-bottom: 3px solid transparent; }
.pg .topnav nav .tools-btn:hover, .pg .topnav nav .tools-btn[aria-expanded="true"] { color: #ffffff; }
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
        # Every page re-renders when shown, since people, files and settings are shared.
        api = "\nreturn { onShow() { render(); } };"
        if key == "deals":
            api = ('\nreturn { open(h) { try { history.replaceState(null, "", h); } catch (_) {}\n'
                   '  const m = (h || "").match(/^#contact-([\\w-]+)$/);\n'
                   '  if (m && CONTACTS[m[1]]) { openContact = m[1]; tlFilter = "all"; editCard = null; draft = null; ctab[m[1]] = undefined; window.scrollTo(0, 0); } },\n'
                   '  onShow(h) { if (!h || (openContact && !CONTACTS[openContact])) { openContact = null; editing = null; } render(); } };')
        if key == "tasks":
            api = ('\nreturn { onShow() { const n = drain(); render(); '
                   'if (n) toast(`${n} new task${n === 1 ? "" : "s"} from a template.`); } };')
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
{TOOLS_CSS}
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
let cur = null;
function show(key, hash) {{
  // A contact opened from People/Tasks/Messages remembers where you came from.
  if (key === "deals") HQ.from = !hash ? "deals" : cur && cur !== "deals" ? cur : (HQ.from || "deals");
  cur = key;
  document.querySelectorAll(".pg").forEach(p => p.hidden = p.id !== "pg-" + key);
  const navKey = key === "deals" ? HQ.from : key;
  document.querySelectorAll("#pg-" + key + " .topnav nav a").forEach(a => a.classList.toggle("on", a.getAttribute("href").startsWith(navKey + ".html")));
  if (!API[key]) API[key] = INIT[key](scopedDoc(document.getElementById("pg-" + key))) || {{}};
  if (hash && API[key].open) API[key].open(hash);
  if (API[key].onShow) API[key].onShow(hash);
  window.scrollTo(0, 0);
}}
document.addEventListener("click", e => {{
  const a = e.target.closest("a[href]"); if (!a) return;
  const m = a.getAttribute("href").match(/^(people|deals|tasks|messages|admin)\\.html(#[\\w-]+)?$/);
  if (!m) return;
  e.preventDefault(); show(m[1], m[2]);
}}, true);
{TOOLS_JS}
const start = location.hash.replace("#", "");
show(INIT[start] ? start : "{DEFAULT}", /^#contact-/.test(location.hash) ? location.hash : null);
</script>
"""
    Path(out).write_text(page)


TOOLS_CSS = """
.tools-menu { position: fixed; z-index: 60; background: #fff; color: #383232; border: 1px solid #e2dbcf; border-radius: 10px; box-shadow: 0 10px 30px rgb(0 0 0 / .16); min-width: 240px; max-width: 320px; padding: 6px; font-family: "Mukta Mahee", system-ui, sans-serif; }
.tools-menu a { display: flex; flex-direction: column; padding: 8px 10px; border-radius: 7px; color: #383232; text-decoration: none; font-weight: 600; font-size: 14px; }
.tools-menu a small { color: #6f6863; font-weight: 400; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tools-menu a:hover { background: #f2ece4; }
.tools-menu .tm-empty { padding: 10px; color: #6f6863; font-size: 13px; }
.tools-menu .tm-foot { border-top: 1px solid #e2dbcf; margin-top: 4px; padding-top: 4px; }
.tools-menu .tm-foot button { border: 0; background: none; width: 100%; text-align: left; padding: 8px 10px; border-radius: 7px; color: #5f6447; font-weight: 700; font-size: 13px; cursor: pointer; }
.tools-menu .tm-foot button:hover { background: #f2ece4; }
.bell-btn { margin-left: auto; position: relative; border: 0; background: none; color: #e2dbcf; padding: 8px; cursor: pointer; display: grid; place-items: center; }
.bell-btn:hover { color: #fff; }
.bell-n { position: absolute; top: 2px; right: 0; background: #cc7855; color: #fff; font-size: 10.5px; font-weight: 800; min-width: 17px; height: 17px; border-radius: 999px; display: grid; place-items: center; padding: 0 4px; }
.bell-n[hidden] { display: none; }
.bell-menu { min-width: 320px; max-width: 380px; }
.bell-menu .bm-h { display: flex; justify-content: space-between; align-items: center; padding: 6px 10px 8px; border-bottom: 1px solid #e2dbcf; margin-bottom: 4px; }
.bell-menu .bm-h button { border: 0; background: none; color: #5f6447; font-weight: 700; font-size: 12.5px; cursor: pointer; }
.bell-menu .bm-i { border: 0; background: none; width: 100%; text-align: left; display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border-radius: 7px; font-size: 13.5px; cursor: pointer; color: #383232; font-family: inherit; }
.bell-menu .bm-i small { color: #6f6863; font-size: 12.5px; }
.bell-menu .bm-i.unread { background: #e8ede2; }
.bell-menu .bm-i:hover { background: #f2ece4; }
"""
TOOLS_JS = r"""
// Tools: a dropdown of outside links you add in Admin -> Tools. Opens each in a new tab.
const toolsEsc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const toolsUrl = u => /^https?:\/\//i.test(u) ? u : "https://" + u;
document.querySelectorAll(".topnav nav").forEach(nav => {
  const b = document.createElement("button"); b.className = "tools-btn"; b.type = "button"; b.setAttribute("aria-haspopup", "true"); b.setAttribute("aria-expanded", "false"); b.textContent = "Tools ▾";
  const admin = [...nav.querySelectorAll("a")].find(a => a.getAttribute("href") === "admin.html"); nav.insertBefore(b, admin || null);
});
let toolsMenu = null;
function closeTools() { if (toolsMenu) { toolsMenu.remove(); toolsMenu = null; } document.querySelectorAll(".tools-btn").forEach(x => x.setAttribute("aria-expanded", "false")); }
document.addEventListener("click", e => {
  const btn = e.target.closest(".tools-btn");
  if (btn) { const open = btn.getAttribute("aria-expanded") === "true"; closeTools(); if (open) return;
    const r = btn.getBoundingClientRect(), list = HQ.settings.tools;
    toolsMenu = document.createElement("div"); toolsMenu.className = "tools-menu"; toolsMenu.setAttribute("role", "menu");
    toolsMenu.innerHTML = (list.length ? list.map(([n, u]) => `<a role="menuitem" href="${toolsEsc(toolsUrl(u))}" target="_blank" rel="noopener noreferrer">${toolsEsc(n)}<small>${toolsEsc(u.replace(/^https?:\/\//, ""))}</small></a>`).join("") : `<div class="tm-empty">No tools yet. Add the sites you use every day, like the MLS, Skyslope or your lender portal.</div>`)
      + `<div class="tm-foot"><button type="button" data-edittools="1">${list.length ? "Edit tools" : "+ Add a tool"}</button></div>`;
    document.body.appendChild(toolsMenu);
    toolsMenu.style.top = (r.bottom + 4) + "px"; toolsMenu.style.left = Math.max(8, Math.min(r.left, innerWidth - toolsMenu.offsetWidth - 8)) + "px";
    btn.setAttribute("aria-expanded", "true"); return; }
  if (e.target.closest("[data-edittools]")) { closeTools(); show("admin"); const s = document.querySelector('#pg-admin [data-sec="tools"]'); if (s) s.click(); return; }
  if (toolsMenu && e.target.closest(".tools-menu a")) { setTimeout(closeTools); return; }
  if (toolsMenu && !e.target.closest(".tools-menu")) closeTools();
});
document.addEventListener("keydown", e => { if (e.key === "Escape") closeTools(); });
addEventListener("scroll", closeTools, true);

// Bell: @mentions for whoever is viewing (HQ.me). Clicking one opens that person.
document.querySelectorAll(".topnav").forEach(bar => {
  const b = document.createElement("button"); b.className = "bell-btn"; b.type = "button"; b.setAttribute("aria-label", "Notifications"); b.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg><span class="bell-n" hidden></span>';
  bar.appendChild(b);
});
const myNotes = () => HQ.notifications.filter(n => n.to === HQ.me);
function bellBadge() { const n = myNotes().filter(x => !x.read).length; document.querySelectorAll(".bell-n").forEach(x => { x.hidden = !n; x.textContent = n; }); }
let bellMenu = null;
function closeBell() { if (bellMenu) { bellMenu.remove(); bellMenu = null; } }
document.addEventListener("click", e => {
  const btn = e.target.closest(".bell-btn");
  if (btn) { const was = !!bellMenu; closeBell(); closeTools(); if (was) return;
    const r = btn.getBoundingClientRect(), list = myNotes(), team = Object.fromEntries(HQ.settings.team.map(t => [t[0], t[1].split(" ")[0]]));
    bellMenu = document.createElement("div"); bellMenu.className = "tools-menu bell-menu";
    bellMenu.innerHTML = `<div class="bm-h"><b>Notifications</b>${list.some(n => !n.read) ? '<button type="button" data-bellread="1">Mark all read</button>' : ""}</div>` + (list.length ? list.map(n => `<button type="button" class="bm-i ${n.read ? "" : "unread"}" data-bellopen="${n.id}"><span><b>${toolsEsc(team[n.from] || "Someone")}</b> mentioned you on <b>${toolsEsc(n.name)}</b></span><small>${toolsEsc(n.text.length > 120 ? n.text.slice(0, 120) + "…" : n.text)}</small></button>`).join("") : `<div class="tm-empty">Nothing yet. When someone types @${toolsEsc((HQ.settings.team.find(t => t[0] === HQ.me) || ["", "you"])[1].split(" ")[0])} in a note, it shows up here.</div>`);
    document.body.appendChild(bellMenu);
    bellMenu.style.top = (r.bottom + 4) + "px"; bellMenu.style.left = Math.max(8, Math.min(r.right - bellMenu.offsetWidth, innerWidth - bellMenu.offsetWidth - 8)) + "px"; return; }
  const op = e.target.closest("[data-bellopen]");
  if (op) { const n = HQ.notifications.find(x => String(x.id) === op.dataset.bellopen); closeBell(); if (n) { n.read = true; show("deals", "#contact-" + n.cid); } bellBadge(); return; }
  if (e.target.closest("[data-bellread]")) { myNotes().forEach(n => n.read = true); closeBell(); bellBadge(); return; }
  if (bellMenu && !e.target.closest(".bell-menu")) closeBell();
  setTimeout(bellBadge);
});
addEventListener("scroll", closeBell, true);
"""

if __name__ == "__main__":
    main(sys.argv[1])
