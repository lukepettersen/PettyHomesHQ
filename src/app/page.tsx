import { requireUser } from "@/server/auth";
import { hasPermission } from "@/server/permissions";
import { TopBar } from "@/components/TopBar";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireUser();
  return (
    <>
      <TopBar name={user.name} />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-extrabold">Welcome, {user.name.split(" ")[0]}</h1>
        <p className="mt-2 text-muted">
          You&apos;re signed in as {user.email} ({user.role}
          {user.isOwner ? ", owner" : ""}). {hasPermission(user.permissions, "seeCommissions") ? "You can see commissions." : "Commissions are hidden for your role."}
        </p>
        <div className="mt-8 rounded-xl border border-misty bg-white p-6">
          <h2 className="font-bold">HQ is being built</h2>
          <p className="mt-1 text-sm text-muted">
            Phase 0 is done when you and Alyssa can sign in and nobody else can. People, Tasks and Admin arrive in Phase 1.
          </p>
        </div>
      </main>
    </>
  );
}
