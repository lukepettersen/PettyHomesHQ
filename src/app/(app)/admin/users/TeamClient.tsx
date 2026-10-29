"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SaveBar } from "@/components/SaveBar";
import { saveTeam } from "../actions";

type U = { id?: string; name: string; email: string; roleId: string; disabled: boolean; status?: string; isOwner?: boolean };
type R = { id?: string; name: string; permissions: string[] };

const initials = (n: string) => n.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";

/** Users & permissions (owner-approved redesign 2026-10-29): people as rows, permissions as switches with a line each. */
export function TeamClient({ users, roles, permissions }: { users: U[]; roles: R[]; permissions: [string, string, string][] }) {
  const [us, setUs] = useState(users);
  const [rs, setRs] = useState(roles);
  const [editing, setEditing] = useState<number[]>([]); // rows whose name/email are open to edit
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const dirty = JSON.stringify([us, rs]) !== JSON.stringify([users, roles]);
  const roleKey = (r: R, i: number) => r.id ?? `new:${i}`;
  const setU = (i: number, patch: Partial<U>) => setUs(us.map((u, j) => (j === i ? { ...u, ...patch } : u)));
  const toggle = (j: number, key: string, on: boolean) => setRs(rs.map((x, k) => (k === j ? { ...x, permissions: on ? [...x.permissions, key] : x.permissions.filter((p) => p !== key) } : x)));
  const invite = () => { setEditing([...editing, us.length]); setUs([...us, { name: "", email: "", roleId: roleKey(rs.find((r) => r.name === "Assistant") ?? rs[0], Math.max(0, rs.findIndex((r) => r.name === "Assistant"))), disabled: false }]); };

  return (
    <>
      <div className="mb-2 flex justify-end"><button type="button" className="btn btn-primary" onClick={invite}>+ Invite someone</button></div>
      <section aria-label="People" className="card mb-6">
        {us.map((u, i) => {
          const open = editing.includes(i) || !u.id;
          const badge = u.disabled ? ["Removed", "bg-sunken muted"] : u.isOwner ? ["Owner", "bg-accent-soft text-accent"] : u.status === "ACTIVE" ? ["Active", "bg-accent-soft text-accent"] : ["Invited", "bg-[#fbefd6] text-[#9a6400]"];
          return (
            <div key={u.id ?? `n${i}`} className={`flex flex-wrap items-center gap-3 border-t border-misty px-4 py-3 first:border-0 ${u.disabled ? "opacity-50" : ""}`}>
              <span aria-hidden="true" className="grid h-10 w-10 flex-none place-items-center rounded-full bg-accent-soft font-extrabold text-accent">{initials(u.name)}</span>
              {open ? (
                <span className="flex min-w-0 flex-1 flex-wrap gap-2">
                  <input className="input min-w-[160px] flex-1" value={u.name} aria-label="Name" placeholder="Full name" onChange={(e) => setU(i, { name: e.target.value })} />
                  <input className="input min-w-[200px] flex-1" value={u.email} aria-label="Email" placeholder="name@pettyhomes.com" disabled={u.isOwner} onChange={(e) => setU(i, { email: e.target.value })} />
                </span>
              ) : (
                <span className="min-w-0 flex-1"><b className="block">{u.name}</b><span className="block truncate text-sm muted">{u.email}</span></span>
              )}
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${badge[1]}`}>{badge[0]}</span>
              <select className="input w-auto font-semibold" value={u.roleId} aria-label={`Role for ${u.name || "new person"}`} disabled={u.isOwner} onChange={(e) => setU(i, { roleId: e.target.value })}>
                {rs.map((r, j) => <option key={roleKey(r, j)} value={roleKey(r, j)}>{r.name}</option>)}
              </select>
              <span className="flex gap-1">
                {u.id && !open && <button type="button" className="btn" onClick={() => setEditing([...editing, i])}>Edit</button>}
                {!u.isOwner && (u.id
                  ? <button type="button" className="btn" onClick={() => setU(i, { disabled: !u.disabled })}>{u.disabled ? "Restore" : "Remove"}</button>
                  : <button type="button" className="btn text-bad" aria-label="Cancel invite" onClick={() => setUs(us.filter((_, j) => j !== i))}>×</button>)}
              </span>
            </div>
          );
        })}
      </section>

      <h2 className="text-[17px] font-bold">What each role can do</h2>
      <p className="mb-2 text-sm muted">The owner can always do everything. Rename a role by clicking its name.</p>
      <section aria-label="Roles and permissions" className="card mb-4 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead><tr className="text-left">
            <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wide muted">Permission</th>
            {rs.map((r, j) => (
              <th key={roleKey(r, j)} className="px-2 py-2">
                <span className="flex items-center gap-1">
                  <input className="w-28 rounded-md border border-transparent bg-transparent px-1.5 py-1 font-bold hover:border-misty focus:border-misty" value={r.name} aria-label="Role name" onChange={(e) => setRs(rs.map((x, k) => (k === j ? { ...x, name: e.target.value } : x)))} />
                  {!us.some((u) => u.roleId === roleKey(r, j)) && <button type="button" className="muted hover:text-bad" aria-label={`Remove role ${r.name}`} onClick={() => setRs(rs.filter((_, k) => k !== j))}>×</button>}
                </span>
              </th>
            ))}
          </tr></thead>
          <tbody>
            {permissions.map(([key, label, help]) => (
              <tr key={key} className="border-t border-misty">
                <td className="px-4 py-2.5"><b className="block">{label}</b><span className="block text-xs muted">{help}</span></td>
                {rs.map((r, j) => {
                  const on = r.permissions.includes(key);
                  return (
                    <td key={roleKey(r, j)} className="px-2 py-2.5">
                      <button type="button" role="switch" aria-checked={on} aria-label={`${r.name}: ${label}`} onClick={() => toggle(j, key, !on)}
                        className={`relative inline-block h-5 w-9 rounded-full transition-colors ${on ? "bg-moss" : "bg-misty"}`}>
                        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t border-misty px-4 py-3"><button type="button" className="btn" onClick={() => setRs([...rs, { name: "New role", permissions: [] }])}>+ Add role</button></div>
      </section>

      <SaveBar dirty={dirty} pending={pending} error={error}
        onDiscard={() => { setUs(users); setRs(roles); setEditing([]); setError(""); }}
        onSave={() => start(async () => {
          setError("");
          const r = await saveTeam({ users: us.map(({ id, name, email, roleId, disabled }) => ({ id, name, email, roleId, disabled })), roles: rs });
          if (!r.ok) setError(r.error); else { setEditing([]); router.refresh(); }
        })} />
    </>
  );
}
