import { requireUser } from "@/server/auth";
import { TopBar } from "@/components/TopBar";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireUser();
  return (
    <>
      <TopBar name={user.name} />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-extrabold">Welcome, {user.name.split(" ")[0]}</h1>
        <div className="mt-8 rounded-xl border border-misty bg-white p-6">
          <h2 className="font-bold">HQ is being built</h2>
          <p className="mt-1 text-sm text-muted">People, Tasks and Admin are coming next.</p>
        </div>
      </main>
    </>
  );
}
