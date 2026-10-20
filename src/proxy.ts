import { withAuth } from "next-auth/middleware";
import { signInStillGood } from "@/lib/session";

// Every page needs a signed-in team member, except sign-in itself, the auth callbacks, the
// health check Railway uses, and Twilio's webhooks (which prove themselves with Twilio's signature).
export default withAuth({ pages: { signIn: "/login" }, callbacks: { authorized: ({ token }) => signInStillGood(token) } });

export const config = {
  matcher: ["/((?!login|api/auth|api/health|api/twilio|_next/static|_next/image|favicon.ico|logo-mark.svg|icon|apple-icon|manifest.webmanifest).*)"],
};
