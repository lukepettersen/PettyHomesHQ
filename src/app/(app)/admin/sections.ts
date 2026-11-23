// Admin's groups and pages (owner-approved redesign 2026-10-29; regrouped into five the same day): plain names and a one-line "what it does", shared by
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
  // Features (owner request 2026-11-23): everything HQ does by itself, in one place.
  { name: "Features", icon: "⚙️", blurb: "Things HQ does on its own: reports, showing emails, checklists and reminders.", items: [
    { label: "Weekly emails", href: "/admin/weekly-emails", desc: "Contingency deadlines, closings and listings reports, emailed every week", also: ["/admin/deadline-email"] },
    { label: "Showing emails", href: "/admin/showings", desc: "ShowingTime emails: is HQ reading Gmail, and what it did with each one" },
    { label: "Checklists", href: "/admin/templates", desc: "Task templates that fill in each deal, with automatic texts and emails", need: "templates" },
    { label: "Paperwork steps", href: "/admin/paperwork", desc: "Step-by-step instructions for each Request paperwork form, and your own forms", need: "templates" },
    { label: "Date reminders", href: "/admin/reminders", desc: "Birthday and homeiversary tasks" },
    { label: "Calendar invites", href: "/admin/calendar", desc: "Which contract dates go on the calendar, and who's invited" },
  ] },
  { name: "Texts & emails", icon: "💬", blurb: "Templates for messages you send.", items: [
    { label: "Text templates", href: "/admin/text-templates", desc: "Texts to pick from, by folder", need: "messages" },
    { label: "Email templates", href: "/admin/email-templates", desc: "Emails to pick from, by folder, and mass email kinds", need: "messages" },
  ] },
  { name: "Deals", icon: "🏡", blurb: "How buyer and seller deals move.", items: [
    { label: "Pipeline stages", href: "/admin/statuses", desc: "Buyer, seller and Under Contract columns" },
    { label: "Deal questions", href: "/admin/file-forms", desc: "Buyer and seller forms, and the purchase agreement", also: ["/admin/forms"] },
  ] },
  { name: "Contacts", icon: "📇", blurb: "How people are organized.", items: [
    { label: "Stages, sources & follow-up", href: "/admin/lists", desc: "Lead, Sphere, Past Client… where people came from" },
    { label: "Tags", href: "/admin/tags", desc: "Rename, merge or delete tags" },
    { label: "Custom fields", href: "/admin/fields", desc: "Extra fields on every contact" },
    { label: "Appointment types", href: "/admin/appointments", desc: "Phone call, consults, showing and your own" },
  ] },
  { name: "Connections", icon: "🔌", blurb: "Outside services HQ is connected to.", items: [
    { label: "Integrations", href: "/admin/integrations", desc: "Google (calendar, email), texting & calls, website leads, file storage, Claude app" },
  ] },
  { name: "Import & layout", icon: "🧭", blurb: "Bringing data in, and how HQ's menus look.", items: [
    { label: "Import from Follow Up Boss", href: "/admin/import", desc: "Contacts, notes, texts and templates" },
    { label: "Import address list", href: "/admin/address-list", desc: "A spreadsheet of names and addresses (holiday cards), matched to people already in HQ" },
    { label: "Tools menu", href: "/admin/tools", desc: "Links in the Tools menu (MLS, Slack, Gmail…)" },
    { label: "Top bar", href: "/admin/topbar", desc: "The order of the tabs at the top (Whiteboard, Tasks, People…)" },
  ] },
];

/** The groups with only the pages this person can open (empty groups dropped). */
export const visibleGroups = (can: Can) => ADMIN_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => can[i.need ?? "settings"]) })).filter((g) => g.items.length);
