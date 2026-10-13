"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SaveBar } from "@/components/SaveBar";
import { saveTeam } from "../actions";

type U = { id?: string; name: string; email: string; roleId: string; disabled: boolean; status?: string; isOwner?: boolean };
type R = { id?: string; name: string; permissions: string[] };

export function TeamClient({ users, roles, permissions }: { users: U[]; roles: R[]; permissions: [string, string][] }) {
  const [us, setUs] = useState(users);
  const [rs, setRs] = useState(roles);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const dirty = JSON.stringify([us, rs]) !== JSON.stringify([users, roles]);
  const roleKey = (r: R, i: number) => r.id ?? `new:${i}`;
  const setU = (i: number, patch: Partial<U>) => setUs(us.map((u, j) => (j === i ? { ...u, ...patch } : u)));

  return (
    <>
      <section className="card mb-4 overflow-x-auto">
        <div className="border-b border-misty px-4 py-3"><h2 className="font-bold">Users</h2></div>
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide muted"><tr><th className="px-4 py-2">Name</th><th className="px-4 py-2">Email</th><th className="px-4 py-2">Role</th><th className="px-4 py-2">Status</th><th /></tr></thead>
          <tbody>
            {us.map((u, i) => (
              <tr key={u.id ?? `n${i}`} className={`border-t border-misty/60 ${u.disabled ? "opacity-50" : ""}`}>
                <td className="px-4 py-2"><input className="input" value={u.name} aria-label="Name" onChange={(e) => setU(i, { name: e.target.value })} /></td>
                <td className="px-4 py-2"><input className="input" value={u.email} aria-label="Email" disabled={u.isOwner} onChange={(e) => setU(i, { email: e.target.value })} /></td>
                <td className="px-4 py-2">
                  <select className="input" value={u.roleId} aria-label="Role" disabled={u.isOwner} onChange={(e) => setU(i, { roleId: e.target.value })}>
                    {rs.map((r, j) => <option key={roleKey(r, j)} value={roleKey(r, j)}>{r.name}</option>)}
                  </select>
                </td>
                <td className="px-4 py-2"><span className="chip">{u.disabled ? "Removed" : u.isOwner ? "Owner" : u.status === "ACTIVE" ? "Active" : "Invited"}</span></td>
                <td className="px-4 py-2 text-right">
                  {!u.isOwner && (u.id
                    ? <button type="button" className="btn" onClick={() => setU(i, { disabled: !u.disabled })}>{u.disabled ? "Restore" : "Remove"}</button>
                    : <button type="button" className="btn text-bad" aria-label="Cancel invite" onClick={() => setUs(us.filter((_, j) => j !== i))}>×</button>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t border-misty px-4 py-3">
          <button type="button" className="btn" onClick={() => setUs([...us, { name: "", email: "", roleId: roleKey(rs.find((r) => r.name === "Assistant") ?? rs[0], rs.findIndex((r) => r.name === "Assistant")), disabled: false }])}>+ Invite user</button>
        </div>
      </section>

      <section className="card mb-4 overflow-x-auto">
        <div className="border-b border-misty px-4 py-3"><h2 className="font-bold">Roles and permissions</h2><p className="text-sm muted">The owner&apos;s role always keeps every permission.</p></div>
        <table className="w-full min-w-[520px] text-sm">
          <thead><tr><th className="px-4 py-2 text-left text-xs uppercase tracking-wide muted">Permission</th>
            {rs.map((r, j) => (
              <th key={roleKey(r, j)} className="px-2 py-2">
                <div className="flex items-center gap-1">
                  <input className="input text-center font-bold" value={r.name} aria-label="Role name" onChange={(e) => setRs(rs.map((x, k) => (k === j ? { ...x, name: e.target.value } : x)))} />
                  {!us.some((u) => u.roleId === roleKey(r, j)) && <button type="button" className="muted hover:text-bad" aria-label={`Remove role ${r.name}`} onClick={() => setRs(rs.filter((_, k) => k !== j))}>×</button>}
                </div>
              </th>
            ))}
          </tr></thead>
          <tbody>
            {permissions.map(([key, label]) => (
              <tr key={key} className="border-t border-misty/60">
                <td className="px-4 py-2">{label}</td>
                {rs.map((r, j) => (
                  <td key={roleKey(r, j)} className="px-2 py-2 text-center">
                    <input type="checkbox" aria-label={`${r.name}: ${label}`} checked={r.permissions.includes(key)}
                      onChange={(e) => setRs(rs.map((x, k) => (k === j ? { ...x, permissions: e.target.checked ? [...x.permissions, key] : x.permissions.filter((p) => p !== key) } : x)))} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t border-misty px-4 py-3"><button type="button" className="btn" onClick={() => setRs([...rs, { name: "New role", permissions: [] }])}>+ Add role</button></div>
      </section>

      <SaveBar dirty={dirty} pending={pending} error={error}
        onDiscard={() => { setUs(users); setRs(roles); setError(""); }}
        onSave={() => start(async () => {
          setError("");
          const r = await saveTeam({ users: us.map(({ id, name, email, roleId, disabled }) => ({ id, name, email, roleId, disabled })), roles: rs });
          if (!r.ok) setError(r.error); else router.refresh();
        })} />
    </>
  );
}
