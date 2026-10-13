// Permission keys. Roles (editable in Admin) hold a list of these. See SPEC.md §2.
export const PERMISSIONS = {
  seeCommissions: "See commissions",
  deleteRecords: "Delete people and deals",
  manageUsers: "Manage users and roles",
  editTaskTemplates: "Edit task templates",
  editMessageTemplates: "Edit text and email templates",
  exportData: "Export data",
  sendTexts: "Send texts",
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const DEFAULT_ROLES: Record<string, Permission[]> = {
  Admin: ALL_PERMISSIONS,
  Assistant: ["editTaskTemplates", "editMessageTemplates", "sendTexts"],
};

export function hasPermission(perms: readonly string[] | undefined, perm: Permission): boolean {
  return !!perms?.includes(perm);
}
