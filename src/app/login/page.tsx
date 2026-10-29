import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth";
import { Logo } from "@/components/Logo";
import { SignInButton } from "./SignInButton";

const ERRORS: Record<string, string> = {
  AccessDenied: "That Google account isn't on the Petty Homes team. Sign in with your @pettyhomes.com account, or ask Luke to add you in Admin → Users & permissions.",
  Default: "Sign-in didn't work. Try again.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) redirect("/");
  const { error } = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-misty bg-white p-8 text-center shadow-sm">
        <div className="mb-4 flex items-center justify-center gap-2 text-moss">
          <Logo className="h-9 w-6" />
          <span className="text-lg font-extrabold tracking-wide text-charcoal">PETTY HOMES <span className="rounded bg-misty px-1.5 text-sm">HQ</span></span>
        </div>
        <p className="mb-6 text-sm text-muted">Team sign-in with your pettyhomes.com Google account.</p>
        {error && (
          <p role="alert" className="mb-4 rounded-md bg-red-50 p-3 text-left text-sm text-bad">
            {ERRORS[error] ?? ERRORS.Default}
          </p>
        )}
        <SignInButton />
      </div>
    </main>
  );
}
