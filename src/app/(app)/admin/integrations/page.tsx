import { adminGate } from "../gate";
import { integrationStatus, textingEnabled } from "@/server/integrations";
import { TextingSwitch } from "./TextingSwitch";

export const dynamic = "force-dynamic";

export default async function Page() {
  const denied = await adminGate();
  if (denied) return denied;
  const [list, texting] = [integrationStatus(), await textingEnabled()];
  return (
    <>
      <h1 className="text-2xl font-extrabold">Integrations</h1>
      <p className="mb-4 mt-1 text-sm muted">
        Connect other platforms by adding their keys in <b>Railway → your HQ app → Variables</b>. Railway restarts HQ, and the platform shows as Connected here.
        Keys are never shown here, never stored in HQ&apos;s database, and should never be sent in chat or email.
      </p>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {list.map((i) => (
          <section key={i.id} className="card flex flex-col gap-3 p-4" aria-labelledby={`int-${i.id}`}>
            <div className="flex items-start justify-between gap-2">
              <h2 id={`int-${i.id}`} className="font-bold">{i.name}</h2>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${i.connected ? "bg-accent-soft text-accent" : "bg-sunken text-muted"}`}>{i.connected ? "Connected" : "Not connected"}</span>
            </div>
            <p className="text-sm">{i.what}</p>
            {i.detail && <p className="text-sm muted">Number: {i.detail}</p>}
            {i.id === "texting" && <TextingSwitch connected={i.connected} on={texting} />}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider muted">{i.connected ? "Railway variables (all set)" : "Add in Railway → Variables"}</h3>
              <ul className="mt-1 flex flex-col gap-1 text-sm">
                {i.vars.map((v) => (
                  <li key={v.name} className="flex flex-wrap items-baseline gap-x-2">
                    <span aria-hidden="true" className={i.missing.includes(v.name) ? "text-rabbit" : "text-accent"}>{i.missing.includes(v.name) ? "○" : "✓"}</span>
                    <code className="rounded bg-sunken px-1.5 text-[12.5px]">{v.name}</code>
                    <span className="sr-only">{i.missing.includes(v.name) ? "not set" : "set"}</span>
                    <span className="text-xs muted">{v.help}</span>
                  </li>
                ))}
              </ul>
            </div>
            {i.note && <p className="text-xs muted">{i.note}</p>}
          </section>
        ))}
      </div>
      <p className="mt-4 text-xs muted">Coming later: a website lead form that sends WordPress sign-ups straight into HQ.</p>
    </>
  );
}
