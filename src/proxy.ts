import { withAuth } from "next-auth/middleware";
import { signInStillGood } from "@/lib/session";

// Every page needs a signed-in team member, except sign-in itself, the auth callbacks and the
// health check Railway uses.
export default withAuth({ pages: { signIn: "/login" }, callbacks: { authorized: ({ token }) => signInStillGood(token) } });

export const config = {
  matcher: ["/((?!login|api/auth|api/health|_next/static|_next/image|favicon.ico|logo-mark.svg|icon|apple-icon|manifest.webmanifest).*)"],
};
