import { db } from "@/server/db";
import { PERMISSIONS } from "@/server/permissions";
import { TeamClient } from "./TeamClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [users, roles] = await Promise.all([db.user.findMany({ orderBy: [{ isOwner: "desc" }, { name: "asc" }] }), db.role.findMany({ orderBy: { name: "asc" } })]);
  return (
    <>
      <h1 className="text-2xl font-extrabold">Users &amp; roles</h1>
      <p className="mb-4 mt-1 text-sm muted">Only people listed here, with a pettyhomes.com Google account, can sign in. New people show as Invited until their first sign-in.</p>
      <TeamClient
        users={users.map((u) => ({ id: u.id, name: u.name, email: u.email, roleId: u.roleId, disabled: u.status === "DISABLED", status: u.status, isOwner: u.isOwner }))}
        roles={roles.map((r) => ({ id: r.id, name: r.name, permissions: r.permissions }))}
        permissions={Object.entries(PERMISSIONS)} />
    </>
  );
}
