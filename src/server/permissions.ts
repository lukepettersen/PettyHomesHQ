// Permission keys. Roles (editable in Admin) hold a list of these. See SPEC.md §2.
export const PERMISSIONS = {
  seeCommissions: "See commissions",
  deleteRecords: "Delete people and deals",
  manageUsers: "Manage users and roles",
  editTaskTemplates: "Edit checklists",
  editMessageTemplates: "Edit text and email templates",
  exportData: "Export data",
  sendTexts: "Send texts",
} as const;

/** One line under each permission on Admin → Users & permissions (owner-approved redesign 2026-10-29). */
export const PERMISSION_HELP: Record<keyof typeof PERMISSIONS, string> = {
  seeCommissions: "Commission % and BAC on deals and in exports",
  deleteRecords: "Move people, deals and tasks to Trash, and restore them",
  manageUsers: "This page, plus most Admin settings",
  editTaskTemplates: "Admin → Checklists (task templates and automatic texts/emails)",
  editMessageTemplates: "Admin → Text & email templates",
  exportData: "Download contacts as a spreadsheet (CSV)",
  sendTexts: "Text and call from their own HQ number",
};

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const DEFAULT_ROLES: Record<string, Permission[]> = {
  Admin: ALL_PERMISSIONS,
  Assistant: ["seeCommissions", "editTaskTemplates", "editMessageTemplates", "sendTexts"],
};

export function hasPermission(perms: readonly string[] | undefined, perm: Permission): boolean {
  return !!perms?.includes(perm);
}
