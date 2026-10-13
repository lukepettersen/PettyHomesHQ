import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth";
import { hasPermission } from "@/server/permissions";

export default async function Page() {
  const user = await requireUser();
  redirect(hasPermission(user.permissions, "manageUsers") ? "/admin/users" : hasPermission(user.permissions, "editTaskTemplates") ? "/admin/templates" : "/admin/users");
}
