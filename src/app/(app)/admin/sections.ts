// Admin's groups and pages (owner-approved redesign 2026-10-29): plain names and a one-line "what it does", shared by
// the Admin home page and the side menu. `need` is what someone must be allowed to do to open it.
export type Can = { settings: boolean; templates: boolean; trash: boolean; messages: boolean; owner: boolean };
export type AdminItem = { label: string; href: string; desc: string; need?: keyof Can; also?: string[] };
export type AdminGroup = { name: string; icon: string; blurb: string; items: AdminItem[] };

export const ADMIN_GROUPS: AdminGroup[] = [
  { name: "Team", icon: "👥", blurb: "Who can sign in and what they can do.", items: [
    { label: "Users & permissions", href: "/admin/users", desc: "Invite people, set roles, choose what each role can do" },
    { label: "Activity", href: "/admin/activity", desc: "What everyone changed, by day", need: "owner" },
    { label: "Trash", href: "/admin/trash", desc: "Restore deleted people, deals and tasks", need: "trash" },
  ] },
  { name: "Connections", icon: "🔌", blurb: "Outside services HQ uses.", items: [
    { label: "Integrations", href: "/admin/integrations", desc: "Google (calendar, email, sheet), texting & calls, file storage" },
  ] },
  { name: "Texts & emails", icon: "💬", blurb: "What you send and when.", items: [
    { label: "Templates", href: "/admin/messages", desc: "Text and email templates, by folder", need: "messages" },
    { label: "Calendar invites", href: "/admin/calendar", desc: "Which contract dates send calendar invites" },
    { label: "Appointment types", href: "/admin/appointments", desc: "Phone call, consults, showing and your own" },
  ] },
  { name: "Deals", icon: "🏡", blurb: "How buyer and seller deals move.", items: [
    { label: "Pipeline stages", href: "/admin/statuses", desc: "Buyer, seller and Under Contract columns" },
    { label: "Checklists", href: "/admin/templates", desc: "Task templates that fill in each deal, with automatic texts and emails", need: "templates" },
    { label: "Deal questions", href: "/admin/file-forms", desc: "Buyer and seller forms, and the purchase agreement", also: ["/admin/forms"] },
  ] },
  { name: "Contacts", icon: "📇", blurb: "How people are organized.", items: [
    { label: "Stages, sources & follow-up", href: "/admin/lists", desc: "Lead, Sphere, Past Client… where people came from" },
    { label: "Tags", href: "/admin/tags", desc: "Rename, merge or delete tags" },
    { label: "Custom fields", href: "/admin/fields", desc: "Extra fields on every contact" },
    { label: "Date reminders", href: "/admin/reminders", desc: "Birthday and homeiversary tasks" },
  ] },
  { name: "Data & tools", icon: "📦", blurb: "Bringing data in, and shortcuts.", items: [
    { label: "Import from Follow Up Boss", href: "/admin/import", desc: "Contacts, notes, texts and templates" },
    { label: "Tools menu", href: "/admin/tools", desc: "Links in the Tools menu (MLS, Slack, Gmail…)" },
  ] },
];

/** The groups with only the pages this person can open (empty groups dropped). */
export const visibleGroups = (can: Can) => ADMIN_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => can[i.need ?? "settings"]) })).filter((g) => g.items.length);
